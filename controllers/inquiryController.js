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

// Helper function to fetch external inquiries from mtumrah API
const fetchExternalInquiries = async () => {
  // Try to get the API URL from environment or default to mtumrah.com
  const externalApiUrl = process.env.EXTERNAL_INQUIRIES_API_URL || 
    process.env.MTUMRAH_API_URL || 
    'https://www.mtumrah.com/api/inquiries';
  
  console.log(`Attempting to fetch external inquiries from: ${externalApiUrl}`);
  
  try {
    // Build request with optional authentication
    let request = superagent.get(externalApiUrl);
    
    // Add API key if configured
    if (process.env.EXTERNAL_API_KEY) {
      request = request.set('X-Api-Key', process.env.EXTERNAL_API_KEY);
      console.log('Using X-Api-Key header');
    }
    
    // Add authorization header if configured
    if (process.env.EXTERNAL_API_TOKEN) {
      request = request.set('Authorization', `Bearer ${process.env.EXTERNAL_API_TOKEN}`);
      console.log('Using Bearer token authorization');
    }
    
    const response = await request
      .timeout({ response: 10000, deadline: 15000 }) // 10s response, 15s total
      .retry(2); // Retry up to 2 times on failure
    
    console.log(`External API response status: ${response.status}`);
    console.log(`External API response type: ${typeof response.body}`);
    
    const data = response.body;
    
    // Handle different response formats
    let externalInquiries = [];
    if (Array.isArray(data)) {
      externalInquiries = data;
    } else if (data && Array.isArray(data.data)) {
      externalInquiries = data.data;
    } else if (data && Array.isArray(data.inquiries)) {
      externalInquiries = data.inquiries;
    } else if (data && data.result && Array.isArray(data.result)) {
      externalInquiries = data.result;
    } else {
      console.warn('Unexpected external API response format:', JSON.stringify(data).substring(0, 200));
    }
    
    console.log(`Fetched ${externalInquiries.length} inquiries from external API`);
    
    // Log a sample inquiry to debug structure (only first one with package data)
    if (externalInquiries.length > 0) {
      const sampleWithPackage = externalInquiries.find(inq => inq.package_name || inq.packageName || inq.price_double || inq.price_triple);
      if (sampleWithPackage) {
        console.log('Sample external inquiry with package data:', JSON.stringify(sampleWithPackage, null, 2));
      }
    }
    
    // Map all inquiries to our format (we'll filter assigned ones later)
    return externalInquiries.map((inq) => {
      const externalId = String(inq.id || inq.externalId || inq.inquiry_id || '');
      const customerName = inq.name || inq.customerName || inq.customer_name || inq.customer || '';
      const message = inq.message || inq.inquiry || inq.subject || inq.description || '';
      
      // Normalize package details structure
      // Check for nested package_details first, then check for flat fields at top level
      let packageDetails = null;
      const pkg = inq.package_details || inq.packageDetails;
      
      // Check if package details exist in nested structure
      if (pkg && typeof pkg === 'object') {
        packageDetails = {
          packageName: pkg.packageName || pkg.package_name || null,
          pricing: {
            double: pkg.pricing?.double || pkg.price_double || null,
            triple: pkg.pricing?.triple || pkg.price_triple || null,
            quad: pkg.pricing?.quad || pkg.price_quad || null,
            currency: pkg.pricing?.currency || pkg.currency || 'USD',
          },
          duration: {
            nightsMakkah: pkg.duration?.nightsMakkah || pkg.duration?.nights_makkah || pkg.nights_makkah || null,
            nightsMadina: pkg.duration?.nightsMadina || pkg.duration?.nights_madina || pkg.nights_madina || null,
            totalNights: pkg.duration?.totalNights || pkg.duration?.total_nights || pkg.total_nights || null,
          },
          hotels: {
            makkah: pkg.hotels?.makkah || pkg.hotel_makkah || null,
            madina: pkg.hotels?.madina || pkg.hotel_madina || null,
          },
          services: {
            transportation: pkg.services?.transportation || pkg.transportation || null,
            visa: pkg.services?.visa || pkg.visa_service || null,
          },
          inclusions: {
            breakfast: Boolean(pkg.inclusions?.breakfast || pkg.breakfast || false),
            dinner: Boolean(pkg.inclusions?.dinner || pkg.dinner || false),
            visa: Boolean(pkg.inclusions?.visa || pkg.visa_included || false),
            ticket: Boolean(pkg.inclusions?.ticket || pkg.ticket || false),
            roundtrip: Boolean(pkg.inclusions?.roundtrip || pkg.roundtrip || false),
            ziyarat: Boolean(pkg.inclusions?.ziyarat || pkg.ziyarat || false),
            guide: Boolean(pkg.inclusions?.guide || pkg.guide || false),
          },
        };
        // Only include if packageName exists
        if (!packageDetails.packageName) {
          packageDetails = null;
        }
      }
      
      // If no nested package details, check for flat fields at top level of inquiry object
      if (!packageDetails && (inq.package_name || inq.packageName || inq.price_double || inq.price_triple || inq.price_quad)) {
        packageDetails = {
          packageName: inq.package_name || inq.packageName || null,
          pricing: {
            double: inq.price_double || inq.priceDouble || null,
            triple: inq.price_triple || inq.priceTriple || null,
            quad: inq.price_quad || inq.priceQuad || null,
            currency: inq.currency || 'USD',
          },
          duration: {
            nightsMakkah: inq.nights_makkah || inq.nightsMakkah || inq.nightsMakkahNights || null,
            nightsMadina: inq.nights_madina || inq.nightsMadina || inq.nightsMadinaNights || null,
            totalNights: inq.total_nights || inq.totalNights || inq.totalNightsNights || null,
          },
          hotels: {
            makkah: inq.hotel_makkah || inq.hotelMakkah || inq.makkahHotel || null,
            madina: inq.hotel_madina || inq.hotelMadina || inq.madinaHotel || null,
          },
          services: {
            transportation: inq.transportation || inq.transportationTitle || null,
            visa: inq.visa_service || inq.visaService || inq.visaTitle || null,
          },
          inclusions: {
            breakfast: Boolean(inq.breakfast === 1 || inq.breakfast === '1' || inq.breakfast === true),
            dinner: Boolean(inq.dinner === 1 || inq.dinner === '1' || inq.dinner === true),
            visa: Boolean(inq.visa_included === 1 || inq.visa_included === '1' || inq.visa_included === true || inq.visa === 1 || inq.visa === '1' || inq.visa === true),
            ticket: Boolean(inq.ticket === 1 || inq.ticket === '1' || inq.ticket === true),
            roundtrip: Boolean(inq.roundtrip === 1 || inq.roundtrip === '1' || inq.roundtrip === true),
            ziyarat: Boolean(inq.ziyarat === 1 || inq.ziyarat === '1' || inq.ziyarat === true),
            guide: Boolean(inq.guide === 1 || inq.guide === '1' || inq.guide === true),
          },
        };
        // Only include if packageName exists
        if (!packageDetails.packageName) {
          packageDetails = null;
        }
      }
      
      return {
        // Set id to externalId for frontend compatibility (frontend uses id as primary key)
        id: externalId,
        externalId: externalId,
        // Map to both customerName and name for frontend compatibility
        name: customerName,
        customerName: customerName,
        // Map to both email and customerEmail for frontend compatibility
        email: inq.email || inq.customerEmail || inq.customer_email || '',
        customerEmail: inq.email || inq.customerEmail || inq.customer_email || '',
        // Map to both phone and customerPhone for frontend compatibility
        phone: inq.phone || inq.customerPhone || inq.customer_phone || inq.contact || '',
        customerPhone: inq.phone || inq.customerPhone || inq.customer_phone || inq.contact || '',
        // Map subject field (use first part of message or a default)
        subject: inq.subject || (message.length > 50 ? message.substring(0, 50) + '...' : message) || '(No subject)',
        message: message,
        status: inq.status || 'pending',
        priority: inq.priority || 'low',
        packageDetails: packageDetails,
        createdAt: inq.created_at || inq.createdAt || inq.date_created || new Date(),
        // Mark as external (not in MongoDB yet)
        _isExternal: true,
        // Don't include assignedAgent from external API - we'll check MongoDB for that
        assignedAgent: null,
      };
    });
  } catch (error) {
    console.error('Failed to fetch external inquiries:', error.message);
    if (error.response) {
      console.error('Error status:', error.response.status);
      console.error('Error body:', JSON.stringify(error.response.body).substring(0, 500));
    } else if (error.request) {
      console.error('No response received from external API');
    }
    return []; // Return empty array on error
  }
};

