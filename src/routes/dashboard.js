// src/routes/goals.js
import { Router } from "express";
import { getToday, getByDay, getHistory } from "../controllers/dashboard.js";

const r = Router();

r.get("/goals/day", getToday);            // today (IST)
r.get("/goals/day/:day", getByDay);       // specific date
r.get("/goals/history", getHistory);      // range with pagination

export default r;
