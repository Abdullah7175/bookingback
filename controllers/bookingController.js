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

  // Basic Information
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
  doc.moveDown();

  // Flight Information
  if (booking.flights) {
    doc.fontSize(14).text("Flight Details", { underline: true });
    doc.moveDown();
    
    if (booking.flights.raw) {
      doc.fontSize(10).text("Flight Itinerary:", { underline: true });
      doc.moveDown(0.5);
      const lines = booking.flights.raw.split('\n');
      lines.forEach(line => {
        doc.fontSize(9).text(line.trim());
      });
      doc.moveDown();
    }
    
    if (booking.flights.itineraryLines && booking.flights.itineraryLines.length > 0) {
      doc.fontSize(10).text("Flight Details:", { underline: true });
      doc.moveDown(0.5);
      booking.flights.itineraryLines.forEach(line => {
        doc.fontSize(9).text(line);
      });
      doc.moveDown();
    }
  }

  // Hotels Information - handle both legacy (hotel) and new (hotels) structures
  const hotelsToShow = (booking.hotels && booking.hotels.length > 0) ? booking.hotels : 
                      (booking.hotel ? [booking.hotel] : []);
  
  if (hotelsToShow.length > 0) {
    doc.fontSize(14).text("Hotel Details", { underline: true });
    doc.moveDown();
    
    hotelsToShow.forEach((hotel, index) => {
      doc.fontSize(10).text(`Hotel ${index + 1}:`);
      doc.fontSize(9).text(`  Name: ${hotel.hotelName || hotel.name || "—"}`);
      doc.fontSize(9).text(`  Room Type: ${hotel.roomType || "—"}`);
      doc.fontSize(9).text(`  Check-in: ${hotel.checkIn || "—"}`);
      doc.fontSize(9).text(`  Check-out: ${hotel.checkOut || "—"}`);
      doc.moveDown(0.5);
    });
  }

  // Visa Information - handle both legacy (visa) and new (visas) structures
  const visaPassengers = booking.visas?.passengers || 
                        (Array.isArray(booking.visas) ? booking.visas : []) ||
                        (booking.visa ? [booking.visa] : []);
  
  if (visaPassengers && visaPassengers.length > 0) {
    doc.fontSize(14).text("Visa Details", { underline: true });
    doc.moveDown();
    
    doc.fontSize(10).text(`Total Visas: ${visaPassengers.length}`);
    doc.moveDown(0.5);
    
    visaPassengers.forEach((passenger, index) => {
      doc.fontSize(10).text(`Passenger ${index + 1}:`);
      doc.fontSize(9).text(`  Name: ${passenger.name || passenger.fullName || "—"}`);
      doc.fontSize(9).text(`  Nationality: ${passenger.nationality || "—"}`);
      doc.fontSize(9).text(`  Visa Type: ${passenger.visaType || "—"}`);
      doc.moveDown(0.5);
    });
  }

  // Transportation Information - handle actual stored structure
  const transportLegs = booking.transportation?.legs || booking.transport?.legs || [];
  if (transportLegs && transportLegs.length > 0) {
    doc.fontSize(14).text("Transportation Details", { underline: true });
    doc.moveDown();
    
    doc.fontSize(10).text(`Total Legs: ${booking.transportation?.count || booking.transport?.count || transportLegs.length}`);
    doc.moveDown(0.5);
    
    transportLegs.forEach((leg, index) => {
      doc.fontSize(10).text(`Leg ${index + 1}:`);
      doc.fontSize(9).text(`  From: ${leg.from || "—"}`);
      doc.fontSize(9).text(`  To: ${leg.to || "—"}`);
      doc.fontSize(9).text(`  Vehicle: ${leg.vehicleType || "—"}`);
      doc.fontSize(9).text(`  Date: ${leg.date || "—"}`);
      doc.fontSize(9).text(`  Time: ${leg.time || "—"}`);
      doc.moveDown(0.5);
    });
  } else if (booking.transport?.transportType || booking.transport?.pickupLocation) {
    doc.fontSize(14).text("Transportation Details", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Type: ${booking.transport?.transportType || "—"}`);
    doc.fontSize(10).text(`Pickup: ${booking.transport?.pickupLocation || "—"}`);
    doc.moveDown();
  }

  // Costing Information - handle actual stored structure
  const costingRows = booking.costing?.rows || booking.pricing?.table || [];
  if (costingRows && costingRows.length > 0) {
    doc.fontSize(14).text("Costing Details", { underline: true });
    doc.moveDown();
    
    costingRows.forEach((row, index) => {
      doc.fontSize(10).text(`${row.label || row.item || "Item " + (index + 1)}:`);
      doc.fontSize(9).text(`  Quantity: ${row.quantity || 0}`);
      doc.fontSize(9).text(`  Cost per Qty: ${row.costPerQty || 0}`);
      doc.fontSize(9).text(`  Sale per Qty: ${row.salePerQty || 0}`);
      doc.moveDown(0.5);
    });
    
    // Show totals from either structure
    const totals = booking.pricing?.totals || booking.costing?.totals || {};
    if (totals.totalCostPrice || totals.totalSalePrice || totals.totalCost || totals.totalSale) {
      doc.fontSize(10).text("Totals:", { underline: true });
      doc.fontSize(9).text(`  Total Cost: ${totals.totalCostPrice || totals.totalCost || 0}`);
      doc.fontSize(9).text(`  Total Sale: ${totals.totalSalePrice || totals.totalSale || 0}`);
      doc.fontSize(9).text(`  Profit: ${totals.profit || 0}`);
      doc.moveDown();
    }
  }

  // Passenger Information
  if (booking.passengers || booking.adults || booking.children) {
    doc.fontSize(14).text("Passenger Details", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Total Passengers: ${booking.passengers || "—"}`);
    doc.fontSize(10).text(`Adults: ${booking.adults || "—"}`);
    doc.fontSize(10).text(`Children: ${booking.children || "—"}`);
    doc.moveDown();
  }

  // Additional Services
  if (booking.additionalServices) {
    doc.fontSize(14).text("Additional Services", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(booking.additionalServices);
    doc.moveDown();
  }

  // Flight Payment Information
  if (booking.flightPayments) {
    doc.fontSize(14).text("Payment Details", { underline: true });
    doc.moveDown();
    
    doc.fontSize(10).text(`Payment Mode: ${booking.flightPayments.mode || "—"}`);
    
    if (booking.flightPayments.creditCard) {
      doc.fontSize(9).text(`  Amount: ${booking.flightPayments.creditCard.amount || 0}`);
      doc.fontSize(9).text(`  Paid On: ${booking.flightPayments.creditCard.paidOn || "—"}`);
    }
    
    if (booking.flightPayments.installment) {
      const inst = booking.flightPayments.installment;
      doc.fontSize(9).text(`  Ticket Total: ${inst.ticketTotal || 0}`);
      doc.fontSize(9).text(`  Advance Paid: ${inst.advancePaid || 0}`);
      doc.fontSize(9).text(`  Installments: ${inst.numberOfInstallments || 0}`);
      doc.fontSize(9).text(`  Start Date: ${inst.startDate || "—"}`);
      doc.fontSize(9).text(`  Remaining: ${inst.remaining || 0}`);
      doc.fontSize(9).text(`  Per Installment: ${inst.perInstallment || 0}`);
      
      if (inst.schedule && inst.schedule.length > 0) {
        doc.fontSize(9).text(`  Schedule:`);
        inst.schedule.forEach((item, index) => {
          doc.fontSize(8).text(`    ${index + 1}. ${item.date || "—"} - ${item.amount || 0}`);
        });
      }
    }
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
