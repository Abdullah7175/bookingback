// server/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";

/**
 * Auth guard
 * - Reads Bearer token from Authorization header
 * - Verifies JWT
 * - Loads user with company field attached
 * - Attaches user to req.user
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token = null;

  // Expect: Authorization: Bearer <token>
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }

  // Verify token
  let decoded;
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT secret not configured");
    }
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Not authorized, token invalid");
  }

  // Try loading from User first, then Agent
  let user = await User.findById(decoded.id)
    .select("_id name email role company createdAt updatedAt");

  // If not found in User, try Agent model
  if (!user) {
    const { default: Agent } = await import("../models/Agent.js");
    const agent = await Agent.findById(decoded.id)
      .select("_id name email role phone username department monthlyTarget commissionRate createdAt updatedAt");
    if (agent) {
      // Convert agent to user-like format
      user = {
        _id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role || "agent",
        company: null,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      };
    }
  }

  if (!user) {
    res.status(401);
    throw new Error("Not authorized, user not found");
  }

  // Attach to request for downstream use (ensureCompany will read req.user.company)
  req.user = user;

  // Optional: uncomment for one-time debugging
  // console.log("Auth user:", {
  //   id: user._id?.toString(),
  //   role: user.role,
  //   company: user.company?._id?.toString?.() || user.company || null,
  // });

  next();
});

/**
 * Admin guard
 */
export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  res.status(403);
  throw new Error("Admin only");
};

/**
 * Role guard
 * Usage: router.get('/path', protect, authorizeRoles('admin','manager'), handler)
 */
export const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
