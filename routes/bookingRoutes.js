// routes/bookingRoutes.js
import express from "express";
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  deleteBooking,
  getMyBookings,
  getBookingPdf, // <-- make sure this is exported from your controller
} from "../controllers/bookingController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// /api/bookings
router
  .route("/")
  .post(protect, createBooking)      // create booking (agent/admin)
  .get(protect, admin, getBookings); // admin: list all bookings

// /api/bookings/my  -> bookings for logged-in agent
router.get("/my", protect, getMyBookings);

// IMPORTANT: define this BEFORE the /:id block
// /api/bookings/:id/pdf -> download booking PDF
router.get("/:id/pdf", protect, getBookingPdf);

// /api/bookings/:id -> get/update/delete a single booking
router
  .route("/:id")
  .get(protect, getBookingById) // admin or owner
  .put(protect, updateBooking)  // admin or owner
  .delete(protect, deleteBooking); // admin or owner

export default router;
