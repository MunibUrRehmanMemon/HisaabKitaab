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

export const dynamic = "force-dynamic";

/**
 * POST /api/quick-call — Call all family members who have phone numbers
 * with AI-generated monthly financial insights in Urdu.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json(
        { error: setupError || "Account not found" },
        { status: 404 }
      );
    }

    // Fetch all members with phone numbers
    const { data: memberRows } = await supabase
      .from("account_members")
      .select("id, phone_number, profile_id, role")
      .eq("account_id", account.id)
      .not("phone_number", "is", null);

    const membersWithPhone = (memberRows || []).filter(
      (m: any) => m.phone_number && m.phone_number.trim().length >= 10
    );

    if (membersWithPhone.length === 0) {
      return NextResponse.json(
        { error: "No family members have phone numbers. Add phone numbers in Settings → Members." },
        { status: 400 }
      );
    }

    // Get profile names for members
    const profileIds = membersWithPhone.map((m: any) => m.profile_id).filter(Boolean);
    let profileMap: Record<string, any> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);
      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
      }
    }

    // Fetch financial data for current month
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
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalExpenses = transactions
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    // All-time balance
    const { data: allTx } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("account_id", account.id);
    const allIncome = (allTx || [])
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const allExpenses = (allTx || [])
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const balance = allIncome - allExpenses;

    // Top expense categories
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

    // Twilio setup
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioToken || !twilioPhone) {
      return NextResponse.json(
        { error: "Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER." },
        { status: 500 }
      );
    }

    const twilioClient = twilio(twilioSid, twilioToken);
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://hisaab-kitaab-five.vercel.app";

    const results: any[] = [];

    for (const member of membersWithPhone) {
      const memberName = member.profile_id
        ? profileMap[member.profile_id]?.full_name || "Family Member"
        : "Family Member";

      // Generate AI Urdu message for this member
      let urduMessage: string;
      try {
        const aiPrompt = `Generate a SHORT phone call message in URDU (Urdu script) for HisaabKitaab financial app.

Call to: ${memberName}
Monthly income: PKR ${Math.round(totalIncome)}
Monthly expenses: PKR ${Math.round(totalExpenses)}
Balance: PKR ${Math.round(balance)}
Top expenses: ${topCategories || "none"}
Total transactions: ${transactions.length}

RULES:
1. Write ENTIRELY in Urdu script
2. Start with Assalam o Alaikum and the person name
3. Under 120 words - will be read on phone
4. Mention income, expenses, balance
5. Give one brief financial tip
6. End with thanks for using HisaabKitaab
7. Sound natural, like a friendly financial update call
8. Return ONLY the Urdu message text`;

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
        urduMessage = aiBody.content?.[0]?.text || getDefaultMessage(memberName, totalIncome, totalExpenses, balance);
      } catch {
        urduMessage = getDefaultMessage(memberName, totalIncome, totalExpenses, balance);
      }

      // Make the call
      try {
        const phone = member.phone_number.startsWith("+")
          ? member.phone_number
          : "+" + member.phone_number;
        const webhookUrl = `${appUrl}/api/twilio-webhook?message=${encodeURIComponent(urduMessage)}`;

        const call = await twilioClient.calls.create({
          to: phone,
          from: twilioPhone,
          url: webhookUrl,
          statusCallback: `${appUrl}/api/twilio-status`,
          statusCallbackEvent: ["completed", "busy", "no-answer", "failed"],
          statusCallbackMethod: "POST",
        });

        // Save call record
        await supabase.from("scheduled_calls").insert({
          account_id: account.id,
          profile_id: profile.id,
          phone_number: phone,
          member_name: memberName,
          scheduled_at: new Date().toISOString(),
          status: "completed",
          twilio_sid: call.sid,
          message_text: urduMessage,
        });

        results.push({
          member: memberName,
          phone: phone,
          status: "called",
          sid: call.sid,
        });
      } catch (callErr: any) {
        console.error(`Failed to call ${memberName}:`, callErr.message);
        results.push({
          member: memberName,
          phone: member.phone_number,
          status: "failed",
          error: callErr.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "called").length;

    return NextResponse.json({
      success: true,
      message: `Called ${successCount} of ${membersWithPhone.length} members`,
      results,
    });
  } catch (error: any) {
    console.error("Quick call error:", error);
    return NextResponse.json(
      { error: "Quick call failed", details: error.message },
      { status: 500 }
    );
  }
}

function getDefaultMessage(name: string, income: number, expenses: number, balance: number): string {
  return `\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u06CC\u06A9\u0645 ${name}\u06D4 \u06CC\u06C1 \u062D\u0633\u0627\u0628 \u06A9\u062A\u0627\u0628 \u0633\u06D2 \u0645\u0627\u06C1\u0627\u0646\u06C1 \u0645\u0627\u0644\u06CC \u0631\u067E\u0648\u0631\u0679 \u06C1\u06D2\u06D4 \u0627\u0633 \u0645\u06C1\u06CC\u0646\u06D2 \u06A9\u0644 \u0622\u0645\u062F\u0646\u06CC ${Math.round(income)} \u0631\u0648\u067E\u06D2\u060C \u0627\u062E\u0631\u0627\u062C\u0627\u062A ${Math.round(expenses)} \u0631\u0648\u067E\u06D2\u060C \u0627\u0648\u0631 \u0628\u06CC\u0644\u0646\u0633 ${Math.round(balance)} \u0631\u0648\u067E\u06D2 \u06C1\u06D2\u06D4 \u0627\u067E\u0646\u06D2 \u0627\u062E\u0631\u0627\u062C\u0627\u062A \u067E\u0631 \u0646\u0638\u0631 \u0631\u06A9\u06BE\u06CC\u06BA\u06D4 \u062D\u0633\u0627\u0628 \u06A9\u062A\u0627\u0628 \u06A9\u0627 \u0627\u0633\u062A\u0639\u0645\u0627\u0644 \u06A9\u0631\u0646\u06D2 \u06A9\u0627 \u0634\u06A9\u0631\u06CC\u06C1\u06D4`;
}
