// server.js
import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_PATH || ".env" });


import { app } from "./src/app.js";

const PORT = Number(process.env.PORT);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fitness backend listening on http://localhost:${PORT}`);
});

// Optional: harden process
process.on("unhandledRejection", (e) =>
  console.error("unhandledRejection:", e)
);
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
