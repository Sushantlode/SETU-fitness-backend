import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "ap-south-1";
export const s3Client = new S3Client({ region });

const Bucket = process.env.S3_BUCKET;
const BASE = (process.env.S3_BASE_PREFIX || "").replace(/^\/|\/$/g, "");

export function buildKey(...parts) {
  return [BASE, ...parts].filter(Boolean).join("/").replace(/\/+/g, "/");
}

export async function putObject({ Key, Body, ContentType, CacheControl = "public, max-age=31536000, immutable" }) {
  if (!Bucket) throw new Error("S3_BUCKET not set");
  if (!Key) throw new Error("Key is required");
  await s3Client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, CacheControl }));
  return Key;
}

export async function presignGet(key, expires = 3600) {
  if (!Bucket) throw new Error("S3_BUCKET not set");
  if (!key) throw new Error("key is required");
  const command = new GetObjectCommand({ Bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: Number(expires) });
}
