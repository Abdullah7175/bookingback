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
    booking.agent && booking.agent._id && 
    booking.agent._id.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({ message: "Not authorized" });
  }

  // headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="booking-${booking._id}.pdf"`
  );

  // PDF with proper formatting
  const doc = new PDFDocument({ 
    size: "A4", 
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true
  });
  doc.pipe(res);

  // Helper function for header
  const addHeader = () => {
    doc.rect(0, 0, doc.page.width, 60).fill('#1e3a8a');
    doc.fillColor('#ffffff')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('MIQAT TRAVELS', 50, 20, { align: 'center' });
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Booking ID: ${booking._id}`, 50, 45, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(3);
  };

  // Helper function for footer
  const addFooter = () => {
    const bottomY = doc.page.height - 40;
    doc.fontSize(8)
       .fillColor('#666666')
       .text(
         'MIQAT TRAVELS | Email: info@miqattravels.com | Phone: +1-XXX-XXX-XXXX',
         50,
         bottomY,
         { align: 'center', width: doc.page.width - 100 }
       );
    doc.fillColor('#000000');
  };

  // Add first page header
  addHeader();

  // Status and Approval (side by side)
  const startY = doc.y;
  doc.fontSize(12).font('Helvetica-Bold').text(`Status: ${(booking.status || 'pending').toUpperCase()}`, 50, startY);
  doc.text(`Approval: ${(booking.approvalStatus || 'pending').toUpperCase()}`, 300, startY);
  doc.font('Helvetica');
  doc.moveDown(2);

  // CUSTOMER INFORMATION
  doc.fontSize(14).font('Helvetica-Bold').text('CUSTOMER INFORMATION', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica');
  doc.text(`Name: ${booking.customerName || "—"}`);
  doc.text(`Email: ${booking.customerEmail || "—"}`);
  doc.text(`Phone: ${booking.contactNumber || "—"}`);
  const agentName = booking.agent && booking.agent.name ? booking.agent.name : "Not Assigned";
  const agentEmail = booking.agent && booking.agent.email ? booking.agent.email : "";
  const agentPhone = booking.agent && booking.agent.phone ? booking.agent.phone : "";
  doc.text(`Agent: ${agentName}`);
  if (agentEmail) doc.text(`Agent Email: ${agentEmail}`);
  if (agentPhone) doc.text(`Agent Phone: ${agentPhone}`);
  doc.moveDown(1.5);

  // TRAVEL DATES
  doc.fontSize(14).font('Helvetica-Bold').text('TRAVEL DATES', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica');
  doc.text(`Booking Date: ${booking.date ? new Date(booking.date).toISOString().slice(0, 10) : "—"}`);
  doc.text(`Departure: ${booking.departureDate ? new Date(booking.departureDate).toISOString().slice(0, 10) : "—"}`);
  doc.text(`Return: ${booking.returnDate ? new Date(booking.returnDate).toISOString().slice(0, 10) : "—"}`);
  doc.text(`Package: ${booking.package || "—"}`);
  doc.moveDown(1.5);

  // FLIGHT DETAILS
  doc.fontSize(14).font('Helvetica-Bold').text('FLIGHT DETAILS', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica');
  
  // Extract route from legacy or new structure
  const depCity = booking.flight?.departureCity || booking.departureCity || "";
  const arrCity = booking.flight?.arrivalCity || booking.arrivalCity || "";
  if (depCity && arrCity) {
    doc.text(`Route: ${depCity} ✈ ${arrCity}`);
  }
  
  // Flight class - check multiple locations
  const flightClass = booking.flight?.flightClass || booking.flightClass || 'economy';
  doc.text(`Class: ${flightClass}`);
  
  if (booking.pnr) {
    doc.text(`PNR: ${booking.pnr}`);
  }
  
  // Flight Itinerary
  const itinerary = booking.flights?.raw || booking.flight?.itinerary || "";
  if (itinerary) {
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica-Bold').text('Flight Itinerary:', { underline: false });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    const lines = itinerary.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      doc.text(line.trim());
    });
  }
  doc.moveDown(1.5);

  // ACCOMMODATION DETAILS (Hotels)
  const hotelsToShow = (booking.hotels && booking.hotels.length > 0) ? booking.hotels : 
                      (booking.hotel ? [booking.hotel] : []);
  
  if (hotelsToShow.length > 0) {
    doc.fontSize(14).text("Hotel Details", { underline: true });
    doc.moveDown();
    
    hotelsToShow.forEach((hotel, index) => {
      doc.fontSize(10).text(`Hotel ${index + 1}:`);
      doc.fontSize(9).text(`  Name: ${hotel.name || hotel.hotelName || "—"}`);
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

  // Additional Services
  if (booking.additionalServices) {
    doc.fontSize(14).text("Additional Services", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(booking.additionalServices);
    doc.moveDown();
  }

  // Payment Information
  doc.fontSize(14).text("Payment Details", { underline: true });
  doc.moveDown();
  
  // Payment Received
  if (booking.paymentReceived) {
    doc.fontSize(11).text("Payment Received:", { underline: true });
    doc.fontSize(10).text(`  Amount: $${booking.paymentReceived.amount || 0}`);
    doc.fontSize(10).text(`  Method: ${booking.paymentReceived.method || "—"}`);
    if (booking.paymentReceived.date) {
      doc.fontSize(10).text(`  Date: ${new Date(booking.paymentReceived.date).toISOString().slice(0, 10)}`);
    }
    if (booking.paymentReceived.reference) {
      doc.fontSize(10).text(`  Reference: ${booking.paymentReceived.reference}`);
    }
    doc.moveDown(0.5);
  }

  // Payment Due
  if (booking.paymentDue) {
    doc.fontSize(11).text("Payment Due:", { underline: true });
    doc.fontSize(10).text(`  Amount: $${booking.paymentDue.amount || 0}`);
    doc.fontSize(10).text(`  Method: ${booking.paymentDue.method || "—"}`);
    if (booking.paymentDue.dueDate) {
      doc.fontSize(10).text(`  Due Date: ${new Date(booking.paymentDue.dueDate).toISOString().slice(0, 10)}`);
    }
    if (booking.paymentDue.notes) {
      doc.fontSize(10).text(`  Notes: ${booking.paymentDue.notes}`);
    }
    doc.moveDown(0.5);
  }

  // Payment Method (legacy)
  if (booking.payment) {
    doc.fontSize(11).text("Payment Method:", { underline: true });
    doc.fontSize(10).text(`  Method: ${booking.payment.method || booking.paymentMethod || "—"}`);
    if (booking.payment.cardLast4) {
      doc.fontSize(10).text(`  Card: ****${booking.payment.cardLast4}`);
    }
    if (booking.payment.cardholderName) {
      doc.fontSize(10).text(`  Cardholder: ${booking.payment.cardholderName}`);
    }
    doc.moveDown(0.5);
  }

  // Flight Payment Information (installments)
  if (booking.flightPayments) {
    doc.fontSize(11).text("Flight Payment Plan:", { underline: true });
    doc.moveDown(0.5);
    
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
      agent, // Accept agent from request body (for admin creating bookings for other agents)

      // new (revision)
      pnr,
      flights,
      hotels,
      visas,
      transportation,
      costing,
      flightPayments,
      status, // optional set by admin/agent
      
      // Additional fields
      contactNumber,
      passengers,
      adults,
      children,
      departureDate,
      returnDate,
      packagePrice,
      additionalServices,
      amount,
      totalAmount,
      paymentMethod,
      
      // Payment tracking
      paymentReceived,
      paymentDue,
      payment,
      
      // Credit card
      cardNumber,
      expiryDate,
      cvv,
      cardholderName,
      
      // Legacy fields
      hotel,
      visa,
      transport,
      flight,
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

    // Use agent from request body if provided (for admin), otherwise use logged-in user's ID
    const agentId = agent || req.user._id;

    const booking = await Booking.create({
      customerName,
      customerEmail,
      package: pkg,
      date,
      status: status || "pending",
      agent: agentId,

      // Additional fields
      contactNumber,
      passengers,
      adults,
      children,
      departureDate,
      returnDate,
      packagePrice,
      additionalServices,
      amount: amount || totalAmount,
      totalAmount: totalAmount || amount,
      paymentMethod,

      // Credit card info
      cardNumber,
      expiryDate,
      cvv,
      cardholderName,
      
      // Flight class
      flightClass: flight?.flightClass || undefined,

      // Payment tracking
      paymentReceived,
      paymentDue,
      payment,

      // revision sections (optional)
      pnr: pnr ? String(pnr).toUpperCase() : undefined,
      flights: flights || undefined,
      hotels: Array.isArray(hotels) ? hotels : undefined,
      visas: visas || undefined,
      transportation: transportation || undefined,
      transport: transport || undefined,
      costing: costing || undefined,
      flightPayments: flightPayments || undefined,
      
      // Legacy fields
      hotel: hotel || undefined,
      visa: visa || undefined,
      flight: flight || undefined,
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

  // Allow update if user is admin, or if booking has an agent that matches user, or if booking has no agent
  const isOwner = booking.agent ? String(booking.agent) === String(req.user._id) : req.user.role === "admin";
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
  if (req.body.agent !== undefined) booking.agent = req.body.agent;

  // REVISION SECTIONS (replace wholesale if provided)
  if (req.body.flights !== undefined) booking.flights = req.body.flights;
  if (req.body.hotels !== undefined) booking.hotels = req.body.hotels;
  if (req.body.visas !== undefined) booking.visas = req.body.visas;
  if (req.body.transportation !== undefined)
    booking.transportation = req.body.transportation;
  if (req.body.transport !== undefined) booking.transport = req.body.transport; // Legacy transport field
  if (req.body.costing !== undefined) booking.costing = req.body.costing;
  if (req.body.flightPayments !== undefined)
    booking.flightPayments = req.body.flightPayments;
  
  // HOTEL LEGACY FIELD
  if (req.body.hotel !== undefined) booking.hotel = req.body.hotel;
  if (req.body.visa !== undefined) booking.visa = req.body.visa;

  // ADDITIONAL FIELDS
  if (req.body.passengers !== undefined) booking.passengers = req.body.passengers;
  if (req.body.adults !== undefined) booking.adults = req.body.adults;
  if (req.body.children !== undefined) booking.children = req.body.children;
  if (req.body.contactNumber !== undefined) booking.contactNumber = req.body.contactNumber;
  if (req.body.departureDate !== undefined) booking.departureDate = req.body.departureDate;
  if (req.body.returnDate !== undefined) booking.returnDate = req.body.returnDate;
  if (req.body.packagePrice !== undefined) booking.packagePrice = req.body.packagePrice;
  if (req.body.additionalServices !== undefined) booking.additionalServices = req.body.additionalServices;
  if (req.body.amount !== undefined) booking.amount = req.body.amount;
  if (req.body.totalAmount !== undefined) booking.totalAmount = req.body.totalAmount;
  if (req.body.approvalStatus !== undefined) booking.approvalStatus = req.body.approvalStatus;
  
  // CREDIT CARD FIELDS
  if (req.body.cardNumber !== undefined) booking.cardNumber = req.body.cardNumber;
  if (req.body.expiryDate !== undefined) booking.expiryDate = req.body.expiryDate;
  if (req.body.cvv !== undefined) booking.cvv = req.body.cvv;
  if (req.body.cardholderName !== undefined) booking.cardholderName = req.body.cardholderName;
  
  // FLIGHT CLASS
  if (req.body.flightClass !== undefined) booking.flightClass = req.body.flightClass;
  if (req.body.flight?.flightClass !== undefined) {
    if (!booking.flight) booking.flight = {};
    booking.flight.flightClass = req.body.flight.flightClass;
  }

  // PAYMENT TRACKING FIELDS
  if (req.body.paymentReceived !== undefined) booking.paymentReceived = req.body.paymentReceived;
  if (req.body.paymentDue !== undefined) booking.paymentDue = req.body.paymentDue;
  if (req.body.payment !== undefined) booking.payment = req.body.payment;
  if (req.body.paymentMethod !== undefined) booking.paymentMethod = req.body.paymentMethod;

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

// --------------------------------- APPROVE -----------------------------------
/**
 * @desc    Approve a booking (Admin only)
 * @route   PUT /api/bookings/:id/approve
 * @access  Private/Admin
 */
export const approveBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Only admin can approve
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    booking.approvalStatus = "approved";
    booking.status = "confirmed";
    await booking.save();

    res.json({ success: true, message: "Booking approved", booking });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// --------------------------------- REJECT -----------------------------------
/**
 * @desc    Reject a booking (Admin only)
 * @route   PUT /api/bookings/:id/reject
 * @access  Private/Admin
 */
export const rejectBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Only admin can reject
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    booking.approvalStatus = "rejected";
    booking.status = "cancelled";
    await booking.save();

    res.json({ success: true, message: "Booking rejected", booking });
  } catch (error) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};
