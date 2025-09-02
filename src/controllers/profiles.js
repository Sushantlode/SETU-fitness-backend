// import { pool } from "../db/pool.js";

// /* ===== schema bootstrap (non-destructive) ===== */
// async function ensureProfilesSchema() {
//   try { await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); } catch {}
//   try { await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`); } catch {}

//   // Try gen_random_uuid(); if unavailable, fall back to uuid_generate_v4()
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS ftn_profiles (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         user_id TEXT NOT NULL UNIQUE,
//         first_name TEXT,
//         profile_picture_url TEXT,
//         age INTEGER,
//         height_cm NUMERIC(5,2),
//         weight_kg NUMERIC(6,2),
//         gender TEXT,
//         bmi NUMERIC(5,2),
//         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//       );
//     `);
//   } catch {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS ftn_profiles (
//         id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//         user_id TEXT NOT NULL UNIQUE,
//         first_name TEXT,
//         profile_picture_url TEXT,
//         age INTEGER,
//         height_cm NUMERIC(5,2),
//         weight_kg NUMERIC(6,2),
//         gender TEXT,
//         bmi NUMERIC(5,2),
//         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//       );
//     `);
//   }

//   // Add columns if missing (idempotent)
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS user_id TEXT;`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS first_name TEXT;`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS age INTEGER;`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5,2);`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(6,2);`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS gender TEXT;`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS bmi NUMERIC(5,2);`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
//   await pool.query(`ALTER TABLE ftn_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

//   // Ensure unique(user_id)
//   await pool.query(`
//     DO $$
//     BEGIN
//       IF NOT EXISTS (
//         SELECT 1 FROM pg_constraint
//         WHERE conname = 'ftn_profiles_user_id_key'
//           AND conrelid = 'ftn_profiles'::regclass
//       ) THEN
//         ALTER TABLE ftn_profiles ADD CONSTRAINT ftn_profiles_user_id_key UNIQUE (user_id);
//       END IF;
//     END$$;
//   `);
// }
// ensureProfilesSchema().catch(console.error);

// /* ===== helpers & validators ===== */
// const toNum = (v) => (v == null ? NaN : Number(v));
// const validGender = (g) =>
//   ["male", "female", "other", "prefer_not_to_say"].includes(String(g));

// function validateFull({ name, age, height_cm, weight_kg, gender }) {
//   if (!name || typeof name !== "string" || !name.trim()) return "name is required";
//   const a = toNum(age), h = toNum(height_cm), w = toNum(weight_kg);
//   if (!Number.isFinite(a) || a < 1 || a > 150) return "age must be 1–150";
//   if (!Number.isFinite(h) || h < 50 || h > 300) return "height_cm must be 50–300";
//   if (!Number.isFinite(w) || w < 10 || w > 500) return "weight_kg must be 10–500";
//   if (!validGender(gender)) return "gender must be male|female|other|prefer_not_to_say";
//   return null;
// }

// function computeBmi(weightKg, heightCm) {
//   const w = toNum(weightKg), h = toNum(heightCm);
//   if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
//   const m = h / 100;
//   return +(w / (m * m)).toFixed(2);
// }

// /* ===== CRUD ===== */

// // READ: GET /profiles
// export async function getProfile(req, res, next) {
//   try {
//     const user_id = req.user_id;
//     const { rows } = await pool.query(
//       `SELECT
//          first_name AS name,
//          profile_picture_url AS user_image,
//          age, height_cm, weight_kg, gender, bmi
//        FROM ftn_profiles
//        WHERE user_id=$1
//        LIMIT 1`,
//       [user_id]
//     );
//     res.json({ hasError: false, data: rows[0] || null });
//   } catch (e) { next(e); }
// }

// // CREATE (create-only): POST /profiles
// export async function createProfile(req, res, next) {
//   try {
//     const user_id = req.user_id;
//     const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};
//     const err = validateFull({ name, age, height_cm, weight_kg, gender });
//     if (err) return res.status(400).json({ hasError: true, message: err });

//     const bmi = computeBmi(weight_kg, height_cm);

//     const { rows } = await pool.query(
//       `INSERT INTO ftn_profiles (
//          user_id, first_name, profile_picture_url, age, height_cm, weight_kg, gender, bmi
//        )
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//        ON CONFLICT (user_id) DO NOTHING
//        RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`,
//       [user_id, name.trim(), user_image, age, height_cm, weight_kg, gender, bmi]
//     );
//     if (!rows[0]) return res.status(409).json({ hasError: true, message: "Profile already exists" });
//     return res.status(201).json({ hasError: false, data: rows[0] });
//   } catch (e) { next(e); }
// }

// // UPSERT: PUT /profiles
// export async function upsertProfile(req, res, next) {
//   try {
//     const user_id = req.user_id;
//     const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};
//     const err = validateFull({ name, age, height_cm, weight_kg, gender });
//     if (err) return res.status(400).json({ hasError: true, message: err });

//     const bmi = computeBmi(weight_kg, height_cm);

//     const { rows } = await pool.query(
//       `INSERT INTO ftn_profiles (
//          user_id, first_name, profile_picture_url, age, height_cm, weight_kg, gender, bmi
//        )
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//        ON CONFLICT (user_id) DO UPDATE SET
//          first_name = EXCLUDED.first_name,
//          profile_picture_url = EXCLUDED.profile_picture_url,
//          age = EXCLUDED.age,
//          height_cm = EXCLUDED.height_cm,
//          weight_kg = EXCLUDED.weight_kg,
//          gender = EXCLUDED.gender,
//          bmi = EXCLUDED.bmi,
//          updated_at = NOW()
//        RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`,
//       [user_id, name.trim(), user_image, age, height_cm, weight_kg, gender, bmi]
//     );
//     res.json({ hasError: false, data: rows[0] });
//   } catch (e) { next(e); }
// }

// // PARTIAL UPDATE: PATCH /profiles
// export async function patchProfile(req, res, next) {
//   try {
//     const user_id = req.user_id;

//     // Load current to support BMI recompute when only one of height/weight changes
//     const { rows: curRows } = await pool.query(
//       `SELECT height_cm, weight_kg FROM ftn_profiles WHERE user_id=$1 LIMIT 1`,
//       [user_id]
//     );
//     const current = curRows[0] || {};

//     let nextHeight = ("height_cm" in req.body) ? toNum(req.body.height_cm) : toNum(current.height_cm);
//     let nextWeight = ("weight_kg" in req.body) ? toNum(req.body.weight_kg) : toNum(current.weight_kg);

//     const sets = [];
//     const params = [user_id];

//     function pushSet(col, val) {
//       params.push(val);
//       sets.push(`${col} = $${params.length}`);
//     }

//     if ("name" in req.body) {
//       const name = String(req.body.name || "").trim();
//       if (!name) return res.status(400).json({ hasError: true, message: "name cannot be empty" });
//       pushSet("first_name", name);
//     }
//     if ("user_image" in req.body) pushSet("profile_picture_url", req.body.user_image ?? null);
//     if ("age" in req.body) {
//       const a = toNum(req.body.age);
//       if (!Number.isFinite(a) || a < 1 || a > 150) return res.status(400).json({ hasError: true, message: "age must be 1–150" });
//       pushSet("age", a);
//     }
//     if ("height_cm" in req.body) {
//       if (!Number.isFinite(nextHeight) || nextHeight < 50 || nextHeight > 300) {
//         return res.status(400).json({ hasError: true, message: "height_cm must be 50–300" });
//       }
//       pushSet("height_cm", nextHeight);
//     }
//     if ("weight_kg" in req.body) {
//       if (!Number.isFinite(nextWeight) || nextWeight < 10 || nextWeight > 500) {
//         return res.status(400).json({ hasError: true, message: "weight_kg must be 10–500" });
//       }
//       pushSet("weight_kg", nextWeight);
//     }
//     if ("gender" in req.body) {
//       const g = req.body.gender;
//       if (!validGender(g)) return res.status(400).json({ hasError: true, message: "gender must be male|female|other|prefer_not_to_say" });
//       pushSet("gender", g);
//     }

//     // If either height or weight changed (or one is missing previously), recompute BMI
//     const shouldRecomputeBmi =
//       ("height_cm" in req.body) || ("weight_kg" in req.body) || current.height_cm == null || current.weight_kg == null;

//     if (shouldRecomputeBmi && Number.isFinite(nextHeight) && Number.isFinite(nextWeight) && nextHeight > 0 && nextWeight > 0) {
//       pushSet("bmi", computeBmi(nextWeight, nextHeight));
//     }

//     if (sets.length === 0) return res.status(400).json({ hasError: true, message: "No valid fields to update" });

//     const sql = `
//       UPDATE ftn_profiles
//       SET ${sets.join(", ")}, updated_at = NOW()
//       WHERE user_id = $1
//       RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`;
//     const { rows } = await pool.query(sql, params);
//     if (!rows[0]) return res.status(404).json({ hasError: true, message: "Profile not found" });
//     res.json({ hasError: false, data: rows[0] });
//   } catch (e) { next(e); }
// }

// // DELETE: DELETE /profiles
// export async function deleteProfile(req, res, next) {
//   try {
//     const user_id = req.user_id;
//     const { rowCount } = await pool.query(`DELETE FROM ftn_profiles WHERE user_id=$1`, [user_id]);
//     if (rowCount === 0) return res.status(404).json({ hasError: true, message: "Profile not found" });
//     res.status(204).send();
//   } catch (e) { next(e); }
// }





import { pool } from "../db/pool.js";
import crypto from "crypto";
import { putObject, buildKey, presignGet } from "../utils/s3.js";

/* ===== helpers & validators ===== */
const toNum = (v) => (v == null ? NaN : Number(v));
const validGender = (g) =>
  ["male", "female", "other", "prefer_not_to_say"].includes(String(g));

function validateFull({ name, age, height_cm, weight_kg, gender }) {
  if (!name || typeof name !== "string" || !name.trim()) return "name is required";
  const a = toNum(age), h = toNum(height_cm), w = toNum(weight_kg);
  if (!Number.isFinite(a) || a < 1 || a > 150) return "age must be 1–150";
  if (!Number.isFinite(h) || h < 50 || h > 300) return "height_cm must be 50–300";
  if (!Number.isFinite(w) || w < 10 || w > 500) return "weight_kg must be 10–500";
  if (!validGender(gender)) return "gender must be male|female|other|prefer_not_to_say";
  return null;
}

function computeBmi(weightKg, heightCm) {
  const w = toNum(weightKg), h = toNum(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const m = h / 100;
  return +(w / (m * m)).toFixed(2);
}

// Resolve user id from middleware-decoded token, safely
function uid(req) {
  return req.user_id ?? req.user?.user_id ?? req.user?.id ?? req.user?.sub ?? null;
}

const extFromMime = (m) =>
  /png$/i.test(m) ? "png" :
  /jpe?g$/i.test(m) ? "jpg" :
  /webp$/i.test(m) ? "webp" :
  /gif$/i.test(m) ? "gif" : "bin";

/* ===== UPLOAD PHOTO -> S3, store KEY in DB ===== */
export async function uploadProfilePhoto(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });
    if (!req.file) return res.status(400).json({ hasError: true, message: "image is required (field: image)" });

    const ext = extFromMime(req.file.mimetype);
    const fname = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const Key = buildKey("users", user_id, "profile", fname);

    await putObject({ Key, Body: req.file.buffer, ContentType: req.file.mimetype });

    // store KEY (not public URL)
    const { rows } = await pool.query(`
      INSERT INTO public.ftn_profiles (user_id, profile_picture_url, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET profile_picture_url = EXCLUDED.profile_picture_url, updated_at = NOW()
      RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi;
    `, [user_id, Key]);

    const url = await presignGet(Key, 3600);
    return res.json({ hasError: false, key: Key, url, data: rows[0] || null });
  } catch (e) { next(e); }
}

