import { Router } from "express";
import {
  createRole,
  deleteRole,
  getRole,
  getRoles,
  updateRole,
} from "../controllers/role.controller.js";
import { protect, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

router.use(protect, requireSuperAdmin);

router.route("/").get(getRoles).post(createRole);
router.route("/:id").get(getRole).put(updateRole).delete(deleteRole);

export default router;
