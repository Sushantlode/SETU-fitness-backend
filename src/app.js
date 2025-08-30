// src/app.js
import express from "express";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { authenticateJWT } from "./middleware/auth.js";
import healthRouter from "./routes/health.js";
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
import nutritionRouter from "./routes/nutrition.js";


export const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Token"],
    exposedHeaders: ["Authorization", "X-Refresh-Token"],
  })
);

// Configure body parser with better error handling
app.use(express.json({
  limit: "2mb",
  strict: false, // Allow single values and other non-object JSON
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      throw new Error('Invalid JSON in request body');
    }
  }
}));

// Custom JSON error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      hasError: true,
      message: 'Invalid JSON in request body',
      details: 'Please ensure your JSON is properly formatted with double quotes for property names'
    });
  }
  next();
});

app.use(morgan("dev"));

// Public routes
app.use("/health", healthRouter);
app.use("/nutrition", nutritionRouter);

// Protected routes (require authentication)
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
// Error handler (kept)
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ hasError: true, message: err.message || "Internal error" });
});
