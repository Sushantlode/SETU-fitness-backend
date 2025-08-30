// src/routes/hydration.js
import { Router } from "express";
import {
  upsertBodyProfileAndGoal,
  getGoal,
  setGoal,
  addLog,
  addLogsBatch,
  getTodayLogs,
  undoLastLog,
  getConsumedToday,
  getDailyRowsByBody,
  resetHydration,
} from "../controllers/hydration.js";
import { pool } from "../db/pool.js";

const r = Router();

/* -------- inline hard guards (no separate file) -------- */

// 401 if no authenticated user id
function requireUser(req, res, next) {
  const uid = req.user_id || req.user?.id || req.userId;
  if (!uid) return res.status(401).json({ hasError: true, message: "Unauthorized" });
  req.user_id = String(uid);
  next();
}

// 404 if profile missing in ftn_profiles
async function requireProfile(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ftn_profiles WHERE user_id = $1 LIMIT 1`,
      [req.user_id]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "Profile not found" });
    next();
  } catch (e) { next(e); }
}

// 404 if no active goal
async function requireActiveGoal(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ftn_hydration_goals WHERE user_id = $1 AND is_active = TRUE LIMIT 1`,
      [req.user_id]
    );
    if (!rows[0]) return res.status(404).json({ hasError: true, message: "No active goal set" });
    next();
  } catch (e) { next(e); }
}

/* -------- apply global guards -------- */
r.use(requireUser, requireProfile);

/* -------- routes -------- */

// Profile-derived recommended goal (requires profile, already enforced)
r.post("/body-profile/upsert", upsertBodyProfileAndGoal);

// Goal read requires an active goal
r.get("/goal", requireActiveGoal, getGoal);

// Set/replace goal (allowed even if no active goal yet)
r.put("/goal", setGoal);

// Logs (need active goal)
r.post("/logs", requireActiveGoal, addLog);
r.post("/logs/batch", requireActiveGoal, addLogsBatch);
r.get("/logs/today", requireActiveGoal, getTodayLogs);
r.delete("/logs/last", requireActiveGoal, undoLastLog);

// Totals & ranges (need active goal)
r.get("/consumed/today", requireActiveGoal, getConsumedToday);
r.post("/daily", requireActiveGoal, getDailyRowsByBody);

// Maintenance: wipe user hydration data (profile required; active goal not required)
r.post("/reset", resetHydration);

export default r;
