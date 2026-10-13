import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  deleteAdmin,
  deleteAllAdmins,
  getAdmin,
  getAdmins,
  login,
  registerAdmin,
  updateAdmin,
} from "../controllers/admin.controller.js";
import { protect, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again after 15 minutes",
  },
});

// Public (declared before /:id so it isn't captured as an ID)
router.post("/login", loginLimiter, login);

router.use(protect, requireSuperAdmin);

router.route("/").get(getAdmins).post(registerAdmin).delete(deleteAllAdmins);
router.route("/:id").get(getAdmin).put(updateAdmin).delete(deleteAdmin);

export default router;
