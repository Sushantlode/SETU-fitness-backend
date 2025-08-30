import { Router } from "express";
import * as ctrl from "../controllers/favourites.js";
const r = Router();
r.get("/meals", ctrl.listMeals);
r.post("/meals", ctrl.addMeal);
r.delete("/meals/:meal_id", ctrl.removeMeal);
export default r;
