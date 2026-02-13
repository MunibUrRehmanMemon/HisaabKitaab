import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";
import { getTodayPKT } from "@/lib/date-utils";

/**
 * Sanitize transcript: replace ₹ with PKR, normalize currency references
 */
function sanitizeTranscript(text: string): string {
  return text
    .replace(/₹/g, "PKR ")
    .replace(/Rs\.?\s*/gi, "PKR ")
    .replace(/INR\s*/gi, "PKR ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { transcript, language, autoSave } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const cleanTranscript = sanitizeTranscript(transcript);

    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const prompt = `You are a financial transaction parser for a Pakistani financial app (HisaabKitaab).
The user spoke naturally and may have mentioned MULTIPLE transactions in a single voice input.
Parse ALL transactions from this ${language === "ur" ? "Urdu" : "English"} voice input.

Voice Input: "${cleanTranscript}"

IMPORTANT RULES:
1. Extract EVERY transaction mentioned — there may be 1 or many
2. Each transaction needs: type, amount, category, description, confidence
3. If the user says they DON'T REMEMBER something, still log it with category "other" and description noting it was unspecified
4. Amount should be a number only (no currency symbols)
5. Currency is ALWAYS PKR (Pakistani Rupees)

Transaction type rules:
- خرچ/spent/paid/kharch/kharcha/kiye = expense
- آمدنی/received/earned/mile/mili/kamai/salary = income

Category mapping (use these EXACT English names):
- EXPENSES: Groceries, Transport, Shopping, Bills, Healthcare, Entertainment, Education, Food, Other
- INCOME: Salary, Business, Investment, Freelance, Gift, Other
- petrol/fuel/gas → Transport
- biryani/khana/food/restaurant → Food
- dawai/medicine → Healthcare
- kapre/clothes → Shopping
- project/kaam/freelance work → Freelance (income)

Return a JSON object with this EXACT structure:
{
  "transactions": [
    {
      "type": "income" or "expense",
      "amount": <number>,
      "category": "<category name>",
      "description": "<brief description>",
      "confidence": <0-1>
    }
  ],
  "summary": "<one-line summary of all transactions>"
}

Return ONLY valid JSON. No markdown, no explanations, no code fences.`;

    const command = new InvokeModelCommand({
      modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
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

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const textContent = responseBody.content.find(
      (c: any) => c.type === "text"
    )?.text;

    if (!textContent) {
      throw new Error("No response from Claude");
    }

    let parsedData: any;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(textContent);
    } catch (e) {
      console.error("Failed to parse Claude response:", textContent);
      return NextResponse.json(
        { error: "Could not extract structured data", rawResponse: textContent },
        { status: 422 }
      );
    }

    // Normalize: support both old single-transaction and new multi-transaction format
    let transactions: any[] = [];
    if (parsedData.transactions && Array.isArray(parsedData.transactions)) {
      transactions = parsedData.transactions;
    } else if (parsedData.type && parsedData.amount) {
      transactions = [parsedData];
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: "No transactions could be extracted from the input." },
        { status: 422 }
      );
    }

    // Validate and normalize each transaction
    transactions = transactions.map((tx: any) => ({
      type: tx.type === "income" ? "income" : "expense",
      amount: parseFloat(tx.amount) || 0,
      category: tx.category || "Other",
      description: tx.description || "",
      confidence: parseFloat(tx.confidence) || 0.7,
      saved: false,
    }));

    // Auto-save if requested
    let savedCount = 0;
    if (autoSave) {
      const supabase = createServiceClient();

      const { profile, account } = await getAccountForUser(supabase, userId);

      if (profile && account) {
          const { data: categories } = await supabase
            .from("categories")
            .select("id, name_en")
            .eq("is_default", true);

          for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            if (tx.confidence < 0.4 || tx.amount <= 0) continue;

            let categoryId: string | null = null;
            if (categories) {
              const match = categories.find(
                (c) =>
                  c.name_en.toLowerCase().includes(tx.category.toLowerCase()) ||
                  tx.category.toLowerCase().includes(c.name_en.toLowerCase())
              );
              categoryId = match?.id || categories.find((c) => c.name_en === "Other")?.id || null;
            }

            const { error: insertError } = await supabase.from("transactions").insert({
              account_id: account.id,
              type: tx.type,
              amount: tx.amount,
              category_id: categoryId,
              description_en: tx.description || "",
              transaction_date: getTodayPKT(),
              added_by: profile.id,
              source: "voice",
            });

            if (!insertError) {
              transactions[i].saved = true;
              savedCount++;
            }
          }
      }
    }

    return NextResponse.json({
      transactions,
      savedCount,
      totalCount: transactions.length,
      summary: parsedData.summary || `${transactions.length} transaction(s) extracted`,
      // Backwards compat: expose first transaction at top level
      type: transactions[0]?.type,
      amount: transactions[0]?.amount,
      category: transactions[0]?.category,
      description: transactions[0]?.description,
      confidence: transactions[0]?.confidence,
      saved: savedCount > 0,
    });
  } catch (error: any) {
    console.error("Error processing voice:", error);
    return NextResponse.json(
      { error: "Could not process voice input", details: error.message },
      { status: 500 }
    );
  }
}
