import { Router } from "express";
import * as ctrl from "../controllers/images.js";

const r = Router();

// No authentication needed for presign (public access)
r.get("/presign", ctrl.presignGet);

export default r;
