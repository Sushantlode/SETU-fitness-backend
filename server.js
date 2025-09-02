// server.js
import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_PATH || ".env" });

import { app } from "./src/app.js";

const PORT = Number(process.env.PORT) || 7004;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fitness backend listening on http://localhost:${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  server.close(() => process.exit(1));
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  server.close(() => process.exit(1));
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => console.log("Process terminated!"));
});
