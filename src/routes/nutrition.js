import { Router } from "express";
import * as ctrl from "../controllers/nutrition.js";

const router = Router();

// Apply middleware to skip body parsing for GET requests
router.use(ctrl.skipBodyParserForGet);

// Get macronutrient advice
router.get("/macros", ctrl.getMacroAdvice);

// Get daily nutrition tip
router.get("/daily-tip", ctrl.getDailyTip);

export default router;
