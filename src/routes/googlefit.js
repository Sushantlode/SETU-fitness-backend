// routes/googlefit.js
import { Router } from "express";
import {
  startConnect,
  oauthCallback,
  syncFit,
  getDaily,
  getIntraday
} from "../controllers/googlefit.js";

const r = Router();

// Link account (behind JWT so we know user_id)
r.get("/connect", startConnect);          // returns {url} to open consent
r.get("/callback", oauthCallback);        // Google redirects here

// Sync + read
r.post("/sync", syncFit);                 // body: {start?,end?,bucketSec?}
r.get("/daily", getDaily);                // query: start,end
r.get("/intraday", getIntraday);          // query: date

export default r;
