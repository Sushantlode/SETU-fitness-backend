// src/app.js
import express from "express";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { authenticateJWT } from "./middleware/auth.js";

// PUBLIC routers
import healthRouter from "./routes/health.js";
import nutritionRouter from "./routes/nutrition.js";
import foodRouter from "./routes/food.js";

// PROTECTED routers
import profilesRouter from "./routes/profiles.js";
import hydrationRouter from "./routes/hydration.js";
import dashboardRouter from "./routes/dashboard.js";
import recipesRouter from "./routes/recipes.js";
import mealsRouter from "./routes/meals.js";
import favouritesRouter from "./routes/favourites.js";
import mealPlansRouter from "./routes/mealPlans.js";
import swapsRouter from "./routes/swaps.js";
import motivationsRouter from "./routes/motivations.js";
import imagesRouter from "./routes/images.js";
import workoutRouter from "./routes/workout.js";
import googlefitRouter from "./routes/googlefit.js";
import healthySwapsRouter from "./routes/healthySwaps.js";
import userPlansRouter from "./routes/userPlans.js";

export const app = express();

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Token"],
  exposedHeaders: ["Authorization", "X-Refresh-Token"],
}));

// Logs first
app.use(morgan("dev"));

// JSON body parser with guard
app.use(express.json({
  limit: "2mb",
  strict: false,
  verify: (req, res, buf) => {
    if (!buf || buf.length === 0) return;
    try { JSON.parse(buf.toString("utf8")); }
    catch { throw new Error("Invalid JSON in request body"); }
  }
}));

// JSON syntax error -> 400
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ hasError: true, message: "Invalid JSON in request body" });
  }
  next(err);
});

// ---------- Public routes ----------
app.use("/health", healthRouter);
app.use("/nutrition", nutritionRouter);
app.use("/food", foodRouter);

// ---------- Protected routes ----------
app.use(authenticateJWT);
app.use("/profiles", profilesRouter);
app.use("/hydration", hydrationRouter);
app.use("/dashboard", dashboardRouter);
app.use("/recipes", recipesRouter);
app.use("/meals", mealsRouter);
app.use("/favourites", favouritesRouter);
app.use("/meal-plans", mealPlansRouter);
app.use("/swaps", swapsRouter);
app.use("/motivations", motivationsRouter);
app.use("/images", imagesRouter);
app.use("/workout", workoutRouter);
app.use("/googlefit", googlefitRouter);
app.use("/healthy-swaps", healthySwapsRouter);
app.use("/user-plans", userPlansRouter);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ hasError: true, message: err.message || "Internal error" });
});
