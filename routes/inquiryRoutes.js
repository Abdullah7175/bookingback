import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  addResponse,
  deleteInquiry,
} from "../controllers/inquiryController.js";

const router = express.Router();

// Anyone authenticated can create inquiry
router.post("/", protect, createInquiry);

// Role-based access
router.get("/", protect, getInquiries);
router.get("/:id", protect, getInquiryById);
router.put("/:id", protect, updateInquiry);
router.post("/:id/respond", protect, addResponse);
router.delete("/:id", protect, authorizeRoles("admin"), deleteInquiry);

export default router;
