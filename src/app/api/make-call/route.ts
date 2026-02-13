import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";
import { getTodayPKT, getFirstOfMonthPKT } from "@/lib/date-utils";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import twilio from "twilio";

/**
 * POST /api/make-call — Make an immediate AI-powered Urdu financial call
 * Body: { phoneNumber: string, memberName?: string }
 *
 * GET /api/make-call — List scheduled calls for the user
 */

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumber, memberName, scheduledAt } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Validate phone number format (Pakistani: +92XXXXXXXXXX)
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{10,15}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: "Invalid phone number format. Use +92XXXXXXXXXX" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json(
        { error: setupError || "Account not found" },
        { status: 404 }
      );
    }

    // If scheduledAt is provided, save to database for later execution
    if (scheduledAt) {
      const { data: scheduled, error: schedError } = await supabase
        .from("scheduled_calls")
        .insert({
          account_id: account.id,
          profile_id: profile.id,
          phone_number: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`,
          member_name: memberName || profile.full_name || "User",
          scheduled_at: scheduledAt,
          status: "pending",
        })
        .select("id")
        .single();

      if (schedError) {
        console.error("Error scheduling call:", schedError);
        return NextResponse.json(
          { error: "Failed to schedule call", details: schedError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        scheduled: true,
        callId: scheduled.id,
        message: `Call scheduled for ${new Date(scheduledAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`,
      });
    }

    // --- IMMEDIATE CALL ---
    // 1. Fetch financial data for the AI message
    const today = getTodayPKT();
    const firstOfMonth = getFirstOfMonthPKT();

    const { data: monthTx } = await supabase
      .from("transactions")
      .select("type, amount, category_id, categories(name_en)")
      .eq("account_id", account.id)
      .gte("transaction_date", firstOfMonth)
      .lte("transaction_date", today);

    const transactions = monthTx || [];
    const totalIncome = transactions
      .filter((t: any) => t.type === "income")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const totalExpenses = transactions
      .filter((t: any) => t.type === "expense")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const netCashFlow = totalIncome - totalExpenses;

    // Get all-time balance
    const { data: allTx } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("account_id", account.id);
    const allIncome = (allTx || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const allExpenses = (allTx || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const balance = allIncome - allExpenses;

    // Category breakdown (top 3 expenses)
    const catMap: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type === "expense") {
        const cat = (tx as any).categories?.name_en || "Other";
        catMap[cat] = (catMap[cat] || 0) + Number(tx.amount);
      }
    }
    const topCategories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => `${name}: ${Math.round(amount)} rupay`)
      .join(", ");

    // Member info
    const { data: memberRows } = await supabase
      .from("account_members")
      .select("profile_id, role")
      .eq("account_id", account.id);
    const memberCount = memberRows?.length || 1;

    // 2. Generate Urdu message using AI
    const targetName = memberName || profile.full_name || "User";
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const aiPrompt = `Generate a SHORT phone call message in URDU (written in Urdu script) for a Pakistani family finance app called HisaabKitaab (حساب کتاب).

The call is to: ${targetName}
Family members in account: ${memberCount}

This month's financial summary:
- Total Income: PKR ${Math.round(totalIncome)}
- Total Expenses: PKR ${Math.round(totalExpenses)}
- Net Cash Flow: PKR ${Math.round(netCashFlow)} (${netCashFlow >= 0 ? "positive" : "negative"})
- All-time Balance: PKR ${Math.round(balance)}
- Top expense categories: ${topCategories || "none yet"}
- Total transactions this month: ${transactions.length}

RULES:
1. Write ENTIRELY in Urdu script (اردو)
2. Start with "السلام علیکم ${targetName}"
3. Keep it under 150 words — this will be read aloud on a phone call
4. Mention key numbers: income, expenses, balance
5. Give one brief financial tip based on the data
6. End with "حساب کتاب کا استعمال کرنے کا شکریہ"
7. Return ONLY the Urdu message text, no explanations or translations
8. Make it sound natural and conversational, like a helpful friend calling`;

    const command = new InvokeModelCommand({
      modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 512,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    let urduMessage: string;
    try {
      const aiResponse = await bedrockClient.send(command);
      const aiBody = JSON.parse(new TextDecoder().decode(aiResponse.body));
      urduMessage = aiBody.content?.[0]?.text || getDefaultUrduMessage(targetName, totalIncome, totalExpenses, balance);
    } catch (aiError: any) {
      console.error("AI message generation failed, using default:", aiError.message);
      urduMessage = getDefaultUrduMessage(targetName, totalIncome, totalExpenses, balance);
    }

    // 3. Make the Twilio call
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioToken || !twilioPhone) {
      return NextResponse.json(
        { error: "Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to environment variables." },
        { status: 500 }
      );
    }

    const client = twilio(twilioSid, twilioToken);

    // The webhook URL that Twilio will call when the recipient picks up
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hisaab-kitaab-five.vercel.app";
    const webhookUrl = `${appUrl}/api/twilio-webhook?message=${encodeURIComponent(urduMessage)}`;

    const call = await client.calls.create({
      to: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`,
      from: twilioPhone,
      url: webhookUrl,
      statusCallback: `${appUrl}/api/twilio-status`,
      statusCallbackEvent: ["completed", "busy", "no-answer", "failed"],
      statusCallbackMethod: "POST",
    });

    // Save call record to database
    await supabase.from("scheduled_calls").insert({
      account_id: account.id,
      profile_id: profile.id,
      phone_number: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`,
      member_name: targetName,
      scheduled_at: new Date().toISOString(),
      status: "completed",
      twilio_sid: call.sid,
      message_text: urduMessage,
    });

    return NextResponse.json({
      success: true,
      scheduled: false,
      callSid: call.sid,
      message: `Call initiated to ${targetName} (${cleanPhone})`,
      urduMessage,
    });
  } catch (error: any) {
    console.error("Error making call:", error);
    return NextResponse.json(
      { error: "Failed to make call", details: error.message },
      { status: 500 }
    );
  }
}

// GET — list call history
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json({ calls: [] });
    }

    const { data: calls } = await supabase
      .from("scheduled_calls")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ calls: calls || [] });
  } catch (error: any) {
    console.error("Error fetching calls:", error);
    return NextResponse.json({ calls: [] });
  }
}

function getDefaultUrduMessage(
  name: string,
  income: number,
  expenses: number,
  balance: number
): string {
  return `السلام علیکم ${name}۔ یہ حساب کتاب سے ایک خودکار مالی رپورٹ کال ہے۔ اس مہینے آپ کی کل آمدنی ${Math.round(income)} روپے ہے اور کل اخراجات ${Math.round(expenses)} روپے ہیں۔ آپ کا موجودہ بیلنس ${Math.round(balance)} روپے ہے۔ اپنے اخراجات پر نظر رکھیں اور بچت کی کوشش کریں۔ حساب کتاب کا استعمال کرنے کا شکریہ۔`;
}
