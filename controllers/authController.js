import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import bcrypt from "bcryptjs";

// @desc    Login user (checks both User and Agent models)
// @route   POST /api/auth/login
// @access  Public
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate
  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  // Try User model first
  let user = await User.findOne({ email }).select("+passwordHash");
  
  // If not found in User, try Agent model
  if (!user) {
    const { default: Agent } = await import("../models/Agent.js");
    const agent = await Agent.findOne({ email }).select("+passwordHash");
    
    if (agent) {
      // Check password for agent
      const passwordMatch = await agent.matchPassword(password);
      if (passwordMatch) {
        return res.json({
          token: generateToken({ _id: agent._id, role: agent.role }),
          user: {
            id: agent._id,
            name: agent.name,
            email: agent.email,
            role: agent.role || "agent",
          },
        });
      }
    }
  } else {
    // Check password for user
    const passwordMatch = await user.matchPassword(password);
    if (passwordMatch) {
      return res.json({
        token: generateToken(user),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }
  }

  // If we reach here, credentials are invalid
  res.status(401);
  throw new Error("Invalid email or password");
});

// @desc    Register user (admin only)
// @route   POST /api/auth/register
// @access  Admin
export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("All fields are required");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: role || "agent",
  });

  if (user) {
    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});
