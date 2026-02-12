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
    description: "Create a new transaction (income or expense) for the user. Use this when user says they spent money, earned money, or wants to log a transaction.",
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
    description: "Get user's recent transactions to provide context or analysis. Use this when user asks about their spending, recent purchases, or wants to see their activity.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to fetch (default 10)"
        },
        type: {
          type: "string",
          enum: ["income", "expense", "all"],
          description: "Filter by transaction type"
        }
      }
    }
  },
  {
    name: "get_spending_summary",
    description: "Get a summary of user's spending by category. Use when user asks about budget, spending patterns, or where their money goes.",
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

  switch (toolName) {
    case "create_transaction": {
      // Look up the category_id from the categories table by matching name
      let categoryId: string | null = null;
      const categoryName = toolInput.category || "Other";
      
      // Try to find matching default category (case-insensitive partial match)
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
      let query = supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en), description_en, transaction_date")
        .eq("account_id", account.id)
        .order("transaction_date", { ascending: false })
        .limit(toolInput.limit || 10);

      if (toolInput.type && toolInput.type !== "all") {
        query = query.eq("type", toolInput.type);
      }

      const { data: transactions } = await query;

      return {
        success: true,
        transactions: (transactions || []).map((t: any) => ({
          type: t.type,
          amount: t.amount,
          category: t.categories?.name_en || "Other",
          description: t.description_en,
          transaction_date: t.transaction_date,
        })),
        count: transactions?.length || 0
      };
    }

    case "get_spending_summary": {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - (toolInput.days || 30));

      const { data: summaryData } = await supabase
        .from("transactions")
        .select("type, amount, category_id, categories(name_en)")
        .eq("account_id", account.id)
        .gte("transaction_date", daysAgo.toISOString().split("T")[0]);

      const expenses = summaryData?.filter((t: any) => t.type === "expense") || [];
      const income = summaryData?.filter((t: any) => t.type === "income") || [];

      const totalExpense = expenses.reduce((sum: number, t: any) => sum + t.amount, 0);
      const totalIncome = income.reduce((sum: number, t: any) => sum + t.amount, 0);

      const categoryBreakdown = expenses.reduce((acc: any, t: any) => {
        const catName = t.categories?.name_en || "Other";
        acc[catName] = (acc[catName] || 0) + t.amount;
        return acc;
      }, {});

      return {
        success: true,
        summary: {
          period_days: toolInput.days || 30,
          total_expense: totalExpense,
          total_income: totalIncome,
          net: totalIncome - totalExpense,
          category_breakdown: categoryBreakdown,
          transaction_count: summaryData?.length || 0
        }
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

    const systemPrompt = `You are an intelligent AI financial advisor for HisaabKitaab (حساب کتاب), a Pakistani personal finance app.

⚠️ ABSOLUTE RULE — NON-NEGOTIABLE:
You MUST REFUSE any question that is NOT about personal finance, money management, budgeting, savings, investments, taxes, banking, or the HisaabKitaab app.
If the user asks about history, politics, celebrities, sports, entertainment, science, coding, general knowledge, or ANYTHING unrelated to finance:
- DO NOT use any tools
- ONLY reply with: "معذرت، میں صرف مالیات کے سوالات کا جواب دے سکتا ہوں۔ / Sorry, I can only help with financial matters."
- No exceptions. Do not try to be helpful about non-finance topics.

🎯 YOUR CAPABILITIES (only for finance topics):
1. Creating transactions when users tell you about expenses/income
2. Analyzing their spending patterns
3. Providing financial advice based on their actual data
4. Answering questions about their finances

📊 USE TOOLS ONLY WHEN (finance-related):
- User says "I spent X on Y" → create_transaction
- User mentions "I earned", "I got paid" → create_transaction
- User asks "where is my money going" → get_spending_summary
- User asks "what did I buy recently" → get_recent_transactions
- User needs budget advice → get_spending_summary first, then advise

Guidelines:
- Respond in ${language === "ur" ? "Urdu (اردو)" : "English"}
- Be conversational and helpful for FINANCE topics only
- Currency: PKR (Pakistani Rupees — never use ₹ or Rs. or INR)
- Pakistani context: HBL, UBL, Meezan Bank, PSX, prize bonds, NSS, gold, Islamic finance`;

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
        temperature: 0.7,
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
