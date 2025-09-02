// src/routes/meals.js
import { Router } from "express";
import {
  createDailyMeal,
  listDailyMeals,
  getDailyMeal,
  updateDailyMeal,
  deleteDailyMeal,
  dailyConsumed,
  dailyStatus,
  todayMeals,
} from "../controllers/meals.js";

const r = Router();

/* Reports */
r.get("/today",          todayMeals);      // today's meals + totals
r.get("/daily/summary",  dailyConsumed);   // ?day=YYYY-MM-DD
r.get("/daily/status",   dailyStatus);     // ?day=YYYY-MM-DD

/* CRUD */
r.post("/",  createDailyMeal);
r.get("/",   listDailyMeals);
r.get("/:id", getDailyMeal);
r.put("/:id", updateDailyMeal);
r.delete("/:id", deleteDailyMeal);

export default r;
