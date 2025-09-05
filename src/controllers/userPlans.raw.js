import { Router } from "express";
import { pool } from "../db/pool.js";

const r = Router();
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve a profile UUID for the caller */
async function resolveProfileUuid(req) {
  const hdr = req.get("X-Profile-Id");                 // dev/testing override
  const candidate = (hdr || req.profile_id || req.user_id || req.user?.user_id || "").toString().trim();
  if (!candidate) return null;

  const { rows } = await pool.query(
    `SELECT id FROM ftn_profiles
      WHERE id::text = $1 OR user_id::text = $1
      LIMIT 1`,
    [candidate]
  );
  return rows[0]?.id || null;
}

/** POST /user-plans  { swapId, scheduledDate(YYYY-MM-DD), isCompleted? } */
r.post("/user-plans", async (req, res) => {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: "unknown profile" });

    const { swapId, scheduledDate, isCompleted } = req.body || {};
    if (!Number.isInteger(swapId)) return res.status(400).json({ hasError: true, message: "swapId (int) required" });
    if (!DAY_RE.test(String(scheduledDate))) return res.status(400).json({ hasError: true, message: "scheduledDate must be YYYY-MM-DD" });

    // Ensure swap exists & active
    const s = await pool.query(
      `SELECT id FROM healthy_swaps WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [swapId]
    );
    if (!s.rows[0]) return res.status(404).json({ hasError: true, message: "swap not found or inactive" });

    // Upsert plan (unique: user_id + day + swap_id)
    const ins = await pool.query(
      `INSERT INTO user_plans (user_id, swap_id, scheduled_date, is_completed)
       VALUES ($1::uuid, $2::int, $3::date, COALESCE($4::boolean, FALSE))
       ON CONFLICT (user_id, scheduled_date, swap_id)
       DO UPDATE SET is_completed = EXCLUDED.is_completed, updated_at = NOW()
       RETURNING id`,
      [profileId, swapId, scheduledDate, isCompleted]
    );
    const planId = ins.rows[0].id;

    // Return joined row
    const { rows } = await pool.query(
      `SELECT up.id, up.user_id, up.scheduled_date, up.is_completed,
              hs.id AS swap_id, hs.category, hs.unhealthy_item, hs.healthy_alternative,
              hs.calories_saved, hs.image_url, hs.benefits
         FROM user_plans up
         JOIN healthy_swaps hs ON hs.id = up.swap_id
        WHERE up.id = $1::bigint`,
      [planId]
    );
    return res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ hasError: true, message: "Failed to add to plan" });
  }
});

/** GET /user-plans?page=&limit=&start=&end=  (all for caller; optional date range, paginated) */
r.get("/user-plans", async (req, res) => {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: "unknown profile" });

    const page  = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const offset = (page - 1) * limit;

    const start = req.query.start && DAY_RE.test(req.query.start) ? req.query.start : null;
    const end   = req.query.end   && DAY_RE.test(req.query.end)   ? req.query.end   : null;

    const filters = [`up.user_id = $1::uuid`];
    const params = [profileId];

    if (start && end) {
      filters.push(`up.scheduled_date BETWEEN $2::date AND $3::date`);
      params.push(start, end);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const q = `
      SELECT up.id, up.user_id, up.scheduled_date, up.is_completed,
             hs.id AS swap_id, hs.category, hs.unhealthy_item, hs.healthy_alternative,
             hs.calories_saved, hs.image_url, hs.benefits
      FROM user_plans up
      JOIN healthy_swaps hs ON hs.id = up.swap_id
      ${where}
      ORDER BY up.scheduled_date ASC, up.id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const { rows } = await pool.query(q, params);

    // count for pagination
    const cq = `SELECT COUNT(*)::int AS cnt FROM user_plans up ${where}`;
    const { rows: crows } = await pool.query(cq, params);

    return res.json({
      hasError: false,
      meta: { page, limit, total: crows[0].cnt },
      data: rows
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ hasError: true, message: "Failed to fetch plans" });
  }
});

/** GET /user-plans/by-day?day=YYYY-MM-DD */
r.get("/user-plans/by-day", async (req, res) => {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: "unknown profile" });

    const day = String(req.query.day || "");
    if (!DAY_RE.test(day)) return res.status(400).json({ hasError: true, message: "day must be YYYY-MM-DD" });

    const { rows } = await pool.query(
      `SELECT up.id, up.user_id, up.scheduled_date, up.is_completed,
              hs.id AS swap_id, hs.category, hs.unhealthy_item, hs.healthy_alternative,
              hs.calories_saved, hs.image_url, hs.benefits
         FROM user_plans up
         JOIN healthy_swaps hs ON hs.id = up.swap_id
        WHERE up.user_id = $1::uuid AND up.scheduled_date = $2::date
        ORDER BY up.id ASC`,
      [profileId, day]
    );
    return res.json({ hasError: false, data: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ hasError: true, message: "Failed to fetch plans by day" });
  }
});

export default r;
