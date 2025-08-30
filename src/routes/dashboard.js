import { Router } from "express";
import * as ctrl from "../controllers/dashboard.js";
const r = Router();

r.get("/day", ctrl.day);
// r.get("/today", ctrl.today);
export default r;
