import { Router } from "express";
import {
  addUser,
  deleteAllUsers,
  deleteUser,
  getAnalytics,
  getUser,
  getUsers,
  updateUser,
} from "../controllers/user.controller.js";
import { protect, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

router.use(protect);

// Named routes come before /:id to avoid parameter capture.
router.get("/analytics", getAnalytics);

router
  .route("/")
  .get(getUsers)
  .post(addUser)
  .delete(requireSuperAdmin, deleteAllUsers);

router.route("/:id").get(getUser).put(updateUser).delete(deleteUser);

export default router;