// Get all inquiries (Admin sees all, Agent sees only theirs)
export const getInquiries = async (req, res) => {
  try {
    // MongoDB only contains ASSIGNED inquiries (they're saved when assigned)
    // So we fetch assigned inquiries from MongoDB
    let mongoFilter = {
      assignedAgent: { $exists: true, $ne: null } // Only inquiries with assigned agents
    };
    
    if (req.user.role === "agent") {
      // Agents can ONLY see inquiries assigned to them
      // Ensure req.user._id is properly formatted for MongoDB query
      const agentId = req.user._id?.toString ? req.user._id.toString() : String(req.user._id);
      mongoFilter.assignedAgent = req.user._id; // Mongoose will handle ObjectId conversion
      console.log(`Agent filtering inquiries for agent ID: ${agentId}, role: ${req.user.role}`);
    } else {
      console.log(`Admin fetching all assigned inquiries`);
    }
    // Admin sees all assigned inquiries from MongoDB (no additional filter)

    const mongoInquiries = await Inquiry.find(mongoFilter)
      .sort({ createdAt: -1 }); // latest first
    
    console.log(`Found ${mongoInquiries.length} inquiries from MongoDB for ${req.user.role === "agent" ? "agent" : "admin"}`);

    // Manually populate assignedAgent from both User and Agent models
    const { default: User } = await import("../models/User.js");
    const { default: Agent } = await import("../models/Agent.js");
    
    const populatedMongoInquiries = await Promise.all(mongoInquiries.map(async (inquiry) => {
      // Convert to plain object to ensure proper JSON serialization
      const inquiryObj = inquiry.toObject ? inquiry.toObject() : inquiry;
      
      // Debug: Log assignedAgent for agents
      if (req.user.role === "agent") {
        const inquiryAgentId = inquiryObj.assignedAgent?.toString ? inquiryObj.assignedAgent.toString() : String(inquiryObj.assignedAgent);
        const userAgentId = req.user._id?.toString ? req.user._id.toString() : String(req.user._id);
        console.log(`Inquiry ${inquiryObj._id}: assignedAgent=${inquiryAgentId}, user._id=${userAgentId}, match=${inquiryAgentId === userAgentId}`);
      }
      
      // Ensure id field is set (frontend uses id as primary key)
      if (!inquiryObj.id && inquiryObj._id) {
        inquiryObj.id = inquiryObj._id.toString();
      }
      
      // Ensure name field is set for frontend compatibility (maps from customerName)
      if (!inquiryObj.name && inquiryObj.customerName) {
        inquiryObj.name = inquiryObj.customerName;
      }
      
      // Ensure email field is set for frontend compatibility (maps from customerEmail)
      if (!inquiryObj.email && inquiryObj.customerEmail) {
        inquiryObj.email = inquiryObj.customerEmail;
      }
      
      // Ensure phone field is set for frontend compatibility (maps from customerPhone)
      if (!inquiryObj.phone && inquiryObj.customerPhone) {
        inquiryObj.phone = inquiryObj.customerPhone;
      }
      
      // Ensure subject field is set (use first part of message or a default)
      if (!inquiryObj.subject && inquiryObj.message) {
        const msg = String(inquiryObj.message);
        inquiryObj.subject = msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
      } else if (!inquiryObj.subject) {
        inquiryObj.subject = '(No subject)';
      }
      
      // Ensure priority field is set
      if (!inquiryObj.priority) {
        inquiryObj.priority = 'low';
      }
      
      // Ensure packageDetails is preserved and properly structured
      if (inquiryObj.packageDetails) {
        // PackageDetails already exists, ensure it's properly structured
        inquiryObj.packageDetails = inquiryObj.packageDetails;
      } else {
        // If no packageDetails but we have flat package fields, try to construct it
        // This might happen if data was stored in flat format
        if (inquiryObj.packageName || inquiryObj.package_name) {
          inquiryObj.packageDetails = {
            packageName: inquiryObj.packageName || inquiryObj.package_name || null,
            pricing: {
              double: inquiryObj.price_double || null,
              triple: inquiryObj.price_triple || null,
              quad: inquiryObj.price_quad || null,
              currency: inquiryObj.currency || 'USD',
            },
            duration: {
              nightsMakkah: inquiryObj.nights_makkah || null,
              nightsMadina: inquiryObj.nights_madina || null,
              totalNights: inquiryObj.total_nights || null,
            },
            hotels: {
              makkah: inquiryObj.hotel_makkah || null,
              madina: inquiryObj.hotel_madina || null,
            },
            services: {
              transportation: inquiryObj.transportation || null,
              visa: inquiryObj.visa_service || null,
            },
            inclusions: {
              breakfast: inquiryObj.breakfast || false,
              dinner: inquiryObj.dinner || false,
              visa: inquiryObj.visa_included || false,
              ticket: inquiryObj.ticket || false,
              roundtrip: inquiryObj.roundtrip || false,
              ziyarat: inquiryObj.ziyarat || false,
              guide: inquiryObj.guide || false,
            },
          };
        }
      }
      
      if (inquiryObj.assignedAgent) {
        const agentId = inquiryObj.assignedAgent.toString();
        const userAgent = await User.findById(agentId).select("name email").lean();
        const agentDoc = await Agent.findById(agentId).select("name email").lean();
        
        if (userAgent) {
          inquiryObj.assignedAgent = userAgent;
        } else if (agentDoc) {
          inquiryObj.assignedAgent = agentDoc;
        }
      }
      
      // Ensure externalId is included if present
      if (inquiryObj.externalId) {
        inquiryObj.externalId = inquiryObj.externalId;
      }
      
      return inquiryObj;
    }));

    // For admins: fetch ALL inquiries from external API, merge with assigned ones from MongoDB
    let allInquiries = populatedMongoInquiries;
    if (req.user.role === "admin") {
      const externalInquiries = await fetchExternalInquiries();
      
      // Create a Set of externalIds we already have in MongoDB (these are assigned)
      // Also check the id field in case externalId is not set
      const existingExternalIds = new Set();
      populatedMongoInquiries.forEach((inq) => {
        if (inq.externalId && inq.externalId.trim() !== '') {
          existingExternalIds.add(String(inq.externalId).trim());
        }
        // Also add the id if it's not a MongoDB ObjectId (24 hex chars)
        if (inq.id && !/^[0-9a-fA-F]{24}$/.test(String(inq.id))) {
          existingExternalIds.add(String(inq.id).trim());
        }
      });
      
      console.log(`Found ${existingExternalIds.size} unique external IDs already in MongoDB (assigned)`);
      console.log(`Found ${externalInquiries.length} total inquiries from external API`);
      
      if (externalInquiries.length > 0) {
        console.log(`Sample external inquiry IDs:`, externalInquiries.slice(0, 3).map(inq => inq.id || inq.externalId));
      }
      
      // Filter external inquiries to only include those NOT in MongoDB (unassigned)
      const unassignedExternalInquiries = externalInquiries.filter((inq) => {
        const extId = inq.externalId || inq.id;
        if (!extId) {
          console.warn('External inquiry missing externalId and id:', inq);
          return false; // Skip inquiries without IDs
        }
        const isAssigned = existingExternalIds.has(String(extId).trim());
        if (isAssigned) {
          console.log(`External inquiry ${extId} is already assigned (in MongoDB)`);
        }
        return !isAssigned;
      });
      
      console.log(`Filtered to ${unassignedExternalInquiries.length} unassigned inquiries from external API`);
      
      // Merge: Unassigned external inquiries first, then assigned MongoDB inquiries
      allInquiries = [...unassignedExternalInquiries, ...populatedMongoInquiries];
      
      console.log(`Returning ${unassignedExternalInquiries.length} unassigned (external) + ${populatedMongoInquiries.length} assigned (MongoDB) = ${allInquiries.length} total inquiries`);
    }

    res.json({ success: true, data: allInquiries });
  } catch (error) {
    console.error('getInquiries error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get inquiry by ID
export const getInquiryById = async (req, res) => {
  try {
    // Check if ID is a valid MongoDB ObjectId - if not, it's likely an externalId
    let inquiry = null;
    const isMongoObjectId = mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24;
    
    if (isMongoObjectId) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }

    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });

    // Manually populate assignedAgent from both User and Agent models
    if (inquiry.assignedAgent) {
      const { default: User } = await import("../models/User.js");
      const { default: Agent } = await import("../models/Agent.js");
      
      const agentId = inquiry.assignedAgent.toString();
      const userAgent = await User.findById(agentId).select("name email").lean();
      const agentDoc = await Agent.findById(agentId).select("name email").lean();
      
      if (userAgent) {
        inquiry.assignedAgent = userAgent;
      } else if (agentDoc) {
        inquiry.assignedAgent = agentDoc;
      }
    }

    // Agents can see only their inquiries
    const assignedAgentId = inquiry.assignedAgent?._id?.toString() || inquiry.assignedAgent?.toString();
    if (req.user.role === "agent" && assignedAgentId !== req.user._id.toString()) {
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
    const isMongoObjectId = mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24;
    
    if (isMongoObjectId) {
      // Try to find by MongoDB _id first
      inquiry = await Inquiry.findById(req.params.id);
    }
    
    // If not found by _id (or ID wasn't a valid ObjectId), try finding by externalId
    if (!inquiry) {
      inquiry = await Inquiry.findOne({ externalId: req.params.id });
    }
    
    // Manually populate assignedAgent from both User and Agent models if it exists
    if (inquiry && inquiry.assignedAgent) {
      const { default: User } = await import("../models/User.js");
      const { default: Agent } = await import("../models/Agent.js");
      
      const agentId = inquiry.assignedAgent.toString();
      const userAgent = await User.findById(agentId).select("name email").lean();
      const agentDoc = await Agent.findById(agentId).select("name email").lean();
      
      if (userAgent) {
        inquiry.assignedAgent = userAgent;
      } else if (agentDoc) {
        inquiry.assignedAgent = agentDoc;
      }
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
        // Note: assignedAgent will be populated later after assignment
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

    // Manually populate assignedAgent from both User and Agent models for response
    try {
      const { default: User } = await import("../models/User.js");
      const { default: Agent } = await import("../models/Agent.js");
      
      const agentId = assignedAgent.toString();
      const userAgent = await User.findById(agentId).select("name email").lean();
      const agentDoc = await Agent.findById(agentId).select("name email").lean();
      
      // Convert inquiry to plain object for proper JSON serialization
      const inquiryObj = inquiry.toObject ? inquiry.toObject() : inquiry;
      
      if (userAgent) {
        inquiryObj.assignedAgent = userAgent;
      } else if (agentDoc) {
        inquiryObj.assignedAgent = agentDoc;
      } else {
        // If not found in either, keep as ObjectId string
        inquiryObj.assignedAgent = agentId;
        console.warn(`Agent ${agentId} not found in User or Agent models`);
      }
      
      res.json({ 
        success: true, 
        message: "Inquiry assigned to agent successfully",
        data: inquiryObj 
      });
    } catch (populateError) {
      console.warn("Could not populate assignedAgent:", populateError);
      // Continue without population, but still convert to plain object
      const inquiryObj = inquiry.toObject ? inquiry.toObject() : inquiry;
      res.json({ 
        success: true, 
        message: "Inquiry assigned to agent successfully",
        data: inquiryObj 
      });
    }
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
    const isMongoObjectId = mongoose.Types.ObjectId.isValid(req.params.id) && req.params.id.length === 24;
    
    if (isMongoObjectId) {
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
      const assignedAgentId = inquiry.assignedAgent?.toString();
      if (assignedAgentId !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      // Agents can only update status, not assignment
      if (status) {
        // Map frontend status to backend status if needed
        inquiry.status = status;
      }
    } else if (req.user.role === "admin") {
      // Admin can update both status and assignment (but use assignInquiryToAgent endpoint for proper workflow)
      if (status) {
        inquiry.status = status;
      }
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
    
    // Convert to plain object and populate assignedAgent for response
    const inquiryObj = inquiry.toObject ? inquiry.toObject() : inquiry;
    
    // Manually populate assignedAgent from both User and Agent models if it exists
    if (inquiryObj.assignedAgent) {
      const { default: User } = await import("../models/User.js");
      const { default: Agent } = await import("../models/Agent.js");
      
      const agentId = inquiryObj.assignedAgent.toString();
      const userAgent = await User.findById(agentId).select("name email").lean();
      const agentDoc = await Agent.findById(agentId).select("name email").lean();
      
      if (userAgent) {
        inquiryObj.assignedAgent = userAgent;
      } else if (agentDoc) {
        inquiryObj.assignedAgent = agentDoc;
      }
    }
    
    res.json({ success: true, data: inquiryObj });
  } catch (error) {
    console.error("updateInquiry error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      paramsId: req.params.id,
      status: req.body.status
    });
    res.status(500).json({ success: false, message: error.message || "Internal server error" });
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

