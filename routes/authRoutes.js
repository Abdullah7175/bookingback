import express from "express";
import { loginUser, registerUser } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { permit } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/login", loginUser);
// router.post("/register", registerUser);

// Only admins can register new users
router.post("/register", protect, permit("admin"), registerUser);

export default router;
