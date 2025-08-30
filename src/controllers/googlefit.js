// controllers/googlefit.js
import { google } from "googleapis";
import axios from "axios";
import { pool } from "../db/pool.js";

/* ========= CONFIG ========= */
const SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read"
];
const FIT_ENDPOINT = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";

/* ========= OAUTH HELPERS ========= */
function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI   // e.g. https://api.yourapp.com/googlefit/callback
  );
}
function authUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensure refresh_token on first connect
    scope: SCOPES,
    state,
  });
}
async function exchangeCode(code) {
  const o = oauthClient();
  const { tokens } = await o.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, token_type }
}
async function getAccessToken(user_id) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_type, expiry_date
       FROM google_fit_tokens WHERE user_id=$1`, [user_id]
  );
  if (!rows[0]) throw new Error("Google Fit not linked");
  const o = oauthClient();
  o.setCredentials(rows[0]);

  const exp = Number(rows[0].expiry_date || 0);
  if (!exp || exp < Date.now() + 60_000) {
    const { credentials } = await o.refreshAccessToken();
    await pool.query(
      `UPDATE google_fit_tokens
          SET access_token=$2,
              refresh_token=COALESCE($3, refresh_token),
              token_type=$4,
              expiry_date=$5,
              updated_at=NOW()
        WHERE user_id=$1`,
      [user_id, credentials.access_token, credentials.refresh_token || null, credentials.token_type, credentials.expiry_date || 0]
    );
    return credentials.access_token;
  }
  return rows[0].access_token;
}

/* ========= SELF-MIGRATING SCHEMA ========= */
async function ensureSchema() {
  await pool.query(`
    DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS google_fit_tokens (
      user_id INT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'google',
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_type TEXT NOT NULL,
      expiry_date BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fit_daily_metrics (
      user_id INT NOT NULL,
      day DATE NOT NULL,
      steps INT NOT NULL DEFAULT 0,
      calories_kcal NUMERIC(12,3) NOT NULL DEFAULT 0,
      distance_m NUMERIC(12,3) NOT NULL DEFAULT 0,
      source TEXT,
      last_synced_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS fit_intraday_metrics (
      user_id INT NOT NULL,
      bucket_start TIMESTAMPTZ NOT NULL,
      bucket_end   TIMESTAMPTZ NOT NULL,
      steps INT NOT NULL DEFAULT 0,
      calories_kcal NUMERIC(12,3) NOT NULL DEFAULT 0,
      distance_m NUMERIC(12,3) NOT NULL DEFAULT 0,
      last_synced_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, bucket_start, bucket_end)
    );
  `);
}
ensureSchema().catch(e => console.error("ensureSchema(googlefit) failed:", e));

/* ========= AGGREGATE CALL ========= */
async function aggregate(user_id, startMs, endMs, bucketSeconds = 300) {
  const token = await getAccessToken(user_id);
  const body = {
    aggregateBy: [
      { dataTypeName: "com.google.step_count.delta" },
      { dataTypeName: "com.google.calories.expended" },
      { dataTypeName: "com.google.distance.delta" }
    ],
    bucketByTime: { durationMillis: bucketSeconds * 1000 },
    startTimeMillis: startMs,
    endTimeMillis: endMs
  };
  const { data } = await axios.post(FIT_ENDPOINT, body, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

/* ========= STORAGE HELPERS ========= */
function sumFromBucketDataset(bucket) {
  let steps = 0, kcal = 0, dist = 0;
  for (const ds of bucket.dataset || []) {
    for (const p of (ds.point || [])) {
      const v = p.value?.[0];
      const type = p.dataTypeName;
      if (type === "com.google.step_count.delta") steps += Number(v?.intVal ?? v?.fpVal ?? 0);
      if (type === "com.google.calories.expended") kcal  += Number(v?.fpVal ?? 0);
      if (type === "com.google.distance.delta")   dist  += Number(v?.fpVal ?? 0); // meters
    }
  }
  return { steps, kcal, dist };
}

async function upsertAggregates(user_id, agg) {
  if (!agg?.bucket?.length) return;

  const intradayRows = [];
  const dailyMap = new Map(); // day -> {steps,kcal,dist}

  for (const b of agg.bucket) {
    const sMs = Number(b.startTimeMillis);
    const eMs = Number(b.endTimeMillis);
    const { steps, kcal, dist } = sumFromBucketDataset(b);

    const sIso = new Date(sMs).toISOString();
    const eIso = new Date(eMs).toISOString();
    intradayRows.push({ sIso, eIso, steps, kcal, dist });

    const day = new Date(sMs).toISOString().slice(0, 10);
    const acc = dailyMap.get(day) || { steps: 0, kcal: 0, dist: 0 };
    acc.steps += steps; acc.kcal += kcal; acc.dist += dist;
    dailyMap.set(day, acc);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // intraday upsert
    if (intradayRows.length) {
      const params = [];
      const values = [];
      intradayRows.forEach((r, i) => {
        params.push(user_id, r.sIso, r.eIso, r.steps, r.kcal, r.dist);
        const off = i * 6;
        values.push(`($${off+1}, $${off+2}::timestamptz, $${off+3}::timestamptz, $${off+4}::int, $${off+5}::numeric, $${off+6}::numeric)`);
      });
      await client.query(
        `INSERT INTO fit_intraday_metrics (user_id, bucket_start, bucket_end, steps, calories_kcal, distance_m)
         VALUES ${values.join(",")}
         ON CONFLICT (user_id, bucket_start, bucket_end) DO UPDATE SET
           steps=EXCLUDED.steps,
           calories_kcal=EXCLUDED.calories_kcal,
           distance_m=EXCLUDED.distance_m,
           last_synced_at=NOW()`,
        params
      );
    }

    // daily upsert
    for (const [day, v] of dailyMap.entries()) {
      await client.query(
        `INSERT INTO fit_daily_metrics (user_id, day, steps, calories_kcal, distance_m, source, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (user_id, day) DO UPDATE SET
           steps=EXCLUDED.steps,
           calories_kcal=EXCLUDED.calories_kcal,
           distance_m=EXCLUDED.distance_m,
           source=EXCLUDED.source,
           last_synced_at=NOW()`,
        [user_id, day, v.steps, v.kcal, v.dist, "aggregate:steps+calories+distance"]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/* ========= CONTROLLER ENDPOINTS ========= */

// GET /googlefit/connect  -> returns {url}
export async function startConnect(req, res) {
  const state = String(req.user_id || "0");
  res.json({ hasError: false, url: authUrl(state) });
}

// GET /googlefit/callback?code=...&state=<user_id>
export async function oauthCallback(req, res, next) {
  try {
    const code = String(req.query.code || "");
    const user_id = parseInt(String(req.query.state || "0"), 10);
    const t = await exchangeCode(code);
    if (!t.refresh_token) {
      return res.status(400).json({ hasError: true, message: "No refresh_token. Retry with consent." });
    }
    await pool.query(
      `INSERT INTO google_fit_tokens
        (user_id, provider, access_token, refresh_token, token_type, expiry_date, created_at, updated_at)
       VALUES ($1,'google',$2,$3,$4,$5,NOW(),NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         access_token=EXCLUDED.access_token,
         refresh_token=EXCLUDED.refresh_token,
         token_type=EXCLUDED.token_type,
         expiry_date=EXCLUDED.expiry_date,
         updated_at=NOW()`,
      [user_id, t.access_token, t.refresh_token, t.token_type || "Bearer", t.expiry_date || 0]
    );
    res.send("Google Fit linked. You can close this window.");
  } catch (e) { next(e); }
}

// POST /googlefit/sync   { start?: "YYYY-MM-DD", end?: "YYYY-MM-DD", bucketSec?: 300 }
export async function syncFit(req, res, next) {
  try {
    const user_id = req.user_id;
    const end = req.body?.end ? new Date(req.body.end + "T23:59:59Z") : new Date();
    const start = req.body?.start ? new Date(req.body.start + "T00:00:00Z") : new Date(end.getTime() - 7*86400000);
    const bucketSec = Number(req.body?.bucketSec || 300);

    const agg = await aggregate(user_id, start.getTime(), end.getTime(), bucketSec);
    await upsertAggregates(user_id, agg);

    res.json({
      hasError: false,
      message: "Synced",
      range: { start: start.toISOString(), end: end.toISOString() }
    });
  } catch (e) { next(e); }
}

// GET /googlefit/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
export async function getDaily(req, res, next) {
  try {
    const user_id = req.user_id;
    const start = req.query.start || new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const end   = req.query.end   || new Date().toISOString().slice(0,10);
    const { rows } = await pool.query(
      `SELECT day, steps, calories_kcal, distance_m, last_synced_at
         FROM fit_daily_metrics
        WHERE user_id=$1 AND day BETWEEN $2::date AND $3::date
        ORDER BY day DESC`,
      [user_id, start, end]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}

// GET /googlefit/intraday?date=YYYY-MM-DD
export async function getIntraday(req, res, next) {
  try {
    const user_id = req.user_id;
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const start = new Date(`${date}T00:00:00Z`).toISOString();
    const end   = new Date(`${date}T23:59:59Z`).toISOString();
    const { rows } = await pool.query(
      `SELECT bucket_start, bucket_end, steps, calories_kcal, distance_m
         FROM fit_intraday_metrics
        WHERE user_id=$1 AND bucket_start >= $2 AND bucket_end <= $3
        ORDER BY bucket_start ASC`,
      [user_id, start, end]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) { next(e); }
}
