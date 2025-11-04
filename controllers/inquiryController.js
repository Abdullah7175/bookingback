import Inquiry from "../models/Inquiry.js";
import crypto from "crypto";
import superagent from "superagent";
import mongoose from "mongoose";

// Helper to build webhook payload in the expected shape
const buildWebhookBody = (inq) => {
  const basePayload = {
    id: inq._id?.toString?.() || String(inq.id || ""),
    name: inq.customerName || inq.name || "",
    email: inq.customerEmail || inq.email || "",
    phone: inq.customerPhone || inq.phone || "",
    message: inq.message || "",
    created_at: (inq.createdAt instanceof Date ? inq.createdAt : new Date(inq.createdAt || Date.now())).toISOString(),
  };

  // Add package_details if package details exist
  if (inq.packageDetails && inq.packageDetails.packageName) {
    const pkg = inq.packageDetails;
    basePayload.package_details = {
      package_name: pkg.packageName,
      pricing: {
        double: pkg.pricing?.double || null,
        triple: pkg.pricing?.triple || null,
        quad: pkg.pricing?.quad || null,
        currency: pkg.pricing?.currency || 'USD',
      },
      duration: {
        nights_makkah: pkg.duration?.nightsMakkah || null,
        nights_madina: pkg.duration?.nightsMadina || null,
        total_nights: pkg.duration?.totalNights || null,
      },
      hotels: {
        makkah: pkg.hotels?.makkah || null,
        madina: pkg.hotels?.madina || null,
      },
      services: {
        transportation: pkg.services?.transportation || null,
        visa: pkg.services?.visa || null,
      },
      inclusions: {
        breakfast: pkg.inclusions?.breakfast || false,
        dinner: pkg.inclusions?.dinner || false,
        visa: pkg.inclusions?.visa || false,
        ticket: pkg.inclusions?.ticket || false,
        roundtrip: pkg.inclusions?.roundtrip || false,
        ziyarat: pkg.inclusions?.ziyarat || false,
        guide: pkg.inclusions?.guide || false,
      },
    };
  }

  return basePayload;
};

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
      // External ID from PostgreSQL system (optional)
      externalId,
      id, // Also accept 'id' field as external ID
      // Package details fields (optional)
      package_name,
      packageName,
      price_double,
      price_triple,
      price_quad,
      currency,
      nights_makkah,
      nights_madina,
      total_nights,
      hotel_makkah,
      hotel_madina,
      transportation,
      visa_service,
      breakfast,
      dinner,
      visa_included,
      ticket,
      roundtrip,
      ziyarat,
      guide,
      // Package details object (alternative format)
      package_details,
    } = req.body;

    // Build package details if any package fields are provided
    let packageDetails = null;
    if (package_details || package_name || packageName) {
      const pkg = package_details || {};
      packageDetails = {
        packageName: packageName || package_name || pkg.package_name || null,
        pricing: {
          double: price_double || pkg.pricing?.double || null,
          triple: price_triple || pkg.pricing?.triple || null,
          quad: price_quad || pkg.pricing?.quad || null,
          currency: currency || pkg.pricing?.currency || 'USD',
        },
        duration: {
          nightsMakkah: nights_makkah || pkg.duration?.nights_makkah || null,
          nightsMadina: nights_madina || pkg.duration?.nights_madina || null,
          totalNights: total_nights || pkg.duration?.total_nights || null,
        },
        hotels: {
          makkah: hotel_makkah || pkg.hotels?.makkah || null,
          madina: hotel_madina || pkg.hotels?.madina || null,
        },
        services: {
          transportation: transportation || pkg.services?.transportation || null,
          visa: visa_service || pkg.services?.visa || null,
        },
        inclusions: {
          breakfast: breakfast !== undefined ? Boolean(breakfast) : (pkg.inclusions?.breakfast || false),
          dinner: dinner !== undefined ? Boolean(dinner) : (pkg.inclusions?.dinner || false),
          visa: visa_included !== undefined ? Boolean(visa_included) : (pkg.inclusions?.visa || false),
          ticket: ticket !== undefined ? Boolean(ticket) : (pkg.inclusions?.ticket || false),
          roundtrip: roundtrip !== undefined ? Boolean(roundtrip) : (pkg.inclusions?.roundtrip || false),
          ziyarat: ziyarat !== undefined ? Boolean(ziyarat) : (pkg.inclusions?.ziyarat || false),
          guide: guide !== undefined ? Boolean(guide) : (pkg.inclusions?.guide || false),
        },
      };
    }

    const inquiry = new Inquiry({
      // Store external ID from PostgreSQL system if provided
      externalId: externalId || id || undefined,
      customerName: customerName || name,
      customerEmail: customerEmail || email,
      customerPhone: customerPhone || phone,
      message,
      packageDetails: packageDetails,
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
      // Agents can ONLY see inquiries assigned to them
      // Check both User and Agent models for assignedAgent
      filter = { 
        assignedAgent: req.user._id
      };
    }
    // Admin sees all inquiries (no filter)

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
    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id).populate("assignedAgent", "name email");
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id }).populate("assignedAgent", "name email");
    }

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

