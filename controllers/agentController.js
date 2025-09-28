// controllers/agentController.js
import Joi from "joi";
import bcrypt from "bcryptjs";
import Agent from "../models/Agent.js";
import generateToken from "../utils/generateToken.js";
import { getCompanyModels } from "../utils/dbManager.js";

/* ----------------------------- helpers ----------------------------- */

const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().allow("", null),
  upsert: Joi.boolean().optional() // allow in body or ?upsert=true
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const sanitize = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone ?? null,
  company: u.company ?? null,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

/* ----------------------------- controllers ----------------------------- */

// POST /api/agent/register  (admin; ensureCompany(true) recommended)
export const registerAgent = async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(
      { ...req.body, upsert: req.body.upsert ?? (req.query.upsert === "true") },
      { abortEarly: false, stripUnknown: true }
    );
    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        details: error.details.map((d) => d.message),
      });
    }

    const companyId = req.companyId || req.user?.company || null;
    const query = companyId ? { email: value.email, company: companyId } : { email: value.email };

    let agent = await Agent.findOne(query).select("+passwordHash");
    if (agent) {
      if (value.upsert) {
        agent.name = value.name ?? agent.name;
        agent.phone = typeof value.phone !== "undefined" ? value.phone : agent.phone;
        agent.passwordHash = await bcrypt.hash(value.password, 12);
        await agent.save();
        return res.status(200).json({
          ...sanitize(agent),
          updated: true,
          token: generateToken(agent._id, agent.role),
        });
      }
      return res.status(409).json({
        message: "Agent already exists",
        hint: "Send ?upsert=true (or body upsert: true) to update password/profile instead.",
      });
    }

    const passwordHash = await bcrypt.hash(value.password, 12);
    agent = await Agent.create({
      name: value.name,
      email: value.email,
      phone: value.phone || undefined,
      role: "agent",
      passwordHash,
      company: companyId || undefined,
    });

    return res.status(201).json({
      ...sanitize(agent),
      created: true,
      token: generateToken(agent._id, agent.role),
    });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Agent already exists", key: e.keyValue });
    }
    console.error("registerAgent error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// POST /api/agent/login  (public)
export const loginAgent = async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: "Validation failed", details: error.details.map(d => d.message) });
    }

    // limit to role=agent (change if you want admins to use this too)
    const agent = await Agent.findOne({ email: value.email, role: "agent" }).select("+passwordHash");
    if (!agent) return res.status(401).json({ message: "Invalid email or password" });

    const ok = await bcrypt.compare(value.password, agent.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password" });

    return res.json({
      token: generateToken(agent._id, agent.role),
      agent: sanitize(agent),
    });
  } catch (e) {
    console.error("loginAgent error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/agent  (admin)
export const getAgents = async (req, res) => {
  try {
    const companyId = req.companyId || req.user?.company || null;
    const query = companyId ? { company: companyId } : {};
    const agents = await Agent.find(query)
      .select("_id name email role phone company createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(agents);
  } catch (e) {
    console.error("getAgents error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/agent/:id  (admin)
export const getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.company || null;
    const query = companyId ? { _id: id, company: companyId } : { _id: id };

    const agent = await Agent.findOne(query)
      .select("_id name email role phone company createdAt updatedAt")
      .lean();

    if (!agent) return res.status(404).json({ message: "Agent not found" });
    return res.json(agent);
  } catch (e) {
    console.error("getAgentById error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/agent/:id  (self or admin)
export const updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, password } = req.body;

    if (!name && typeof phone === "undefined" && !password) {
      return res.status(400).json({ message: "At least one field (name, phone, password) is required to update" });
    }

    const companyId = req.companyId || req.user?.company || null;
    const query = companyId ? { _id: id, company: companyId } : { _id: id };

    const agent = await Agent.findOne(query).select("+passwordHash");
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    // Only admin or the agent himself can update
    if (req.user.role !== "admin" && req.user._id.toString() !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (typeof name !== "undefined") agent.name = name;
    if (typeof phone !== "undefined") agent.phone = phone;
    if (password) agent.passwordHash = await bcrypt.hash(password, 12);

    await agent.save();
    return res.json(sanitize(agent));
  } catch (e) {
    console.error("updateAgent error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/agent/:id  (admin)
export const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.company || null;
    const query = companyId ? { _id: id, company: companyId } : { _id: id };

    const agent = await Agent.findOne(query);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    await agent.deleteOne(); // remove() is deprecated
    return res.json({ message: "Agent removed" });
  } catch (e) {
    console.error("deleteAgent error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/agent/performance  (admin; company-scoped)
export const getAgentPerformance = async (req, res) => {
  try {
    const companyId = req.companyId || req.user?.company || null;
    const { Booking } = await getCompanyModels(companyId);

    const { start, end } = req.query; // optional ISO strings
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    // If your Booking schema has a company field, also filter by it:
    if (companyId) match.company = companyId;

    const data = await Booking.aggregate([
      { $match: match },
      { $group: { _id: "$agent", bookings: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
      { $sort: { bookings: -1 } },
    ]);

    return res.json({ ok: true, data });
  } catch (e) {
    console.error("getAgentPerformance error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
