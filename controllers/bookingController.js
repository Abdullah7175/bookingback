import Booking from "../models/Booking.js";

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private (logged-in user)
export const createBooking = async (req, res) => {
  try {
    const booking = await Booking.create({
      customerName: req.body.customerName,
      customerEmail: req.body.customerEmail,
      package: req.body.package,
      date: req.body.date,
      agent: req.user._id, // from protect middleware
    });
    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all bookings (admin only)
// @route   GET /api/bookings
// @access  Private/Admin
export const getBookings = async (req, res) => {
  const bookings = await Booking.find().populate("agent", "name email");
  res.json(bookings);
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private (owner or admin)
export const getBookingById = async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate("agent", "name email");
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }
  if (booking.agent.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    return res.status(403).json({ message: "Not authorized" });
  }
  res.json(booking);
};

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private (Admin or Owner Agent)
export const updateBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.status(404).json({ message: "Booking not found" });

  // ✅ RBAC Check
  if (req.user.role !== "admin" && booking.agent.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Not authorized" });
  }

  booking.status = req.body.status || booking.status;
  booking.customerName = req.body.customerName || booking.customerName;
  booking.customerEmail = req.body.customerEmail || booking.customerEmail;

  const updatedBooking = await booking.save();
  res.json(updatedBooking);
};

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private (Admin or Owner Agent)
export const deleteBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.status(404).json({ message: "Booking not found" });

  // ✅ RBAC Check
  if (req.user.role !== "admin" && booking.agent.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Not authorized" });
  }

  await booking.deleteOne();
  res.json({ message: "Booking removed" });
};

// @desc    Get logged-in user bookings
// @route   GET /api/bookings/my
// @access  Private
export const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ agent: req.user._id });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
