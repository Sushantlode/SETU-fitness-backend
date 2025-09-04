// import { presignGet as presignGetUrl } from "../utils/s3.js";

// export async function presignGet(req, res, next) {
//   try {
//     const { key, expires = 900 } = req.query;
//     if (!key)
//       return res
//         .status(400)
//         .json({ hasError: true, message: "key is required" });
//     const url = await presignGetUrl(String(key), Number(expires));
//     res.json({ hasError: false, key, url });
//   } catch (e) {
//     next(e);
//   }
// }
// controllers/images.js
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, buildKey } from "../utils/s3.js";
import { v4 as uuidv4 } from "uuid";

const Bucket = process.env.S3_BUCKET;

/**
 * GET /images/presign?key=workouts/exercises/abc.png&expires=3600
 * Returns a presigned **download** URL for an existing object key.
 */
export async function presignGet(req, res, next) {
  try {
    if (!Bucket) return res.status(500).json({ hasError: true, message: "S3_BUCKET not set" });
    const key = String(req.query?.key || "").trim();
    if (!key) return res.status(400).json({ hasError: true, message: "key query param required" });

    const expires = Math.min(60 * 60 * 24, Math.max(60, Number(req.query?.expires || 3600))); // 1m..24h
    const cmd = new GetObjectCommand({ Bucket, Key: key });
    const url = await getSignedUrl(s3Client, cmd, { expiresIn: expires });

    res.json({ hasError: false, data: { key, url, expires } });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /images/presign-upload
 * body: { contentType: "image/png", prefix?: "workouts/exercises", filename?: "bench.png" }
 * Returns presigned **upload** (PUT) URL; save returned "key" into DB.
 */
export async function presignUpload(req, res, next) {
  try {
    if (!Bucket) return res.status(500).json({ hasError: true, message: "S3_BUCKET not set" });

    const contentType = String(req.body?.contentType || "application/octet-stream");
    const prefix = String(req.body?.prefix || "workouts/exercises").replace(/^\/+|\/+$/g, "");
    const rawName = String(req.body?.filename || "").toLowerCase();
    const ext = (rawName.match(/\.(png|jpe?g|webp|gif|heic|heif)$/i) || [,"bin"])[1].toLowerCase();

    const key = buildKey(prefix, `${uuidv4()}.${ext}`);
    const cmd = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3Client, cmd, { expiresIn: 300 }); // 5 min

    res.json({
      hasError: false,
      data: {
        key,                            // store this in workout_exercises.image_key
        url,                            // client PUTs the binary here
        method: "PUT",
        headers: { "Content-Type": contentType },
        expires: 300
      }
    });
  } catch (e) {
    next(e);
  }
}
