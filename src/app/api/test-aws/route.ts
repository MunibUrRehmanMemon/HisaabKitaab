import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export async function GET() {
  try {
    // Check if env vars are loaded
    const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
    const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";
    
    const accessKeyPreview = process.env.AWS_ACCESS_KEY_ID 
      ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...` 
      : "NOT FOUND";

    console.log("Environment check:", {
      hasAccessKey,
      hasSecretKey,
      accessKeyPreview,
      region,
    });

    // Try to initialize client
    const client = new BedrockRuntimeClient({
      region: region,
    });

    // Try a simple test call
    const command = new InvokeModelCommand({
      modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Say 'Hello' in one word.",
          },
        ],
      }),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    return NextResponse.json({
      success: true,
      message: "AWS Bedrock is working!",
      envCheck: {
        hasAccessKey,
        hasSecretKey,
        accessKeyPreview,
        region,
      },
      bedrockResponse: responseBody.content[0]?.text || "No response",
    });

  } catch (error: any) {
    console.error("AWS Test Error:", error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      errorName: error.name,
      envCheck: {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        accessKeyPreview: process.env.AWS_ACCESS_KEY_ID 
          ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...` 
          : "NOT FOUND",
        region: process.env.AWS_REGION || "us-east-1 (default)",
      },
      fullError: JSON.stringify(error, null, 2),
    }, { status: 500 });
  }
}
