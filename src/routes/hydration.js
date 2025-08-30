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
} from "../controllers/hydration.js";

const r = Router();

// Profile & goals
r.post("/body-profile/upsert", upsertBodyProfileAndGoal);
r.get("/goal", getGoal);
r.put("/goal", setGoal);

// Water logs
r.post("/logs", addLog);
r.post("/logs/batch", addLogsBatch);
r.get("/logs/today", getTodayLogs);
r.delete("/logs/last", undoLastLog);

// Totals & ranges
r.get("/consumed/today", getConsumedToday);
r.post("/daily", getDailyRowsByBody);

export default r;
