import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { transcript, language } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    // Initialize Bedrock client - SDK will automatically use AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from environment
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const prompt = `You are a financial transaction parser for a Pakistani financial app. Parse this ${
      language === "ur" ? "Urdu" : "English"
    } voice input and extract transaction details.

Voice Input: "${transcript}"

Extract the following in JSON format:
- type: "income" or "expense"
- amount: numeric value only (no currency)
- category: one of: food, transport, shopping, bills, healthcare, entertainment, education, salary, business, investment, other
- description: brief description of the transaction
- confidence: your confidence level (0-1) in the extraction

Common Urdu/English phrases:
- خرچ/spent/paid = expense
- آمدنی/received/earned/salary = income
- خوراک/food/groceries
- ٹرانسپورٹ/transport/petrol
- بل/bill
- دوائی/medicine/healthcare

Return ONLY valid JSON, no markdown or explanations.`;

    const command = new InvokeModelCommand({
      modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    let response;
    try {
      response = await bedrockClient.send(command);
    } catch (awsError: any) {
      console.error("AWS Bedrock Error:", awsError.message);
      
      if (awsError.message?.includes("credential") || awsError.message?.includes("access")) {
        return NextResponse.json(
          { error: "AWS credentials invalid. Please verify your AWS credentials have Bedrock permissions." },
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

    let parsedData;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(textContent);
    } catch (e) {
      console.error("Failed to parse Claude response:", textContent);
      return NextResponse.json(
        {
          error: "Could not extract structured data",
          rawResponse: textContent,
        },
        { status: 422 }
      );
    }

    // Ensure we have required fields
    if (!parsedData.type) parsedData.type = "expense";
    if (!parsedData.amount) parsedData.amount = "0";
    if (!parsedData.category) parsedData.category = "other";
    if (!parsedData.confidence) parsedData.confidence = 0.5;

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error("Error processing voice:", error);
    return NextResponse.json(
      {
        error: "Failed to process voice input",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
