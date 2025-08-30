import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const region = process.env.AWS_REGION || "ap-south-1";
export const s3Client = new S3Client({ region });
export async function presignGet(key, expires = 900) {
  const Bucket = process.env.S3_BUCKET;
  if (!Bucket) throw new Error("S3_BUCKET not set");
  if (!key) throw new Error("key is required");
  const command = new GetObjectCommand({ Bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: Number(expires) });
}
