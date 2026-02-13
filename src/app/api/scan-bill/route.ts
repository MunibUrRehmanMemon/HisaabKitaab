import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getTodayPKT } from "@/lib/date-utils";

/**
 * Detect the media type from a data URL. Defaults to image/jpeg.
 */
function detectMediaType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/\w+);base64,/);
  if (match) return match[1];
  // Check for common patterns
  if (dataUrl.match(/^data:image\/png/)) return "image/png";
  if (dataUrl.match(/^data:image\/webp/)) return "image/webp";
  if (dataUrl.match(/^data:image\/gif/)) return "image/gif";
  return "image/jpeg";
}

/**
 * Parse an amount string robustly: handles commas, spaces, currency symbols, etc.
 * Returns a number or 0 if unparseable.
 */
function parseAmount(raw: any): number {
  if (typeof raw === "number") return Math.round(raw);
  if (!raw) return 0;
  const str = String(raw)
    .replace(/[^\d.,\-]/g, "") // remove everything except digits, commas, dots, minus
    .replace(/,/g, ""); // remove commas (Pakistani formatting: 6,733.93)
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { image } = body;

    if (!image) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Validate file format — only allow JPEG, PNG, PDF
    const ALLOWED_MIME_PREFIXES = ["data:image/jpeg", "data:image/jpg", "data:image/png", "data:application/pdf"];
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => image.toLowerCase().startsWith(prefix));
    if (!isAllowed && image.startsWith("data:")) {
      const detectedType = image.match(/^data:([^;]+);/)?.[1] || "unknown";
      return NextResponse.json(
        { error: `Unsupported file format: ${detectedType}. Only JPG, PNG, and PDF are accepted.` },
        { status: 400 }
      );
    }

    // Initialize Bedrock client
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // Handle PDF: Claude Vision accepts PDF as document type
    const isPdf = image.toLowerCase().startsWith("data:application/pdf");

    // Detect actual media type from data URL before stripping prefix
    const mediaType = isPdf ? "application/pdf" : detectMediaType(image);

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:[^;]+;base64,/, "");

    // Strong prompt for Pakistani bills, handwritten receipts, and Urdu text
    const prompt = `You are an expert bill/receipt scanner for Pakistani documents. You can read BOTH PRINTED AND HANDWRITTEN text in ENGLISH AND URDU (اردو).

FIRST: Determine if this image is actually a bill, receipt, invoice, or financial document.
- If the image shows a PERSON, SELFIE, LANDSCAPE, ANIMAL, OBJECT, MEME, SCREENSHOT of non-financial content, or ANYTHING that is NOT a bill/receipt/invoice, you MUST return:
{"is_bill": false, "amount": 0, "items": [], "confidence": 0, "rejection_reason": "<brief reason, e.g. 'Image shows a person, not a bill'>", "category": "other", "date": "${getTodayPKT()}", "description": "", "merchant": ""}
- Only proceed with extraction if this IS a bill, receipt, invoice, utility bill, handwritten bill, or financial document.

If it IS a bill/receipt, analyze it carefully:

CRITICAL INSTRUCTIONS:
1. Look for the TOTAL PAYABLE amount, GRAND TOTAL, NET TOTAL, or PAYABLE AFTER DUE DATE. This is the most important field.
2. For Pakistani utility bills (LESCO, WAPDA, K-Electric, MEPCO, FESCO, IESCO, PESCO, Sui Gas, SNGPL, SSGC, PTCL, Jazz, Telenor, Zong, Ufone):
   - Find the "PAYABLE WITHIN DUE DATE" or "PAYABLE AFTER DUE DATE" or "TOTAL CHARGES" or "AMOUNT PAYABLE"
   - The total amount is usually a large number — typically in hundreds, thousands, or tens of thousands of PKR
3. For shopping receipts: Look for "Total", "Grand Total", "Net Amount", "Amount Due"
4. For restaurant bills: Look for "Total", "Bill Total", "Grand Total" (including tax/service charge)
5. Read ALL numbers carefully. Pakistani amounts use comma formatting: 6,733.93 means six thousand seven hundred thirty-three rupees and 93 paisa.
6. Currency is ALWAYS PKR (Pakistani Rupees).

MULTIPLE ITEMS RULE:
- If there are multiple items on the bill, list EACH item with its individual price in the "items" array.
- The "amount" field MUST be the TOTAL of ALL items combined.
- If the bill already has a printed total, use that. If it's handwritten with no total, SUM all individual item prices yourself and put that sum as "amount".
- Double-check: amount should EQUAL the sum of all item prices (plus any tax/service charges if applicable).

HANDWRITTEN / ROUGH WRITING SUPPORT:
- This may be a handwritten receipt from a local shop (دکان کا بل), general store, or street vendor
- Handwritten numbers may be rough, slanted, or in different styles — do your best to read them
- Look for hand-scribbled totals, circled amounts, underlined numbers, or amounts written at the bottom
- Common handwritten Urdu words: کل (total), رقم (amount), ادائیگی (payment), قیمت (price), نمبر (number)
- Handwritten receipts may have items listed with prices next to them — sum them if no total is written
- The writing may be on plain paper, notebook paper, or a small receipt pad

URDU TEXT SUPPORT (اردو):
- Read Urdu text right-to-left
- Common Urdu bill terms: بجلی کا بل (electricity bill), گیس کا بل (gas bill), پانی کا بل (water bill)
- کل رقم = Total amount, واجب الادا = Payable, آخری تاریخ = Due date
- خوراک (food), کرایہ (rent), دوائی (medicine), سبزی (vegetables), گوشت (meat), دودھ (milk)
- If the bill has both English and Urdu, prefer the amount next to English text for accuracy

Extract the following in JSON format:
{
  "is_bill": true,
  "amount": <number - the TOTAL amount as a plain number with decimals, e.g. 6733.93, NOT 0>,
  "category": "<one of: food, transport, shopping, bills, healthcare, entertainment, education, salary, rent, utilities, other>",
  "date": "<YYYY-MM-DD format from the bill, or today's date if not visible>",
  "description": "<brief description in English, e.g. 'LESCO Electricity Bill September 2024' or 'Local shop groceries'>",
  "merchant": "<name of company/vendor/shop, or 'Local Shop' / 'دکان' if handwritten with no name>",
  "items": [{"name": "<item or charge description>", "price": <number>}],
  "confidence": <0.0 to 1.0 - how confident you are in the extracted amount. Lower for hard-to-read handwriting>
}

IMPORTANT: The "amount" field MUST be a NUMBER greater than 0 if you can see ANY amount on the bill. Look very carefully at all numbers in the image. If there are multiple amounts, use the final total / payable amount. For handwritten bills, if you can read individual item prices but no total, SUM them up. DO NOT return 0 unless the image is completely unreadable.

REMEMBER: If this is NOT a bill/receipt, return is_bill: false. If it IS a bill, return is_bill: true.

Return ONLY valid JSON, no markdown code fences, no explanations.`;

    // Build content block — use document type for PDF, image type for images
    const fileContentBlock = isPdf
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64Image,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64Image,
          },
        };

    // Call AWS Bedrock with Claude Vision
    const command = new InvokeModelCommand({
      modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              fileContentBlock,
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    let response;
    try {
      response = await bedrockClient.send(command);
    } catch (awsError: any) {
      console.error("AWS Bedrock Error:", awsError.message);

      if (
        awsError.message?.includes("credential") ||
        awsError.message?.includes("access")
      ) {
        return NextResponse.json(
          {
            error:
              "AWS credentials invalid. Please verify your AWS credentials have Bedrock permissions.",
          },
          { status: 500 }
        );
      }

      throw awsError;
    }

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract the text content from Claude's response
    const textContent = responseBody.content.find(
      (c: any) => c.type === "text"
    )?.text;

    if (!textContent) {
      throw new Error("No text response from Claude");
    }

    console.log("Claude scan-bill raw response:", textContent);

    // Parse the JSON response
    let parsedData;
    try {
      // Strip markdown code fences if present
      const cleaned = textContent
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      parsedData = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse Claude response:", textContent);
      return NextResponse.json(
        {
          error: "Could not extract structured data from the bill",
          rawResponse: textContent,
        },
        { status: 422 }
      );
    }

    // Robustly parse the amount — handles strings with commas, currency symbols, etc.
    parsedData.amount = parseAmount(parsedData.amount);

    // Parse item prices too
    if (Array.isArray(parsedData.items)) {
      parsedData.items = parsedData.items.map((item: any) => ({
        name: item.name || "Item",
        price: parseAmount(item.price),
      }));

      // If multiple items exist and amount is 0 or missing, sum them
      if (parsedData.items.length > 0 && (!parsedData.amount || parsedData.amount <= 0)) {
        parsedData.amount = parsedData.items.reduce((sum: number, item: any) => sum + (item.price || 0), 0);
      }
    }

    // Check if AI determined this is not a bill
    if (parsedData.is_bill === false) {
      return NextResponse.json({
        is_bill: false,
        amount: 0,
        items: [],
        confidence: 0,
        rejection_reason: parsedData.rejection_reason || "This image does not appear to be a bill or receipt.",
        category: "other",
        date: getTodayPKT(),
        description: "",
        merchant: "",
      });
    }

    // Ensure defaults
    if (!parsedData.category) {
      parsedData.category = "other";
    }
    if (!parsedData.date) {
      parsedData.date = getTodayPKT();
    }
    if (!parsedData.description) {
      parsedData.description = parsedData.merchant
        ? `Bill from ${parsedData.merchant}`
        : "Scanned bill";
    }
    if (parsedData.confidence === undefined) {
      parsedData.confidence = 0.5;
    }

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Error scanning bill:", error);
    return NextResponse.json(
      {
        error: "Failed to scan bill",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
