import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTodayPKT, getFirstOfMonthPKT } from "@/lib/date-utils";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import twilio from "twilio";

/**
 * GET /api/cron/process-calls — Vercel Cron or manual trigger
 * Finds all pending scheduled_calls where scheduled_at <= now, and executes them.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow unauthenticated for testing in dev
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Get all pending calls that are due
    const { data: dueCalls, error: fetchError } = await supabase
      .from("scheduled_calls")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (fetchError || !dueCalls || dueCalls.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: "No calls due",
      });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioToken || !twilioPhone) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    const client = twilio(twilioSid, twilioToken);
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hisaab-kitaab-five.vercel.app";

    let processed = 0;
    const results: any[] = [];

    for (const call of dueCalls) {
      try {
        // Generate AI Urdu message from financial data
        const today = getTodayPKT();
        const firstOfMonth = getFirstOfMonthPKT();

        const { data: monthTx } = await supabase
          .from("transactions")
          .select("type, amount, category_id, categories(name_en)")
          .eq("account_id", call.account_id)
          .gte("transaction_date", firstOfMonth)
          .lte("transaction_date", today);

        const transactions = monthTx || [];
        const totalIncome = transactions.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const totalExpenses = transactions.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

        const { data: allTx } = await supabase
          .from("transactions")
          .select("type, amount")
          .eq("account_id", call.account_id);
        const allIncome = (allTx || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const allExpenses = (allTx || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
        const balance = allIncome - allExpenses;

        // Generate Urdu message
        let urduMessage: string;
        try {
          const aiPrompt = `Generate a SHORT phone call message in URDU (Urdu script) for HisaabKitaab (حساب کتاب) financial app.
Call to: ${call.member_name}
Income this month: PKR ${Math.round(totalIncome)}
Expenses this month: PKR ${Math.round(totalExpenses)}
Balance: PKR ${Math.round(balance)}
Transactions: ${transactions.length}

RULES: Write ONLY in Urdu script. Start with "السلام علیکم ${call.member_name}". Keep under 100 words. Mention income, expenses, balance. Give one brief tip. End with "حساب کتاب کا استعمال کرنے کا شکریہ". Return ONLY the message text.`;

          const cmd = new InvokeModelCommand({
            modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
              anthropic_version: "bedrock-2023-05-31",
              max_tokens: 512,
              messages: [{ role: "user", content: aiPrompt }],
            }),
          });
          const aiResp = await bedrockClient.send(cmd);
          const aiBody = JSON.parse(new TextDecoder().decode(aiResp.body));
          urduMessage = aiBody.content?.[0]?.text || getDefaultMessage(call.member_name, totalIncome, totalExpenses, balance);
        } catch {
          urduMessage = getDefaultMessage(call.member_name, totalIncome, totalExpenses, balance);
        }

        // Make the call
        const webhookUrl = `${appUrl}/api/twilio-webhook?message=${encodeURIComponent(urduMessage)}`;
        const twilioCall = await client.calls.create({
          to: call.phone_number,
          from: twilioPhone,
          url: webhookUrl,
        });

        // Update status
        await supabase
          .from("scheduled_calls")
          .update({
            status: "completed",
            twilio_sid: twilioCall.sid,
            message_text: urduMessage,
          })
          .eq("id", call.id);

        processed++;
        results.push({ id: call.id, status: "completed", sid: twilioCall.sid });
      } catch (callError: any) {
        console.error(`Failed to process call ${call.id}:`, callError.message);

        await supabase
          .from("scheduled_calls")
          .update({ status: "failed" })
          .eq("id", call.id);

        results.push({ id: call.id, status: "failed", error: callError.message });
      }
    }

    return NextResponse.json({ processed, results });
  } catch (error: any) {
    console.error("Cron process-calls error:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: error.message },
      { status: 500 }
    );
  }
}

function getDefaultMessage(name: string, income: number, expenses: number, balance: number): string {
  return `السلام علیکم ${name}۔ یہ حساب کتاب سے مالی رپورٹ ہے۔ اس مہینے آمدنی ${Math.round(income)} روپے، اخراجات ${Math.round(expenses)} روپے، بیلنس ${Math.round(balance)} روپے ہے۔ حساب کتاب کا استعمال کرنے کا شکریہ۔`;
}
