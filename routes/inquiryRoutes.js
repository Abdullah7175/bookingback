import express from "express";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import {
  createInquiry,
  getInquiries,
  getInquiryById,
  updateInquiry,
  addResponse,
  deleteInquiry,
  manualForwardInquiryWebhook,
  assignInquiryToAgent,
} from "../controllers/inquiryController.js";

const router = express.Router();

// Create inquiry (authenticated app flow)
router.post("/", protect, createInquiry);

// Public alias to match external spec: /api/inquiries/create
// Apply protect if you want to restrict; leaving public to allow external form posts
router.post("/create", createInquiry);

// Role-based access
router.get("/", protect, getInquiries);

// IMPORTANT: Specific routes must come BEFORE parameterized routes (/:id)
// Otherwise Express will match /:id first and treat "assign" as an ID

// Manual forward webhook (secured via X-Api-Key header)
router.post("/:id/forward-webhook", manualForwardInquiryWebhook);

// Specific action routes
router.post("/:id/respond", protect, addResponse);
router.post("/:id/assign", protect, authorizeRoles("admin"), assignInquiryToAgent); // Assign inquiry and create booking

// Generic routes (must come last)
router.get("/:id", protect, getInquiryById);
router.put("/:id", protect, updateInquiry);
router.delete("/:id", protect, authorizeRoles("admin"), deleteInquiry);

export default router;
