import { Router } from "express";
import prisma from "../config/prisma.js";
import { logout } from "../controllers/admin.controller.js";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import roleRoutes from "./role.routes.js";
import userRoutes from "./user.routes.js";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, status: "ok", database: "up" });
  } catch {
    res.status(503).json({ success: false, status: "degraded", database: "down" });
  }
});

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/user", userRoutes);
router.use("/role", roleRoutes);

// Legacy logout endpoint kept for older frontends.
router.route("/logout").get(logout).post(logout);

export default router;
