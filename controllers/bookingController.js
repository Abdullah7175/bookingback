// controllers/bookingController.js

import PDFDocument from "pdfkit";
import Booking from "../models/Booking.js";

/**
 * @desc    Create new booking
 * @route   POST /api/bookings
 * @access  Private (logged-in user)
 *
 * Accepts BOTH your original fields and the new revision payload.
 * Validates PNR (if provided) to be exactly 6 characters (A–Z/0–9).
 */

// ----------------------------- PDF: GET /:id/pdf -----------------------------
export const getBookingPdf = async (req, res) => {
  const { id } = req.params;
  const booking = await Booking.findById(id).populate("agent", "name email");

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // RBAC: admin or owner
  if (
    req.user.role !== "admin" &&
    booking.agent.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({ message: "Not authorized" });
  }

  // headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="booking-${booking._id}.pdf"`
  );

  // pdf
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  doc.pipe(res);

  doc.fontSize(16).text("Booking Summary", { align: "left" });
  doc.moveDown();

  doc.fontSize(12).text(`Booking ID: ${booking._id}`);
  doc.text(`Customer: ${booking.customerName || "—"}`);
  doc.text(`Email: ${booking.customerEmail || "—"}`);
  doc.text(`Package: ${booking.package || "—"}`);
  doc.text(
    `Date: ${
      booking.date ? new Date(booking.date).toISOString().slice(0, 10) : "—"
    }`
  );
  doc.text(`Status: ${booking.status || "pending"}`);
  if (booking.pnr) doc.text(`PNR: ${booking.pnr}`);
  doc.moveDown();

  if (booking.agent) {
    doc.text(
      `Agent: ${booking.agent.name || "—"} (${booking.agent.email || "—"})`
    );
  }

  doc.end(); // stream completes the response
};

// --------------------------------- CREATE -----------------------------------
export const createBooking = async (req, res) => {
  try {
    const {
      // original
      customerName,
      customerEmail,
      package: pkg,
      date,

      // new (revision)
      pnr,
      flights,
      hotels,
      visas,
      transportation,
      costing,
      flightPayments,
      status, // optional set by admin/agent
    } = req.body || {};

    if (!customerName || !customerEmail || !pkg || !date) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    if (pnr) {
      const cleanPNR = String(pnr).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (cleanPNR.length !== 6) {
        return res
          .status(400)
          .json({ message: "PNR must be exactly 6 characters." });
      }
    }

    const booking = await Booking.create({
      customerName,
      customerEmail,
      package: pkg,
      date,
      status: status || "pending",
      agent: req.user._id, // from protect middleware

      // revision sections (optional)
      pnr: pnr ? String(pnr).toUpperCase() : undefined,
      flights: flights || undefined,
      hotels: Array.isArray(hotels) ? hotels : undefined,
      visas: visas || undefined,
      transportation: transportation || undefined,
      costing: costing || undefined,
      flightPayments: flightPayments || undefined,
    });

    res.status(201).json(booking);
  } catch (error) {
    res
      .status(400)
      .json({ message: error.message || "Failed to create booking" });
  }
};

// --------------------------------- LIST -------------------------------------
/**
 * @desc    Get all bookings (admin only)
 * @route   GET /api/bookings
 * @access  Private/Admin
 */
export const getBookings = async (req, res) => {
  const bookings = await Booking.find().populate("agent", "name email role");
  res.json(bookings);
};

// --------------------------------- READ -------------------------------------
/**
 * @desc    Get booking by ID (owner or admin)
 * @route   GET /api/bookings/:id
 * @access  Private
 */
export const getBookingById = async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate(
    "agent",
    "name email role"
  );
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const isOwner =
    booking.agent && booking.agent._id
      ? booking.agent._id.equals(req.user._id)
      : String(booking.agent) === String(req.user._id);

  if (!isOwner && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized" });
  }
  res.json(booking);
};

// --------------------------------- UPDATE -----------------------------------
/**
 * @desc    Update booking (Admin or Owner Agent)
 * @route   PUT /api/bookings/:id
 * @access  Private
 */
export const updateBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  const isOwner = String(booking.agent) === String(req.user._id);
  if (req.user.role !== "admin" && !isOwner) {
    return res.status(403).json({ message: "Not authorized" });
  }

  // Validate + set PNR if provided
  if (req.body?.pnr) {
    const cleanPNR = String(req.body.pnr)
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    if (cleanPNR.length !== 6) {
      return res
        .status(400)
        .json({ message: "PNR must be exactly 6 characters." });
    }
    booking.pnr = cleanPNR;
  }

  // ORIGINAL FIELDS
  booking.customerName = req.body.customerName ?? booking.customerName;
  booking.customerEmail = req.body.customerEmail ?? booking.customerEmail;
  booking.package = req.body.package ?? booking.package;
  booking.date = req.body.date ?? booking.date;
  booking.status = req.body.status ?? booking.status;

  // REVISION SECTIONS (replace wholesale if provided)
  if (req.body.flights !== undefined) booking.flights = req.body.flights;
  if (req.body.hotels !== undefined) booking.hotels = req.body.hotels;
  if (req.body.visas !== undefined) booking.visas = req.body.visas;
  if (req.body.transportation !== undefined)
    booking.transportation = req.body.transportation;
  if (req.body.costing !== undefined) booking.costing = req.body.costing;
  if (req.body.flightPayments !== undefined)
    booking.flightPayments = req.body.flightPayments;

  const updatedBooking = await booking.save();
  res.json(updatedBooking);
};

// --------------------------------- DELETE -----------------------------------
/**
 * @desc    Delete booking (Admin or Owner Agent)
 * @route   DELETE /api/bookings/:id
 * @access  Private
 */
export const deleteBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  const isOwner = String(booking.agent) === String(req.user._id);
  if (req.user.role !== "admin" && !isOwner) {
    return res.status(403).json({ message: "Not authorized" });
  }

  await booking.deleteOne();
  res.json({ message: "Booking removed" });
};

// --------------------------------- MINE -------------------------------------
/**
 * @desc    Get logged-in user's bookings
 * @route   GET /api/bookings/my
 * @access  Private
 */
export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ agent: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