/* ===== CRUD ===== */

// READ: GET /profiles  and GET /profiles/me
export async function getProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { rows } = await pool.query(
      `SELECT first_name AS name,
              profile_picture_url AS user_image, -- stores S3 KEY
              age, height_cm, weight_kg, gender, bmi
         FROM public.ftn_profiles
        WHERE user_id = $1
        LIMIT 1`, [user_id]
    );

    const row = rows[0] || null;
    if (row?.user_image && !/^https?:\/\//i.test(row.user_image)) {
      row.user_image = await presignGet(row.user_image, 3600);
    }

    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// CREATE: POST /profiles  (409 if already exists)
export async function createProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};
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
      [user_id, String(name).trim(), user_image, age, height_cm, weight_kg, gender, bmi]
    );

    if (!rows[0]) return res.status(409).json({ hasError: true, message: "Profile already exists" });
    const row = rows[0];
    if (row?.user_image && !/^https?:\/\//i.test(row.user_image)) {
      row.user_image = await presignGet(row.user_image, 3600);
    }
    return res.status(201).json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// UPSERT: PUT /profiles  (create if missing)
export async function upsertProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { name, user_image = null, age, height_cm, weight_kg, gender } = req.body || {};
    const err = validateFull({ name, age, height_cm, weight_kg, gender });
    if (err) return res.status(400).json({ hasError: true, message: err });

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
      [user_id, String(name).trim(), user_image, age, height_cm, weight_kg, gender, bmi]
    );

    const row = rows[0];
    if (row?.user_image && !/^https?:\/\//i.test(row.user_image)) {
      row.user_image = await presignGet(row.user_image, 3600);
    }
    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// PARTIAL UPDATE: PATCH /profiles
