import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";

interface Tool {
  name: string;
  description: string;
  input_schema: any;
}

const tools: Tool[] = [
  {
    name: "create_transaction",
    description: "Create a new transaction (income or expense) for the user. Use this when user says they spent money, earned money, received profit, or wants to log a transaction. IMPORTANT: When using this tool, do NOT also call get_financial_overview or get_spending_summary — just create the transaction and confirm it briefly.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Whether this is income or expense"
        },
        amount: {
          type: "number",
          description: "Transaction amount in PKR"
        },
        category: {
          type: "string",
          description: "Category name in English (e.g. Groceries, Transport, Salary)"
        },
        description: {
          type: "string",
          description: "Brief description of the transaction"
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format. Use today's date if not specified."
        }
      },
      required: ["type", "amount", "category"]
    }
  },
  {
    name: "get_recent_transactions",
    description: "Get user's recent transactions with details of which family member added each one. Use this when user asks about their spending, recent purchases, last transactions, or wants to see activity.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to fetch (default 10, max 50)"
        },
        type: {
          type: "string",
          enum: ["income", "expense", "all"],
          description: "Filter by transaction type"
        },
        category: {
          type: "string",
          description: "Filter by category name (optional, e.g. 'Groceries', 'Transport')"
        }
      }
    }
  },
  {
    name: "get_spending_summary",
    description: "Get a complete summary of spending AND income by category, with per-member breakdown. Use when user asks about budget, spending patterns, savings, where money goes, who spends most, etc.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default 30)"
        }
      }
    }
  },
  {
    name: "get_financial_overview",
    description: "Get a complete financial overview: total income, expenses, net balance, family members, top categories, and recent activity. Use ONLY when user explicitly asks for a summary/overview like 'how are my finances?', 'give me a summary', 'how much have I saved?'. Do NOT use this after creating a transaction.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default 30)"
        }
      }
    }
  },
  {
    name: "get_member_spending",
    description: "Get a per-member breakdown of spending and income. Use when user asks 'who spends the most?', 'who earns the most?', 'how much did [member] spend?', or any comparison between family members.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default 30)"
        }
      }
    }
  }
];

