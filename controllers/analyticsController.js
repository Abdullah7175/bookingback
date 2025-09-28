import Booking from "../models/Booking.js";
import Inquiry from "../models/Inquiry.js";
import User from "../models/User.js";

// Admin Dashboard Analytics
export const getAdminAnalytics = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const totalBookings = await Booking.countDocuments();
    const totalInquiries = await Inquiry.countDocuments();
    const totalAgents = await User.countDocuments({ role: "agent" });

    // Group bookings by status
    const bookingStats = await Booking.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // Group inquiries by status
    const inquiryStats = await Inquiry.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    // Recent data
    const recentBookings = await Booking.find().sort({ createdAt: -1 }).limit(5);
    const recentInquiries = await Inquiry.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      data: {
        totalBookings,
        totalInquiries,
        totalAgents,
        bookingStats,
        inquiryStats,
        recentBookings,
        recentInquiries
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};
