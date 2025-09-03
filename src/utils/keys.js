import { buildKey } from "./s3.js";

// folder like: meal_001, meal_012
export const mealFolder = (mealId) => `meal_${String(mealId).padStart(3, "0")}`;

// final S3 object key: fitness/users/<uid>/meals/meal_XXX/<filename>
export const mealImageKey = ({ userId, mealId, filename }) =>
  buildKey("users", String(userId), "meals", mealFolder(mealId), filename);
