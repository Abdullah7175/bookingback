// routes/agentRoutes.js
import express from "express";
import mongoose from "mongoose";
import {
  registerAgent,
  loginAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  getAgentPerformance, // make sure this is exported from agentController.js
} from "../controllers/agentController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import { ensureCompany } from "../middleware/companyContext.js";

const router = express.Router();

/** ---------- Specific routes FIRST ---------- **/

// Public login
router.post("/login", loginAgent);

// Register agent (admin-only, no company requirement for single-tenant)
router.post("/register", protect, admin, registerAgent);

// Team performance (admin-only, no company requirement for single-tenant)
router.get("/performance", protect, admin, getAgentPerformance);

/** ---------- Validate :id once for all dynamic routes ---------- **/
router.param("id", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid agent id" });
  }
  next();
});

// Who am I (helps client store companyId after login)
router.get("/me", protect, (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    company: req.user.company ?? null,
  });
});

/** ---------- Dynamic :id routes (no inline regex) ---------- **/
router.get("/:id", protect, admin, getAgentById);
router.put("/:id", protect, updateAgent);          // self or admin (checked in controller)
router.delete("/:id", protect, admin, deleteAgent);

// List all agents (admin-only)
router.get("/", protect, admin, getAgents);

export default router;
