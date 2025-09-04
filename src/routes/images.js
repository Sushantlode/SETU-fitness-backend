// import { Router } from "express";
// import * as ctrl from "../controllers/images.js";

// const r = Router();

// // No authentication needed for presign (public access)
// r.get("/presign", ctrl.presignGet);

// export default r;



// routes/images.js
import { Router } from "express";
import * as ctrl from "../controllers/images.js";

const r = Router();

// Public presigns
r.get("/presign", ctrl.presignGet);          // GET presign (download)
r.post("/presign-upload", ctrl.presignUpload); // PUT presign (upload)

export default r;
