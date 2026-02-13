import { NextRequest, NextResponse } from "next/server";

/**
 * Twilio webhook — called by Twilio when the call connects.
 * Returns TwiML that tells Twilio what to say on the call.
 * The message is passed as a query parameter.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const message = searchParams.get("message") || "السلام علیکم۔ یہ حساب کتاب سے ایک خودکار کال ہے۔ شکریہ۔";

    // TwiML response — Twilio reads this XML to know what to do
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say language="ur-PK" voice="Polly.Aditi">${escapeXml(message)}</Say>
  <Pause length="1"/>
  <Say language="ur-PK" voice="Polly.Aditi">${escapeXml(message)}</Say>
  <Pause length="2"/>
  <Say language="ur-PK" voice="Polly.Aditi">حساب کتاب کا استعمال کرنے کا شکریہ۔ اللہ حافظ۔</Say>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("Twilio webhook error:", error);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ur-PK" voice="Polly.Aditi">معذرت، کال میں خرابی ہوئی۔ بعد میں دوبارہ کوشش کریں۔</Say>
</Response>`;
    return new NextResponse(errorTwiml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }
}

// Also handle GET for testing
export async function GET(request: NextRequest) {
  return POST(request);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
