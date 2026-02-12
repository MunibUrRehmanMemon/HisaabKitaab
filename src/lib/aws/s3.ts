import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "hisaab-kitaab-uploads";

/**
 * Upload a file to S3
 * @param key - S3 object key (path)
 * @param body - File buffer or stream
 * @param contentType - MIME type
 * @returns S3 object URL
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  try {
    await client.send(command);
    return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload file");
  }
}

/**
 * Generate a presigned URL for uploading
 * @param key - S3 object key
 * @param contentType - MIME type
 * @param expiresIn - URL expiration in seconds (default: 300)
 * @returns Presigned URL
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  try {
    return await getSignedUrl(client, command, { expiresIn });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    throw new Error("Failed to generate upload URL");
  }
}

/**
 * Generate a presigned URL for downloading
 * @param key - S3 object key
 * @param expiresIn - URL expiration in seconds (default: 3600)
 * @returns Presigned URL
 */
export async function getDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    return await getSignedUrl(client, command, { expiresIn });
  } catch (error) {
    console.error("Error generating download URL:", error);
    throw new Error("Failed to generate download URL");
  }
}

/**
 * Generate a unique key for file upload
 * @param userId - User ID
 * @param fileType - Type of file (e.g., 'receipt', 'audio')
 * @param extension - File extension
 * @returns Unique S3 key
 */
export function generateFileKey(
  userId: string,
  fileType: string,
  extension: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${fileType}/${userId}/${timestamp}-${random}.${extension}`;
}
