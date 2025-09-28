import Inquiry from "../models/Inquiry.js";

// Create a new inquiry
export const createInquiry = async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, message } = req.body;
    const inquiry = new Inquiry({ customerName, customerEmail, customerPhone, message });
    await inquiry.save();
    res.status(201).json({ success: true, data: inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all inquiries (Admin sees all, Agent sees only theirs)
export const getInquiries = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "agent") {
      filter = { assignedAgent: req.user._id };
    }

    const inquiries = await Inquiry.find(filter)
      .populate("assignedAgent", "name email")
      .sort({ createdAt: -1 }); // latest first

    res.json({ success: true, data: inquiries });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get inquiry by ID
export const getInquiryById = async (req, res) => {
  try {
    const inquiry = await Inquiry.findById(req.params.id).populate("assignedAgent", "name email");

    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    // Agents can see only their inquiries
    if (req.user.role === "agent" && inquiry.assignedAgent?._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    res.json({ success: true, data: inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update inquiry
export const updateInquiry = async (req, res) => {
  try {
    const { status, assignedAgent } = req.body;
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    // Agents can update only their inquiries
    if (req.user.role === "agent" && inquiry.assignedAgent?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (status) inquiry.status = status;
    if (assignedAgent && req.user.role === "admin") inquiry.assignedAgent = assignedAgent;

    await inquiry.save();
    res.json({ success: true, data: inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add a response
export const addResponse = async (req, res) => {
  try {
    const { message } = req.body;
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    inquiry.responses.push({ message, responder: req.user._id });
    await inquiry.save();
    res.json({ success: true, data: inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete inquiry (Admin only)
export const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    res.json({ success: true, message: "Inquiry deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};
