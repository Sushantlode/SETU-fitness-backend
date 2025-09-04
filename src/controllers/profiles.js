// src/controllers/profiles.js
import { pool } from "../db/pool.js";
import crypto from "crypto";
import { putObject, buildKey, presignGet } from "../utils/s3.js";

/* ===== helpers ===== */
async function saveProfileImageToS3(file, user_id) {
  const ext = extFromMime(file.mimetype);
  const fname = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
  // <bucket>/<S3_BASE_PREFIX>/users/<user_id>/profile_photos/<file>
  const Key = buildKey("users", user_id, "profile_photos", fname);
  await putObject({ Key, Body: file.buffer, ContentType: file.mimetype });
  return Key;
}








const toNum = (v) => (v == null ? NaN : Number(v));
const validGender = (g) => ["male", "female", "other", "prefer_not_to_say"].includes(String(g));
const PROFILE_IMG_TTL = 60 * 60 * 24; // 24h presign

function computeBmi(weightKg, heightCm) {
  const w = toNum(weightKg), h = toNum(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const m = h / 100; return +(w / (m * m)).toFixed(2);
}
const extFromMime = (m) =>
  /png$/i.test(m) ? "png" :
  /jpe?g$/i.test(m) ? "jpg" :
  /webp$/i.test(m) ? "webp" :
  /gif$/i.test(m) ? "gif"  :
  /hei[cf]$/i.test(m) ? "heic" : "bin";

function uid(req) {
  const u = req.user_id ?? req.user?.user_id ?? req.user?.id ?? req.user?.sub ?? null;
  return u == null ? null : String(u);
}

/** Extract S3 key from common S3 URL forms; return null if not S3 */
function extractS3KeyFromUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname;
    const path = url.pathname.replace(/^\/+/, "");
    // Path-style: https://s3.<region>.amazonaws.com/<bucket>/<key>
    if (/^s3([.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(host)) {
      const parts = path.split("/");
      parts.shift(); // drop bucket
      return parts.join("/");
    }
    // Virtual-hosted: https://<bucket>.s3.<region>.amazonaws.com/<key>
    if (/\b\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(host)) {
      return path;
    }
    return null;
  } catch { return null; }
}

/** Accept S3 key or S3 URL; always return key (or null) */
function normalizeUserImageInput(user_image) {
  if (!user_image) return null;
  if (/^https?:\/\//i.test(user_image)) return extractS3KeyFromUrl(user_image);
  return user_image; // assume already key
}

/* ===== UPLOAD PHOTO -> S3 (key only in DB) ===== */
export async function uploadProfilePhoto(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });
    if (!req.file) return res.status(400).json({ hasError: true, message: "image is required (field: image)" });

    const ext = extFromMime(req.file.mimetype);
    const fname = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;

    // REQUIRED PATH: <bucket>/<S3_BASE_PREFIX>/users/<user_id>/profile_photos/<file>
    const Key = buildKey("users", user_id, "profile_photos", fname);

    await putObject({ Key, Body: req.file.buffer, ContentType: req.file.mimetype });

    // Save KEY (not URL)
    const { rows } = await pool.query(`
      INSERT INTO public.ftn_profiles (user_id, profile_picture_url, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET profile_picture_url = EXCLUDED.profile_picture_url, updated_at = NOW()
      RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi;
    `, [user_id, Key]);

    const presigned = await presignGet(Key, PROFILE_IMG_TTL);
    const row = rows[0] || null;
    if (row) row.user_image = presigned;

    return res.json({ hasError: false, key: Key, url: presigned, data: row });
  } catch (e) { next(e); }
}

/* ===== Validators for full objects ===== */
function validateFull({ name, age, height_cm, weight_kg, gender }) {
  if (!name || typeof name !== "string" || !name.trim()) return "name is required";
  const a = toNum(age), h = toNum(height_cm), w = toNum(weight_kg);
  if (!Number.isFinite(a) || a < 1 || a > 150) return "age must be 1–150";
  if (!Number.isFinite(h) || h < 50 || h > 300) return "height_cm must be 50–300";
  if (!Number.isFinite(w) || w < 10 || w > 500) return "weight_kg must be 10–500";
  if (!validGender(gender)) return "gender must be male|female|other|prefer_not_to_say";
  return null;
}

/* ===== CRUD ===== */

// GET /profiles  and /profiles/me
export async function getProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { rows } = await pool.query(
      `SELECT first_name AS name,
              profile_picture_url AS user_image, -- stores S3 KEY (desired) or legacy URL
              age, height_cm, weight_kg, gender, bmi
         FROM public.ftn_profiles
        WHERE user_id = $1
        LIMIT 1`, [user_id]
    );

    const row = rows[0] || null;
    if (row?.user_image) {
      if (/^https?:\/\//i.test(row.user_image)) {
        // legacy: stored URL → try to convert to key and fix DB (async)
        const key = extractS3KeyFromUrl(row.user_image);
        if (key) {
          row.user_image = await presignGet(key, PROFILE_IMG_TTL);
          pool.query(`UPDATE public.ftn_profiles SET profile_picture_url=$1, updated_at=NOW() WHERE user_id=$2`, [key, user_id]).catch(() => {});
        }
      } else {
        row.user_image = await presignGet(row.user_image, PROFILE_IMG_TTL);
      }
    }

    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// POST /profiles (409 if exists)
