import Inquiry from "../models/Inquiry.js";
import crypto from "crypto";
import superagent from "superagent";

// Helper to build webhook payload in the expected shape
const buildWebhookBody = (inq) => ({
  id: inq._id?.toString?.() || String(inq.id || ""),
  name: inq.customerName || inq.name || "",
  email: inq.customerEmail || inq.email || "",
  phone: inq.customerPhone || inq.phone || "",
  message: inq.message || "",
  created_at: (inq.createdAt instanceof Date ? inq.createdAt : new Date(inq.createdAt || Date.now())).toISOString(),
});

// Send signed webhook (best-effort)
export const forwardInquiryWebhook = async (inquiry) => {
  const url = process.env.INQUIRY_WEBHOOK_URL;
  const secret = process.env.INQUIRY_WEBHOOK_SECRET;
  if (!url || !secret) return { skipped: true, reason: "Webhook env not configured" };

  const body = buildWebhookBody(inquiry);
  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");

  try {
    const resp = await superagent
      .post(url)
      .set("Content-Type", "application/json")
      .set("X-Webhook-Timestamp", timestamp)
      .set("X-Webhook-Signature", signature)
      .set("Idempotency-Key", `inq-${inquiry._id}`)
      .send(body);

    return { success: true, status: resp.status, body: resp.text };
  } catch (e) {
    // Return failure (do not throw to avoid breaking main flow)
    return { success: false, status: e.status || null, body: e.response?.text || e.message };
  }
};

// Create a new inquiry
export const createInquiry = async (req, res) => {
  try {
    // Support both the documented payload and legacy field names
    const {
      name,
      email,
      phone,
      message,
      customerName,
      customerEmail,
      customerPhone,
    } = req.body;

    const inquiry = new Inquiry({
      customerName: customerName || name,
      customerEmail: customerEmail || email,
      customerPhone: customerPhone || phone,
      message,
    });
    await inquiry.save();

    // Best-effort webhook forward (do not block creation if it fails)
    forwardInquiryWebhook(inquiry).then((r) => {
      if (!r?.success) {
        console.warn("Inquiry webhook forward failed:", r);
      }
    });

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
      // Agents can see inquiries assigned to them (in User or Agent model)
      filter = { 
        $or: [
          { assignedAgent: req.user._id },
          // Also check for inquiries created by this agent (if inquiry has a creator field)
        ]
      };
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

// Manual secure forward: POST /api/inquiries/:id/forward-webhook
export const manualForwardInquiryWebhook = async (req, res) => {
  try {
    const apiKey = req.header("X-Api-Key");
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });

    const result = await forwardInquiryWebhook(inquiry);
    if (result.success) {
      return res.status(200).json({ success: true, status: result.status, body: result.body });
    }
    return res.status(502).json({ success: false, status: result.status || null, body: result.body || "failed" });
  } catch (error) {
    console.error("manualForwardInquiryWebhook error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
