import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { createServiceClient } from "@/lib/supabase/server";

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

    // Initialize Bedrock client - SDK will automatically use AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from environment
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // Fetch user's transaction data for context
    const supabase = createServiceClient();
    let userContext = "";
    
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();

      if (profile) {
        const { data: accounts } = await supabase
          .from("accounts")
          .select("id")
          .eq("owner_id", profile.id);

        if (accounts && accounts.length > 0) {
          const accountIds = accounts.map((acc) => acc.id);

          // Get transaction summary
          const { data: transactions } = await supabase
            .from("transactions")
            .select("type, amount, category_id, categories(name_en), transaction_date")
            .in("account_id", accountIds)
            .order("transaction_date", { ascending: false })
            .limit(50);

          if (transactions && transactions.length > 0) {
            const totalExpense = transactions
              .filter((t) => t.type === "expense")
              .reduce((sum, t) => sum + t.amount, 0);
            const totalIncome = transactions
              .filter((t) => t.type === "income")
              .reduce((sum, t) => sum + t.amount, 0);
            
            const categoryBreakdown = transactions
              .filter((t: any) => t.type === "expense")
              .reduce((acc: any, t: any) => {
                const catName = t.categories?.name_en || "Other";
                acc[catName] = (acc[catName] || 0) + t.amount;
                return acc;
              }, {});

            const topCategories = Object.entries(categoryBreakdown)
              .sort(([, a]: any, [, b]: any) => b - a)
              .slice(0, 5)
              .map(([cat, amt]) => `${cat}: PKR ${amt}`);

            userContext = `\n\nUser's Financial Data:
- Total Expenses: PKR ${totalExpense.toFixed(2)}
- Total Income: PKR ${totalIncome.toFixed(2)}
- Net Balance: PKR ${(totalIncome - totalExpense).toFixed(2)}
- Transaction Count: ${transactions.length}
- Top Spending Categories: ${topCategories.join(", ")}
- Date Range: ${transactions[transactions.length - 1]?.transaction_date} to ${transactions[0]?.transaction_date}`;
          }
        }
      }
    } catch (dbError) {
      console.error("Error fetching user context:", dbError);
      // Continue without user context
    }

    // Build conversation history for context
    const conversationHistory = history
      ?.map((msg: any) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n\n") || "";

    const systemPrompt = `You are a friendly and knowledgeable AI financial advisor for a Pakistani financial management app called HisaabKitaab (حساب کتاب).

⚠️ CRITICAL: You MUST ONLY answer questions related to:
- Personal finance, budgeting, and expense management
- Savings and investment strategies (Pakistan-specific)
- Debt management and financial planning
- Pakistani banking, economy, and financial regulations
- Islamic banking and Shariah-compliant investments
- HisaabKitaab app features and usage

❌ If the user asks about ANYTHING else (politics, sports, entertainment, general knowledge, coding, etc.), respond with:
"معذرت، میں صرف مالیات کے سوالات کا جواب دے سکتا ہوں۔ / Sorry, I can only answer questions related to personal finance and money management."

Your expertise includes:
- Personal budgeting and expense management
- Savings strategies for Pakistani families
- Investment advice (stocks, mutual funds, real estate, gold, NSS, Prize Bonds)
- Debt management and loan advice
- Financial planning for families and individuals
- Pakistani financial regulations and best practices
- Islamic banking and Shariah-compliant investments
- Tax planning (Pakistan)

Guidelines:
- Detect the language of the user's CURRENT message and respond in THAT language. If user writes in English, respond in English. If Urdu, respond in Urdu.
- Be specific to Pakistani context (PKR currency, local banks like HBL, UBL, Meezan, Pakistani economy)
- Keep responses concise, friendly, and actionable
- For complex topics, break down advice into simple steps
- Always prioritize the user's financial wellbeing
- Mention if something requires professional consultation
- Use real examples relevant to Pakistan${userContext}

User Question: ${message}

${conversationHistory ? `\nConversation History:\n${conversationHistory}\n` : ""}

Provide a helpful, contextual response:`;

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: systemPrompt,
          },
        ],
        temperature: 0.3,
      }),
    });

    let response;
    try {
      response = await bedrockClient.send(command);
    } catch (awsError: any) {
      console.error("AWS Bedrock Error:", awsError.message);
      
      if (awsError.message?.includes("credential") || awsError.message?.includes("access")) {
        return NextResponse.json(
          { error: "AWS credentials invalid. Please verify your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY have Bedrock permissions." },
          { status: 500 }
        );
      }
      
      throw awsError;
    }
    
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const textContent = responseBody.content.find(
      (c: any) => c.type === "text"
    )?.text;

    if (!textContent) {
      throw new Error("No response from Claude");
    }

    return NextResponse.json({ response: textContent.trim() });
  } catch (error: any) {
    console.error("Error getting advisor response:", error);
    return NextResponse.json(
      {
        error: "Failed to get advisor response",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
