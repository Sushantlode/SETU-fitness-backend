import { pool } from "../db/pool.js";
export async function listPlans(req, res, next) {
  try {
    const user_id = req.user_id;
    const { rows } = await pool.query(
      "SELECT * FROM ftn_meal_plan_headers WHERE user_id=$1 ORDER BY created_at DESC",
      [user_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function createPlan(req, res, next) {
  try {
    const user_id = req.user_id;
    const { name, start_date, end_date = null, is_active = true } = req.body;
    if (!name || !start_date)
      return res
        .status(400)
        .json({ hasError: true, message: "name and start_date required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_meal_plan_headers (user_id, name, start_date, end_date, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [user_id, name, start_date, end_date, is_active]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function getPlan(req, res, next) {
  try {
    const { plan_id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM ftn_meal_plan_headers WHERE id=$1",
      [plan_id]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function updatePlan(req, res, next) {
  try {
    const { plan_id } = req.params;
    const {
      name = null,
      start_date = null,
      end_date = null,
      is_active = null,
    } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_meal_plan_headers SET name=COALESCE($2,name),start_date=COALESCE($3,start_date),end_date=COALESCE($4,end_date),is_active=COALESCE($5,is_active),updated_at=NOW() WHERE id=$1 RETURNING *`,
      [plan_id, name, start_date, end_date, is_active]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function deletePlan(req, res, next) {
  try {
    const { plan_id } = req.params;
    await pool.query("DELETE FROM ftn_meal_plan_headers WHERE id=$1", [
      plan_id,
    ]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function listDays(req, res, next) {
  try {
    const { plan_id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM ftn_meal_plan_days WHERE plan_id=$1 ORDER BY day_index",
      [plan_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function addDay(req, res, next) {
  try {
    const { plan_id } = req.params;
    const { day_index, day_date = null } = req.body;
    if (day_index === undefined)
      return res
        .status(400)
        .json({ hasError: true, message: "day_index required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_meal_plan_days (plan_id, day_index, day_date) VALUES ($1,$2,$3) RETURNING *",
      [plan_id, day_index, day_date]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function updateDay(req, res, next) {
  try {
    const { day_id } = req.params;
    const { day_index = null, day_date = null } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_meal_plan_days SET day_index=COALESCE($2,day_index),day_date=COALESCE($3,day_date) WHERE id=$1 RETURNING *`,
      [day_id, day_index, day_date]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function deleteDay(req, res, next) {
  try {
    const { day_id } = req.params;
    await pool.query("DELETE FROM ftn_meal_plan_days WHERE id=$1", [day_id]);
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
export async function listSlots(req, res, next) {
  try {
    const { day_id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM ftn_meal_plan_slots WHERE plan_day_id=$1 ORDER BY slot_type",
      [day_id]
    );
    res.json({ hasError: false, data: rows });
  } catch (e) {
    next(e);
  }
}
export async function addSlot(req, res, next) {
  try {
    const { day_id } = req.params;
    const { slot_type, meal_id = null, notes = null } = req.body;
    if (!slot_type)
      return res
        .status(400)
        .json({ hasError: true, message: "slot_type required" });
    const { rows } = await pool.query(
      "INSERT INTO ftn_meal_plan_slots (plan_day_id, slot_type, meal_id, notes) VALUES ($1,$2,$3,$4) RETURNING *",
      [day_id, slot_type, meal_id, notes]
    );
    res.json({ hasError: false, data: rows[0] });
  } catch (e) {
    next(e);
  }
}
export async function updateSlot(req, res, next) {
  try {
    const { day_id, slot_id } = req.params;
    const { slot_type = null, meal_id = null, notes = null } = req.body;
    const { rows } = await pool.query(
      `UPDATE ftn_meal_plan_slots SET slot_type=COALESCE($3,slot_type),meal_id=COALESCE($4,meal_id),notes=COALESCE($5,notes) WHERE id=$2 AND plan_day_id=$1 RETURNING *`,
      [day_id, slot_id, slot_type, meal_id, notes]
    );
    res.json({ hasError: false, data: rows[0] || null });
  } catch (e) {
    next(e);
  }
}
export async function deleteSlot(req, res, next) {
  try {
    const { day_id, slot_id } = req.params;
    await pool.query(
      "DELETE FROM ftn_meal_plan_slots WHERE id=$2 AND plan_day_id=$1",
      [day_id, slot_id]
    );
    res.json({ hasError: false });
  } catch (e) {
    next(e);
  }
}
