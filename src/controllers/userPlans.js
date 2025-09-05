// src/controllers/userPlans.js
import { pool } from '../db/pool.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// resolve caller → ftn_profiles.id (UUID). Accepts:
//  - X-Profile-Id header (UUID)  [use this for testing]
//  - req.profile_id (UUID)
//  - req.user_id / req.user.user_id (string/int) → maps via ftn_profiles.user_id
async function resolveProfileUuid(req) {
  const hdr = (req.get('X-Profile-Id') || '').trim();
  if (hdr && /^[0-9a-f-]{36}$/i.test(hdr)) return hdr;

  const cand = String(req.profile_id ?? req.user_id ?? req.user?.user_id ?? req.user?.id ?? '').trim();
  if (!cand) return null;

  const { rows } = await pool.query(
    `SELECT id
       FROM ftn_profiles
      WHERE id::text = $1 OR user_id::text = $1
      LIMIT 1`,
    [cand]
  );
  return rows[0]?.id || null;
}

/** POST /user-plans { swapId, scheduledDate (YYYY-MM-DD), isCompleted? } */
export async function addToPlan(req, res) {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: 'unknown profile' });

    const { swapId, scheduledDate, isCompleted } = req.body || {};
    if (!Number.isInteger(swapId)) return res.status(400).json({ hasError: true, message: 'swapId (int) required' });
    if (!DAY_RE.test(String(scheduledDate))) return res.status(400).json({ hasError: true, message: 'scheduledDate must be YYYY-MM-DD' });

    // ensure swap exists & active
    const s = await pool.query(`SELECT 1 FROM healthy_swaps WHERE id=$1 AND is_active=TRUE`, [swapId]);
    if (!s.rows[0]) return res.status(404).json({ hasError: true, message: 'swap not found or inactive' });

    const ins = await pool.query(
      `INSERT INTO user_plans (user_id, swap_id, scheduled_date, is_completed)
       VALUES ($1::uuid, $2::int, $3::date, COALESCE($4::boolean,FALSE))
       ON CONFLICT (user_id, scheduled_date, swap_id)
       DO UPDATE SET is_completed = EXCLUDED.is_completed, updated_at = NOW()
       RETURNING id`,
      [profileId, swapId, scheduledDate, isCompleted]
    );
    const planId = ins.rows[0].id;

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
    res.status(500).json({ hasError: true, message: 'Failed to add to plan' });
  }
}

/** GET /user-plans?day=YYYY-MM-DD | ?start=YYYY-MM-DD&end=YYYY-MM-DD&page=1&limit=20 */
export async function getUserPlans(req, res) {
  try {
    const profileId = await resolveProfileUuid(req);   // ← THIS prevents "uuid: \"39\"" errors
    if (!profileId) return res.status(401).json({ hasError: true, message: 'unknown profile' });

    const page  = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const day   = req.query.day;
    const start = req.query.start;
    const end   = req.query.end;

    const conds = ['up.user_id = $1::uuid'];
    const params = [profileId];
    let p = 2;

    if (day && DAY_RE.test(day)) {
      conds.push(`up.scheduled_date = $${p++}::date`);
      params.push(day);
    } else if (start && end && DAY_RE.test(start) && DAY_RE.test(end)) {
      conds.push(`up.scheduled_date BETWEEN $${p++}::date AND $${p++}::date`);
      params.push(start, end);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const dataQ = `
      SELECT up.id, up.user_id, up.scheduled_date, up.is_completed,
             hs.id AS swap_id, hs.category, hs.unhealthy_item, hs.healthy_alternative,
             hs.calories_saved, hs.image_url, hs.benefits
        FROM user_plans up
        JOIN healthy_swaps hs ON hs.id = up.swap_id
       ${where}
       ORDER BY up.scheduled_date ASC, up.id ASC
       LIMIT ${limit} OFFSET ${offset}`;
    const cntQ = `SELECT COUNT(*)::int AS cnt FROM user_plans up ${where}`;

    const [dataRes, cntRes] = await Promise.all([
      pool.query(dataQ, params),
      pool.query(cntQ, params),
    ]);

    res.json({ hasError: false, meta: { page, limit, total: cntRes.rows[0].cnt }, data: dataRes.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ hasError: true, message: 'Failed to fetch user plans' });
  }
}

/** PATCH /user-plans/:planId/status  { isCompleted:boolean } */
export async function updatePlanStatus(req, res) {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: 'unknown profile' });

    const planId = parseInt(req.params.planId, 10);
    if (!Number.isInteger(planId)) return res.status(400).json({ hasError: true, message: 'invalid planId' });

    const { isCompleted } = req.body || {};
    if (typeof isCompleted !== 'boolean') {
      return res.status(400).json({ hasError: true, message: 'isCompleted (boolean) required' });
    }

    const upd = await pool.query(
      `UPDATE user_plans
          SET is_completed = $1::boolean, updated_at = NOW()
        WHERE id = $2::bigint AND user_id = $3::uuid
        RETURNING id`,
      [isCompleted, planId, profileId]
    );
    if (!upd.rows[0]) return res.status(404).json({ hasError: true, message: 'plan not found' });

    const { rows } = await pool.query(
      `SELECT up.id, up.user_id, up.scheduled_date, up.is_completed,
              hs.id AS swap_id, hs.category, hs.unhealthy_item, hs.healthy_alternative,
              hs.calories_saved, hs.image_url, hs.benefits
         FROM user_plans up
         JOIN healthy_swaps hs ON hs.id = up.swap_id
        WHERE up.id = $1::bigint`,
      [planId]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ hasError: true, message: 'Failed to update plan status' });
  }
}

/** DELETE /user-plans/:planId */
export async function removeFromPlan(req, res) {
  try {
    const profileId = await resolveProfileUuid(req);
    if (!profileId) return res.status(401).json({ hasError: true, message: 'unknown profile' });

    const planId = parseInt(req.params.planId, 10);
    if (!Number.isInteger(planId)) return res.status(400).json({ hasError: true, message: 'invalid planId' });

    const del = await pool.query(
      `DELETE FROM user_plans
        WHERE id = $1::bigint AND user_id = $2::uuid
        RETURNING id`,
      [planId, profileId]
    );
    if (!del.rows[0]) return res.status(404).json({ hasError: true, message: 'plan not found' });

    res.json({ hasError: false, message: 'removed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ hasError: true, message: 'Failed to remove from plan' });
  }
}