export async function patchProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { rows: curRows } = await pool.query(
      `SELECT height_cm, weight_kg FROM public.ftn_profiles WHERE user_id = $1 LIMIT 1`,
      [user_id]
    );
    const current = curRows[0] || {};

    let nextHeight = ("height_cm" in req.body) ? toNum(req.body.height_cm) : toNum(current.height_cm);
    let nextWeight = ("weight_kg" in req.body) ? toNum(req.body.weight_kg) : toNum(current.weight_kg);

    const sets = [];
    const params = [user_id];

    const pushSet = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if ("name" in req.body) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ hasError: true, message: "name cannot be empty" });
      pushSet("first_name", name);
    }
    if ("user_image" in req.body) pushSet("profile_picture_url", req.body.user_image ?? null);
    if ("age" in req.body) {
      const a = toNum(req.body.age);
      if (!Number.isFinite(a) || a < 1 || a > 150) return res.status(400).json({ hasError: true, message: "age must be 1–150" });
      pushSet("age", a);
    }
    if ("height_cm" in req.body) {
      if (!Number.isFinite(nextHeight) || nextHeight < 50 || nextHeight > 300) {
        return res.status(400).json({ hasError: true, message: "height_cm must be 50–300" });
      }
      pushSet("height_cm", nextHeight);
    }
    if ("weight_kg" in req.body) {
      if (!Number.isFinite(nextWeight) || nextWeight < 10 || nextWeight > 500) {
        return res.status(400).json({ hasError: true, message: "weight_kg must be 10–500" });
      }
      pushSet("weight_kg", nextWeight);
    }
    if ("gender" in req.body) {
      const g = req.body.gender;
      if (!validGender(g)) return res.status(400).json({ hasError: true, message: "gender must be male|female|other|prefer_not_to_say" });
      pushSet("gender", g);
    }

    const shouldRecomputeBmi =
      ("height_cm" in req.body) || ("weight_kg" in req.body) || current.height_cm == null || current.weight_kg == null;

    if (shouldRecomputeBmi && Number.isFinite(nextHeight) && Number.isFinite(nextWeight) && nextHeight > 0 && nextWeight > 0) {
      pushSet("bmi", computeBmi(nextWeight, nextHeight));
    }

    if (sets.length === 0) return res.status(400).json({ hasError: true, message: "No valid fields to update" });

    const sql = `
      UPDATE public.ftn_profiles
      SET ${sets.join(", ")}, updated_at = NOW()
      WHERE user_id = $1
      RETURNING first_name AS name, profile_picture_url AS user_image, age, height_cm, weight_kg, gender, bmi`;
    const { rows } = await pool.query(sql, params);

    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Profile not found" });

    const row = rows[0];
    if (row?.user_image && !/^https?:\/\//i.test(row.user_image)) {
      row.user_image = await presignGet(row.user_image, 3600);
    }
    res.json({ hasError: false, data: row });
  } catch (e) { next(e); }
}

// DELETE: DELETE /profiles
export async function deleteProfile(req, res, next) {
  try {
    const user_id = uid(req);
    if (!user_id) return res.status(401).json({ hasError: true, code: "NO_USER", message: "user not resolved from token" });

    const { rowCount } = await pool.query(
      `DELETE FROM public.ftn_profiles WHERE user_id = $1`, [user_id]
    );
    if (rowCount === 0) return res.status(404).json({ hasError: true, message: "Profile not found" });
    res.status(204).send();
  } catch (e) { next(e); }
}
