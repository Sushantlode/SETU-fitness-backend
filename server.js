// server.js
import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_PATH || ".env" });

// Import the app after environment variables are loaded
import { app } from "./src/app.js";

// Import routes
import hydrationRouter from "./src/routes/hydration.js";
import mealsRouter from "./src/routes/meals.js";
import healthySwapsRouter from "./src/routes/healthySwaps.js";
import userPlansRouter from "./src/routes/userPlans.js";

// Use routes
app.use("/hydration", hydrationRouter);
app.use("/meals", mealsRouter);
app.use("/healthy-swaps", healthySwapsRouter);
app.use("/user-plans", userPlansRouter);


import { app } from "./src/app.js";

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fitness backend listening on http://localhost:${PORT}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle SIGTERM for graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated!");
  });
});
