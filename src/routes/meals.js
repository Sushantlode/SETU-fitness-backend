import { Router } from "express";
import multerPkg from "multer";
const multer = multerPkg.default ?? multerPkg;

import {
  createDailyMeal,
  listDailyMeals,
  getDailyMeal,
  updateDailyMeal,
  deleteDailyMeal,
  dailyConsumed,
  dailyStatus,
  todayMeals,
  uploadMealImage, // NEW
} from "../controllers/meals.js";

const r = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("ONLY_IMAGES"));
  },
});

/* Photo only (returns {key,url}); owner-only via auth */
r.post("/photo", upload.single("image"), uploadMealImage);

/* Reports */
r.get("/today",          todayMeals);
r.get("/daily/summary",  dailyConsumed);   // ?day=YYYY-MM-DD
r.get("/daily/status",   dailyStatus);     // ?day=YYYY-MM-DD

/* CRUD (multipart supported for image) */
r.post("/",     upload.single("image"), createDailyMeal);
r.get("/",      listDailyMeals);
r.get("/:id",   getDailyMeal);
r.put("/:id",   upload.single("image"), updateDailyMeal);
r.delete("/:id", deleteDailyMeal);

export default r;
