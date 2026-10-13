import { Router } from "express";
import { currentSession, logout } from "../controllers/admin.controller.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.get("/current", protect, currentSession);
router.post("/logout", logout);

export default router;
