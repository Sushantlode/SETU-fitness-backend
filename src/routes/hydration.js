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
} from "../controllers/hydration.js"; // keep .js extension

const r = Router();

// fail fast if any controller is missing
const must = [
  upsertBodyProfileAndGoal, getGoal, setGoal, addLog, addLogsBatch,
  getTodayLogs, undoLastLog, getConsumedToday, getDailyRowsByBody
];
if (must.some(fn => typeof fn !== "function")) {
  throw new Error("Hydration controllers not exported correctly");
}

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
