import { Router } from "express";
import { uploadImage } from "../middleware/upload.js";
import {
  createDailyMeal, updateDailyMeal,
  listDailyMeals, getDailyMeal, deleteDailyMeal,
  todayMeals, dailyConsumed, dailyStatus,
  dailyNeeds
} from "../controllers/meals.js";

const r = Router();

// create / update accept multipart image field: "image"
r.post("/meals", uploadImage, createDailyMeal);
r.put("/meals/:id", uploadImage, updateDailyMeal);

r.get("/meals", listDailyMeals);
r.get("/meals/today", todayMeals);
r.get("/meals/daily/summary", dailyConsumed);
r.get("/meals/daily/status", dailyStatus);

// NEW: compute + persist targets from BMI, and return snapshot
r.get("/meals/daily/needs", dailyNeeds);

r.get("/meals/:id", getDailyMeal);
r.delete("/meals/:id", deleteDailyMeal);

export default r;