// Assign inquiry to agent and create booking entry
export const assignInquiryToAgent = async (req, res) => {
  try {
    const { assignedAgent, createBooking, inquiryData } = req.body;
    
    // Only admin can assign inquiries
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admins can assign inquiries" });
    }

    if (!assignedAgent || assignedAgent === '' || assignedAgent === null) {
      return res.status(400).json({ success: false, message: "Agent ID is required" });
    }

    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id).populate("assignedAgent", "name email");
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id }).populate("assignedAgent", "name email");
    }
    
    // If still not found and we have inquiryData, create the inquiry in MongoDB
    if (!inquiry && inquiryData) {
      try {
        inquiry = new Inquiry({
          externalId: inquiryData.externalId || req.params.id,
          customerName: inquiryData.customerName,
          customerEmail: inquiryData.customerEmail,
          customerPhone: inquiryData.customerPhone || '',
          message: inquiryData.message || '',
          packageDetails: inquiryData.packageDetails || null,
          status: 'pending',
        });
        await inquiry.save();
        console.log(`Created inquiry in MongoDB with externalId: ${req.params.id}`);
        // Populate assignedAgent for consistent response format
        await inquiry.populate("assignedAgent", "name email");
      } catch (createError) {
        console.error("Error creating inquiry from external data:", createError);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to create inquiry in MongoDB. Please ensure all required fields are provided." 
        });
      }
    }
    
    // If still not found and no inquiryData provided, return error
    if (!inquiry) {
      return res.status(404).json({ 
        success: false, 
        message: `Inquiry not found in MongoDB. The inquiry with ID "${req.params.id}" may need to be synced from the external system first.` 
      });
    }

    // Verify agent exists in either User or Agent model
    const { default: User } = await import("../models/User.js");
    const { default: Agent } = await import("../models/Agent.js");
    
    const userAgent = await User.findById(assignedAgent);
    const agentDoc = await Agent.findById(assignedAgent);
    
    if (!userAgent && !agentDoc) {
      return res.status(400).json({ success: false, message: "Agent not found" });
    }

    // Step 1: Create booking entry if createBooking is true (default behavior)
    if (createBooking !== false) {
      try {
        const { default: Booking } = await import("../models/Booking.js");
        
        // Create booking from inquiry data
        const bookingData = {
          customerName: inquiry.customerName,
          customerEmail: inquiry.customerEmail,
          contactNumber: inquiry.customerPhone || '',
          package: inquiry.packageDetails?.packageName || 'Inquiry Package',
          date: new Date(),
          status: 'pending',
          approvalStatus: 'pending',
          agent: assignedAgent,
          // Include package details if available
          packagePrice: inquiry.packageDetails?.pricing?.double || inquiry.packageDetails?.pricing?.triple || inquiry.packageDetails?.pricing?.quad || '0',
        };

        const booking = await Booking.create(bookingData);
        console.log("Booking created successfully:", booking._id);
        // Link inquiry to booking if needed (optional - you can add inquiryId to Booking model later)
        inquiry.status = 'in-progress';
      } catch (bookingError) {
        console.error("Error creating booking:", bookingError);
        console.error("Booking error details:", {
          message: bookingError.message,
          stack: bookingError.stack,
          name: bookingError.name
        });
        // Continue with assignment even if booking creation fails
      }
    }

    // Step 2: Assign inquiry to agent
    inquiry.assignedAgent = assignedAgent;
    inquiry.status = inquiry.status === 'pending' ? 'in-progress' : inquiry.status;
    await inquiry.save();

    // Populate assignedAgent for response
    try {
      await inquiry.populate("assignedAgent", "name email");
    } catch (populateError) {
      console.warn("Could not populate assignedAgent:", populateError);
      // Continue without population
    }

    res.json({ 
      success: true, 
      message: "Inquiry assigned to agent successfully",
      data: inquiry 
    });
  } catch (error) {
    console.error("assignInquiryToAgent error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      paramsId: req.params.id,
      assignedAgent: req.body.assignedAgent
    });
    res.status(500).json({ 
      success: false, 
      message: error.message || "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Update inquiry
export const updateInquiry = async (req, res) => {
  try {
    const { status, assignedAgent } = req.body;
    
    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }
    
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    // Agents can update only their assigned inquiries (status only)
    if (req.user.role === "agent") {
      if (inquiry.assignedAgent?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      // Agents can only update status, not assignment
      if (status) inquiry.status = status;
    } else if (req.user.role === "admin") {
      // Admin can update both status and assignment (but use assignInquiryToAgent endpoint for proper workflow)
      if (status) inquiry.status = status;
      if (assignedAgent !== undefined) {
        // For direct assignment without booking creation, use this
        // But recommend using assignInquiryToAgent endpoint instead
        if (assignedAgent && assignedAgent !== null && assignedAgent !== '') {
          // Verify agent exists in either User or Agent model
          const { default: User } = await import("../models/User.js");
          const { default: Agent } = await import("../models/Agent.js");
          
          const userAgent = await User.findById(assignedAgent);
          const agentDoc = await Agent.findById(assignedAgent);
          
          if (!userAgent && !agentDoc) {
            return res.status(400).json({ success: false, message: "Agent not found" });
          }
        }
        inquiry.assignedAgent = assignedAgent || null;
      }
    }

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
    
    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }
    
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
    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }
    
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    
    await inquiry.deleteOne();

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

    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }
    
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