async function executeToolCall(toolName: string, toolInput: any, userId: string) {
  const supabase = createServiceClient();

  const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

  if (setupError || !profile || !account) {
    return { error: `Setup failed: ${setupError || "Unknown error"}` };
  }

  // Helper: build profile name map for member attribution
  async function buildMemberMap() {
    const { data: memberRows } = await supabase
      .from("account_members")
      .select("profile_id, role, invited_email, accepted")
      .eq("account_id", account!.id);

    const memberProfileIds = (memberRows || []).map((m: any) => m.profile_id).filter(Boolean);
    const profileMap: Record<string, string> = {};

    if (memberProfileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds);
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p.full_name || p.email || "Unknown";
        }
      }
    }

    const members = (memberRows || []).map((m: any) => ({
      name: m.profile_id ? (profileMap[m.profile_id] || "Unknown") : (m.invited_email || "Pending"),
      role: m.role,
      accepted: m.accepted,
      profileId: m.profile_id,
    }));

    return { members, profileMap };
  }

  switch (toolName) {
    case "create_transaction": {
      let categoryId: string | null = null;
      const categoryName = toolInput.category || "Other";
      
      const { data: categories } = await supabase
        .from("categories")
        .select("id, name_en")
        .eq("is_default", true);

      if (categories) {
        const match = categories.find(
          (c) => c.name_en.toLowerCase().includes(categoryName.toLowerCase()) ||
                 categoryName.toLowerCase().includes(c.name_en.toLowerCase())
        );
        categoryId = match?.id || categories.find((c) => c.name_en === "Other")?.id || null;
      }

      const { error } = await supabase.from("transactions").insert({
        account_id: account.id,
        type: toolInput.type,
        amount: toolInput.amount,
        category_id: categoryId,
        description_en: toolInput.description || "",
        transaction_date: toolInput.date || new Date().toISOString().split("T")[0],
        added_by: profile.id,
        source: "auto",
      });

      if (error) {
        return { error: `Failed to create transaction: ${error.message}` };
      }

      return {
        success: true,
        message: `Transaction created: ${toolInput.type} of PKR ${toolInput.amount} for ${categoryName}`,
        transaction: toolInput
      };
    }

    case "get_recent_transactions": {
      const { profileMap } = await buildMemberMap();

      let query = supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en), description_en, transaction_date, source, added_by")
        .eq("account_id", account.id)
        .order("transaction_date", { ascending: false })
        .limit(Math.min(toolInput.limit || 10, 50));

      if (toolInput.type && toolInput.type !== "all") {
        query = query.eq("type", toolInput.type);
      }

      const { data: transactions } = await query;

      // Filter by category if specified
      let filtered = transactions || [];
      if (toolInput.category) {
        const catLower = toolInput.category.toLowerCase();
        filtered = filtered.filter((t: any) =>
          (t.categories?.name_en || "Other").toLowerCase().includes(catLower)
        );
      }

      return {
        success: true,
        transactions: filtered.map((t: any) => ({
          type: t.type,
          amount: t.amount,
          category: t.categories?.name_en || "Other",
          description: t.description_en || "",
          date: t.transaction_date,
          addedBy: t.added_by ? (profileMap[t.added_by] || profile.full_name || "User") : (profile.full_name || "User"),
          source: t.source || "manual",
        })),
        count: filtered.length
      };
    }

    case "get_spending_summary": {
      const { members, profileMap } = await buildMemberMap();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (toolInput.days || 30));

      const { data: summaryData } = await supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en), added_by")
        .eq("account_id", account.id)
        .gte("transaction_date", daysAgo.toISOString().split("T")[0]);

      const expenses = summaryData?.filter((t: any) => t.type === "expense") || [];
      const income = summaryData?.filter((t: any) => t.type === "income") || [];

      const totalExpense = expenses.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const totalIncome = income.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Expense category breakdown
      const expenseByCategory: Record<string, number> = {};
      for (const t of expenses) {
        const catName = (t as any).categories?.name_en || "Other";
        expenseByCategory[catName] = (expenseByCategory[catName] || 0) + Number(t.amount);
      }

      // Income category breakdown
      const incomeByCategory: Record<string, number> = {};
      for (const t of income) {
        const catName = (t as any).categories?.name_en || "Other";
        incomeByCategory[catName] = (incomeByCategory[catName] || 0) + Number(t.amount);
      }

      // Per-member breakdown
      const memberSpending: Record<string, { expense: number; income: number; name: string }> = {};
      for (const t of summaryData || []) {
        const memberId = (t as any).added_by || "unknown";
        const memberName = memberId !== "unknown" ? (profileMap[memberId] || "Unknown") : (profile.full_name || "User");
        if (!memberSpending[memberName]) {
          memberSpending[memberName] = { expense: 0, income: 0, name: memberName };
        }
        memberSpending[memberName][t.type as "income" | "expense"] += Number(t.amount);
      }

      return {
        success: true,
        summary: {
          period_days: toolInput.days || 30,
          total_expense: totalExpense,
          total_income: totalIncome,
          net_savings: totalIncome - totalExpense,
          transaction_count: summaryData?.length || 0,
          expense_by_category: expenseByCategory,
          income_by_category: incomeByCategory,
          member_breakdown: Object.values(memberSpending),
          family_members: members.map((m) => `${m.name} (${m.role})`),
        }
      };
    }

    case "get_financial_overview": {
      const { members, profileMap } = await buildMemberMap();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (toolInput.days || 30));

      // Period transactions
      const { data: allTx } = await supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en), description_en, transaction_date, added_by")
        .eq("account_id", account.id)
        .gte("transaction_date", daysAgo.toISOString().split("T")[0])
        .order("transaction_date", { ascending: false });

      // ALL-TIME balance (no date filter — matches dashboard "Current Balance")
      const { data: allTimeTx } = await supabase
        .from("transactions")
        .select("type, amount")
        .eq("account_id", account.id);

      const allTimeIncome = (allTimeTx || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const allTimeExpense = (allTimeTx || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const allTimeBalance = allTimeIncome - allTimeExpense;

      const txList = allTx || [];
      const totalIncome = txList.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalExpense = txList.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

      // Top expense categories
      const catTotals: Record<string, number> = {};
      for (const t of txList.filter((t: any) => t.type === "expense")) {
        const cat = (t as any).categories?.name_en || "Other";
        catTotals[cat] = (catTotals[cat] || 0) + Number(t.amount);
      }
      const topExpenseCategories = Object.entries(catTotals)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([cat, amt]) => ({ category: cat, amount: amt }));

      // Top income categories
      const incomeCatTotals: Record<string, number> = {};
      for (const t of txList.filter((t: any) => t.type === "income")) {
        const cat = (t as any).categories?.name_en || "Other";
        incomeCatTotals[cat] = (incomeCatTotals[cat] || 0) + Number(t.amount);
      }
      const topIncomeCategories = Object.entries(incomeCatTotals)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([cat, amt]) => ({ category: cat, amount: amt }));

      // Last 5 transactions
      const recentTx = txList.slice(0, 5).map((t: any) => ({
        type: t.type,
        amount: Number(t.amount),
        category: t.categories?.name_en || "Other",
        description: t.description_en || "",
        date: t.transaction_date,
        addedBy: t.added_by ? (profileMap[t.added_by] || "User") : (profile.full_name || "User"),
      }));

      // Per-member totals
      const memberTotals: Record<string, { expense: number; income: number }> = {};
      for (const t of txList) {
        const name = (t as any).added_by ? (profileMap[(t as any).added_by] || "Unknown") : (profile.full_name || "User");
        if (!memberTotals[name]) memberTotals[name] = { expense: 0, income: 0 };
        memberTotals[name][(t as any).type as "income" | "expense"] += Number((t as any).amount);
      }

      return {
        success: true,
        overview: {
          account_name: account.name,
          period_days: toolInput.days || 30,
          period_income: totalIncome,
          period_expense: totalExpense,
          period_net_cash_flow: totalIncome - totalExpense,
          all_time_income: allTimeIncome,
          all_time_expense: allTimeExpense,
          all_time_balance: allTimeBalance,
          savings_rate: totalIncome > 0 ? `${((totalIncome - totalExpense) / totalIncome * 100).toFixed(1)}%` : "N/A",
          total_transactions: txList.length,
          family_members: members.map((m) => ({ name: m.name, role: m.role })),
          top_expense_categories: topExpenseCategories,
          top_income_sources: topIncomeCategories,
          member_breakdown: Object.entries(memberTotals).map(([name, totals]) => ({
            name,
            expense: totals.expense,
            income: totals.income,
          })),
          recent_transactions: recentTx,
        }
      };
    }

    case "get_member_spending": {
      const { members, profileMap } = await buildMemberMap();
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (toolInput.days || 30));

      const { data: allTx } = await supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en), added_by, transaction_date")
        .eq("account_id", account.id)
        .gte("transaction_date", daysAgo.toISOString().split("T")[0]);

      const txList = allTx || [];

      // Build per-member details
      const memberData: Record<string, {
        name: string;
        role: string;
        totalExpense: number;
        totalIncome: number;
        transactionCount: number;
        topCategories: Record<string, number>;
      }> = {};

      // Initialize for all members
      for (const m of members) {
        memberData[m.profileId || m.name] = {
          name: m.name,
          role: m.role,
          totalExpense: 0,
          totalIncome: 0,
          transactionCount: 0,
          topCategories: {},
        };
      }

      for (const t of txList) {
        const memberId = (t as any).added_by || "unknown";
        const memberName = memberId !== "unknown" ? (profileMap[memberId] || "Unknown") : (profile.full_name || "User");
        const key = memberId !== "unknown" ? memberId : memberName;

        if (!memberData[key]) {
          memberData[key] = {
            name: memberName,
            role: "member",
            totalExpense: 0,
            totalIncome: 0,
            transactionCount: 0,
            topCategories: {},
          };
        }

        const md = memberData[key];
        md.transactionCount++;
        if ((t as any).type === "expense") {
          md.totalExpense += Number((t as any).amount);
          const cat = (t as any).categories?.name_en || "Other";
          md.topCategories[cat] = (md.topCategories[cat] || 0) + Number((t as any).amount);
        } else {
          md.totalIncome += Number((t as any).amount);
        }
      }

      const memberList = Object.values(memberData).map((m) => ({
        name: m.name,
        role: m.role,
        total_expense: m.totalExpense,
        total_income: m.totalIncome,
        net: m.totalIncome - m.totalExpense,
        transaction_count: m.transactionCount,
        top_expense_categories: Object.entries(m.topCategories)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([cat, amt]) => ({ category: cat, amount: amt })),
      }));

      return {
        success: true,
        period_days: toolInput.days || 30,
        members: memberList,
        highest_spender: memberList.sort((a, b) => b.total_expense - a.total_expense)[0]?.name || "N/A",
        highest_earner: memberList.sort((a, b) => b.total_income - a.total_income)[0]?.name || "N/A",
      };
    }

    default:
      return { error: "Unknown tool" };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, language, history } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "No message provided" },
        { status: 400 }
      );
    }

    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // Fetch baseline financial context so AI always has the user's data
    const supabase = createServiceClient();
    let financialContext = "";
    try {
      const { profile: userProfile, account: userAccount } = await getAccountForUser(supabase, userId);
      if (userProfile && userAccount) {
        // Get members
        const { data: memberRows } = await supabase
          .from("account_members")
          .select("profile_id, role, invited_email, accepted")
          .eq("account_id", userAccount.id);

        const memberIds = (memberRows || []).map((m: any) => m.profile_id).filter(Boolean);
        let profileNames: Record<string, string> = {};
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", memberIds);
          if (profiles) {
            for (const p of profiles) {
              profileNames[p.id] = p.full_name || p.email || "Unknown";
            }
          }
        }

        const memberList = (memberRows || []).map((m: any) => {
          const name = m.profile_id ? (profileNames[m.profile_id] || "Unknown") : (m.invited_email || "Pending");
          return `${name} (${m.role}${m.accepted ? "" : ", pending"})`;
        });

        // Get last 30 days summary
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: recentTx } = await supabase
          .from("transactions")
          .select("type, amount, category_id, categories(name_en), added_by, transaction_date, description_en")
          .eq("account_id", userAccount.id)
          .gte("transaction_date", thirtyDaysAgo.toISOString().split("T")[0])
          .order("transaction_date", { ascending: false })
          .limit(100);

        const txList = recentTx || [];
        const totalIncome = txList.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const totalExpense = txList.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

        const catTotals: Record<string, number> = {};
        for (const t of txList.filter((t: any) => t.type === "expense")) {
          const cat = (t as any).categories?.name_en || "Other";
          catTotals[cat] = (catTotals[cat] || 0) + Number(t.amount);
        }
        const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);

        const lastTx = txList[0];
        const lastTxInfo = lastTx
          ? `Last transaction: ${(lastTx as any).type} of PKR ${(lastTx as any).amount} on ${(lastTx as any).transaction_date} for ${(lastTx as any).categories?.name_en || "Other"}${(lastTx as any).added_by ? ` (by ${profileNames[(lastTx as any).added_by] || "User"})` : ""}`
          : "No recent transactions";

        // Compute all-time balance too
        const { data: allTimeTxCtx } = await supabase
          .from("transactions")
          .select("type, amount")
          .eq("account_id", userAccount.id);
        const allTimeIncomeCtx = (allTimeTxCtx || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const allTimeExpenseCtx = (allTimeTxCtx || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const allTimeBalanceCtx = allTimeIncomeCtx - allTimeExpenseCtx;

        financialContext = `

📊 USER'S CURRENT FINANCIAL DATA:
- Account: ${userAccount.name}
- Family Members: ${memberList.length > 0 ? memberList.join(", ") : "Solo account"}

Last 30 days:
- Income: PKR ${totalIncome.toLocaleString("en-PK")}
- Expenses: PKR ${totalExpense.toLocaleString("en-PK")}
- Net Cash Flow: PKR ${(totalIncome - totalExpense).toLocaleString("en-PK")}
- Transactions: ${txList.length}
- Top Expense Categories: ${topCats.map(([c, a]) => `${c}: PKR ${(a as number).toLocaleString("en-PK")}`).join(", ") || "None"}

All-time:
- Total Income: PKR ${allTimeIncomeCtx.toLocaleString("en-PK")}
- Total Expenses: PKR ${allTimeExpenseCtx.toLocaleString("en-PK")}
- Current Balance: PKR ${allTimeBalanceCtx.toLocaleString("en-PK")}

- ${lastTxInfo}

Use the tools to get MORE DETAILED data when needed. ONLY report numbers that come from the data above or from tool results. NEVER make up or agree with numbers you haven't verified.`;
      }
    } catch (ctxErr) {
      console.error("Error fetching financial context:", ctxErr);
    }

    // Build conversation messages - ensure first message is always "user" role
    const conversationMessages: any[] = [];
    
    // Add history (only last 4 exchanges)
    if (history && history.length > 0) {
      history.slice(-4).forEach((msg: any) => {
        conversationMessages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content
        });
      });
    }
    
    // Add current message
    conversationMessages.push({
      role: "user",
      content: message
    });

    // Ensure first message is always "user" role (Bedrock requirement)
    while (conversationMessages.length > 0 && conversationMessages[0].role !== "user") {
      conversationMessages.shift();
    }

    const systemPrompt = `You are an intelligent AI financial advisor for HisaabKitaab (حساب کتاب), a Pakistani family finance app.

🗣️ LANGUAGE RULE (CRITICAL):
- Detect the language of the user's CURRENT message.
- If the user writes in English → respond ONLY in English.
- If the user writes in Urdu → respond ONLY in Urdu.
- If mixed → respond in whichever language dominates the message.
- The app UI language setting is: ${language === "ur" ? "Urdu" : "English"} — but ALWAYS follow the user's message language, NOT the setting.
- NEVER switch languages mid-response.

⚠️ ABSOLUTE RULE — NON-NEGOTIABLE:
You MUST REFUSE any question that is NOT about personal finance, money management, budgeting, savings, investments, taxes, banking, or the HisaabKitaab app.
If the user asks about ANYTHING unrelated to finance:
- DO NOT use any tools
- ONLY reply: "Sorry, I can only help with financial matters." (or the Urdu equivalent if they wrote in Urdu)

🎯 YOUR CAPABILITIES (only for finance topics):
1. Creating transactions when users tell you about expenses/income
2. Analyzing their spending patterns — by category, by family member, over time
3. Providing personalized financial advice based on their ACTUAL data
4. Answering questions about family spending, savings, budgets
5. Comparing member spending and income contributions

📊 TOOL USAGE GUIDE:
- "I spent X on Y" / "add X as expense/profit" → create_transaction ONLY. Do NOT call other tools. Just confirm briefly.
- "What was my last transaction?" / "Show recent expenses" → get_recent_transactions
- "Where is my money going?" / "How much on groceries?" → get_spending_summary
- "How are my finances?" / "Summary" / "How much have I saved?" → get_financial_overview
- "Who spends the most?" / "How much did X spend?" → get_member_spending
- For BROAD questions, use get_financial_overview FIRST, then other tools if needed
- ALWAYS call a tool when the user asks about their data — do NOT guess from context alone

✅ RESPONSE STYLE:
- When creating a transaction: confirm with ONE short sentence (e.g. "Done! Added PKR 1,000 as income (Salary)."). Do NOT give a full financial overview unless asked.
- When answering data questions: be concise, cite specific PKR amounts.
- Keep responses SHORT (2-4 sentences) unless user asks for detailed analysis.
- Do NOT repeat the full financial overview on every response.
- "Current Balance" means ALL-TIME balance (all_time_balance field), NOT the period net cash flow.

🚫 ANTI-HALLUCINATION RULES (CRITICAL):
- ONLY state numbers that appear in tool results or in the financial data above.
- If the user says a number that differs from your data, DO NOT agree. Say: "Based on the data I have, the number is PKR X. The dashboard may have updated since my last check."
- NEVER fabricate explanations for numbers you haven't seen in the data.
- If you don't know something, say so. Do NOT guess or make up answers.
- Do your own math: total_income - total_expense = balance. State the actual computation.
${financialContext}

Additional guidelines:
- Currency: PKR (Pakistani Rupees — never use ₹ or Rs. or INR)
- Pakistani context: HBL, UBL, Meezan Bank, PSX, prize bonds, NSS, gold, Islamic finance
- When giving advice, reference their actual spending categories and amounts
- For family accounts, mention which member spent/earned when relevant`;

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        system: systemPrompt,
        messages: conversationMessages,
        tools: tools,
        temperature: 0.3,
      }),
    });

    let response;
    try {
      response = await bedrockClient.send(command);
    } catch (awsError: any) {
      console.error("AWS Bedrock Error:", awsError.message);
      return NextResponse.json(
        { error: "AI service error. Please try again." },
        { status: 500 }
      );
    }

    let responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Tool-use loop: Claude may request multiple tool calls (up to 10 rounds)
    const allToolResults: { name: string; result: any }[] = [];
    let loopMessages = [...conversationMessages];
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (responseBody.stop_reason === "tool_use" && iterations < MAX_ITERATIONS) {
      iterations++;

      // Collect ALL tool_use blocks from the response
      const toolUseBlocks = responseBody.content.filter(
        (block: any) => block.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) break;

      // Add assistant response to message chain
      loopMessages.push({
        role: "assistant",
        content: responseBody.content,
      });

      // Execute all tools and collect results
      const toolResultContents: any[] = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await executeToolCall(
          toolBlock.name,
          toolBlock.input,
          userId
        );
        allToolResults.push({ name: toolBlock.name, result: toolResult });
        toolResultContents.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Send all tool results back to Claude
      loopMessages.push({
        role: "user",
        content: toolResultContents,
      });

      const loopCommand = new InvokeModelCommand({
        modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 2048,
          system: systemPrompt,
          messages: loopMessages,
          tools: tools,
          temperature: 0.3,
        }),
      });

      const loopResponse = await bedrockClient.send(loopCommand);
      responseBody = JSON.parse(new TextDecoder().decode(loopResponse.body));
    }

    // Extract final text response
    const textContent = responseBody.content?.find(
      (c: any) => c.type === "text"
    )?.text;

    if (allToolResults.length > 0) {
      return NextResponse.json({
        response: textContent || "Actions completed!",
        tool_used: allToolResults.map((t) => t.name).join(", "),
        tool_result: allToolResults.length === 1 ? allToolResults[0].result : allToolResults,
        tools_count: allToolResults.length,
      });
    }

    if (!textContent) {
      throw new Error("No response from AI");
    }

    return NextResponse.json({ response: textContent.trim() });

  } catch (error: any) {
    console.error("Error in advisor:", error);
    return NextResponse.json(
      { error: "Failed to get response", details: error.message },
      { status: 500 }
    );
  }
}