export async function createProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    // When multipart is used, fields arrive as strings in req.body; that’s fine.
    const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};

    // If image file attached, upload it → prefer file over user_image
    let image_key = null;
    if (req.file) {
      image_key = await saveProfileImageToS3(req.file, user_id);
    } else {
      image_key = normalizeUserImageInput(user_image);  // accepts S3 key or S3 URL; stores key
      if (user_image && !image_key) {
        return res.status(400).json({ hasError: true, message: "user_image must be an S3 key or S3 URL" });
      }
    }

    // Validate required fields
    const err = validateFull({ name, age, height_cm, weight_kg, gender });
    if (err) return res.status(400).json({ hasError: true, message: err });

    const bmi = computeBmi(weight_kg, height_cm);
    const { rows } = await pool.query(
      `INSERT INTO public.ftn_profiles (
         user_id, first_name, profile_picture_url, age, height_cm, weight_kg, gender, bmi
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`,
      [user_id, String(name).trim(), image_key, age, height_cm, weight_kg, gender, bmi]
    );

    if (!rows[0]) return res.status(409).json({ hasError: true, message: "Profile already exists" });

    const row = rows[0];
    if (row.user_image) row.user_image = await presignGet(row.user_image, PROFILE_IMG_TTL);
    return res.status(201).json({ hasError: false, data: row });
  } catch (e) { next(e); }
}


// PUT /profiles (create or update)
export async function upsertProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};
    const err = validateFull({ name, age, height_cm, weight_kg, gender });
    if (err) return res.status(400).json({ hasError: true, message: err });

    const image_key = normalizeUserImageInput(user_image);
    if (user_image && !image_key) {
      return res.status(400).json({ hasError: true, message: "user_image must be an S3 key or S3 URL" });
    }

    const bmi = computeBmi(weight_kg, height_cm);
    const { rows } = await pool.query(
      `INSERT INTO public.ftn_profiles (
         user_id, first_name, profile_picture_url, age, height_cm, weight_kg, gender, bmi
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         profile_picture_url = EXCLUDED.profile_picture_url,
         age = EXCLUDED.age,
         height_cm = EXCLUDED.height_cm,
         weight_kg = EXCLUDED.weight_kg,
         gender = EXCLUDED.gender,
         bmi = EXCLUDED.bmi,
         updated_at = NOW()
       RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`,
      [user_id, String(name).trim(), image_key, age, height_cm, weight_kg, gender, bmi]
    );

    const row = rows[0];
    if (row.user_image) row.user_image = await presignGet(row.user_image, PROFILE_IMG_TTL);
    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// PATCH /profiles (partial)
export async function patchProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    // load current for BMI recompute
    const { rows: curRows } = await pool.query(
      `SELECT height_cm, weight_kg FROM public.ftn_profiles WHERE user_id=$1 LIMIT 1`, [user_id]
    );
    const current = curRows[0] || {};

    const sets = [];
    const params = [user_id];

    const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if ("name" in req.body) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ hasError: true, message: "name cannot be empty" });
      push("first_name", name);
    }
    if ("user_image" in req.body) {
      const image_key = normalizeUserImageInput(req.body.user_image);
      if (req.body.user_image && !image_key) {
        return res.status(400).json({ hasError: true, message: "user_image must be an S3 key or S3 URL" });
      }
      push("profile_picture_url", image_key);
    }
    if ("age" in req.body) {
      const a = toNum(req.body.age);
      if (!Number.isFinite(a) || a < 1 || a > 150) return res.status(400).json({ hasError: true, message: "age must be 1–150" });
      push("age", a);
    }
    let nextHeight = ("height_cm" in req.body) ? toNum(req.body.height_cm) : toNum(current.height_cm);
    let nextWeight = ("weight_kg" in req.body) ? toNum(req.body.weight_kg) : toNum(current.weight_kg);
    if ("height_cm" in req.body) {
      if (!Number.isFinite(nextHeight) || nextHeight < 50 || nextHeight > 300) {
        return res.status(400).json({ hasError: true, message: "height_cm must be 50–300" });
      }
      push("height_cm", nextHeight);
    }
    if ("weight_kg" in req.body) {
      if (!Number.isFinite(nextWeight) || nextWeight < 10 || nextWeight > 500) {
        return res.status(400).json({ hasError: true, message: "weight_kg must be 10–500" });
      }
      push("weight_kg", nextWeight);
    }
    if ("gender" in req.body) {
      const g = req.body.gender;
      if (!validGender(g)) return res.status(400).json({ hasError: true, message: "gender must be male|female|other|prefer_not_to_say" });
      push("gender", g);
    }

    const shouldRecomputeBmi =
      ("height_cm" in req.body) || ("weight_kg" in req.body) || current.height_cm == null || current.weight_kg == null;
    if (shouldRecomputeBmi && Number.isFinite(nextHeight) && Number.isFinite(nextWeight) && nextHeight > 0 && nextWeight > 0) {
      push("bmi", computeBmi(nextWeight, nextHeight));
    }

    if (!sets.length) return res.status(400).json({ hasError: true, message: "No valid fields to update" });

    const sql = `
      UPDATE public.ftn_profiles
      SET ${sets.join(", ")}, updated_at = NOW()
      WHERE user_id = $1
      RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`;
    const { rows } = await pool.query(sql, params);
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Profile not found" });

    const row = rows[0];
    if (row.user_image) row.user_image = await presignGet(row.user_image, PROFILE_IMG_TTL);
    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// DELETE /profiles
export async function deleteProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { rowCount } = await pool.query(`DELETE FROM public.ftn_profiles WHERE user_id=$1`, [user_id]);
    if (rowCount === 0) return res.status(404).json({ hasError: true, message: "Profile not found" });
    res.status(204).send();
  } catch (e) { next(e); }
}
