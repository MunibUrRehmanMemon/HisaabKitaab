import { NextRequest, NextResponse } from "next/server";

/**
 * Twilio status callback — receives call status updates.
 * We log it for debugging; could update DB in the future.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid");
    const callStatus = formData.get("CallStatus");
    const to = formData.get("To");
    const duration = formData.get("CallDuration");

    console.log(`[Twilio Status] Call ${callSid} to ${to}: ${callStatus} (${duration}s)`);

    return new NextResponse("OK", { status: 200 });
  } catch (error: any) {
    console.error("Twilio status callback error:", error);
    return new NextResponse("OK", { status: 200 });
  }
}
