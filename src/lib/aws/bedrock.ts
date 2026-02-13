import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Invoke Claude 3.5 Sonnet via AWS Bedrock
 * @param prompt - The user prompt
 * @param systemPrompt - Optional system prompt
 * @param maxTokens - Max tokens to generate (default: 2048)
 * @returns AI response text
 */
export async function invokeClaude(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 2048
): Promise<string> {
  const messages = [
    {
      role: "user",
      content: prompt,
    },
  ];

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages,
    ...(systemPrompt && { system: systemPrompt }),
  };

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error("Error invoking Claude:", error);
    throw new Error("Failed to invoke Claude model");
  }
}

/**
 * Invoke Claude with streaming response
 * @param prompt - The user prompt
 * @param systemPrompt - Optional system prompt
 * @returns Async generator yielding response chunks
 */
export async function* invokeClaudeStream(
  prompt: string,
  systemPrompt?: string,
  maxTokens: number = 2048
): AsyncGenerator<string> {
  const messages = [
    {
      role: "user",
      content: prompt,
    },
  ];

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages,
    ...(systemPrompt && { system: systemPrompt }),
  };

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(command);

    if (response.body) {
      for await (const event of response.body) {
        if (event.chunk) {
          const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          if (chunk.type === "content_block_delta") {
            yield chunk.delta.text;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error streaming from Claude:", error);
    throw new Error("Failed to stream from Claude model");
  }
}

/**
 * Invoke Claude with vision (for bill scanning and inventory eye)
 * @param imageBase64 - Base64-encoded image
 * @param prompt - The prompt describing what to extract
 * @returns AI response text
 */
export async function invokeClaudeVision(
  imageBase64: string,
  prompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: prompt,
        },
      ],
    },
  ];

  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages,
  };

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error("Error invoking Claude Vision:", error);
    throw new Error("Failed to invoke Claude Vision model");
  }
}

/**
 * Get embeddings using AWS Titan Embeddings v2
 * @param text - Text to embed
 * @returns Embedding vector (1536 dimensions)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const payload = {
    inputText: text,
  };

  const command = new InvokeModelCommand({
    modelId: "amazon.titan-embed-text-v2:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding;
  } catch (error) {
    console.error("Error getting embedding:", error);
    throw new Error("Failed to get embedding");
  }
}
