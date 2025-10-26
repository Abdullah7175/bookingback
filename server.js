 
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";

import connectDB from "./config/db.js";
import { loginUser } from "./controllers/authController.js";
import { loginAgent } from "./controllers/agentController.js";
import User from "./models/User.js";

// Routers
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import inquiryRoutes from "./routes/inquiryRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";

dotenv.config();
await connectDB();

const app = express();
app.use(express.json());

// ---- CORS ----
const allowed = (process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || "")
  .split(",").map(s => s.trim()).filter(Boolean);

app.use((req,res,next)=>{ res.setHeader("Vary","Origin"); next(); });
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (!allowed.length) return cb(null, true);
    return allowed.includes(origin) ? cb(null, true) : cb(new Error("CORS"));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Expires","Cache-Control","Pragma"]
}));

// ---- Health
app.get("/health", (_req,res)=> res.status(200).json({ ok: true }));
// ---- Minimal auth helper for /me endpoints
const auth = (req,res,next)=>{
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not authorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ message: "Token invalid" });
  }
};

// ---- Routes
// Keep inline login (safe), plus mount full auth router
app.post("/api/auth/login", loginUser);
app.post("/api/agent/login", loginAgent); // Use agent-specific login

// "me" endpoints needed by the UI
app.get("/api/auth/me", auth, async (req,res)=>{
  const u = await User.findById(req.userId).lean();
  if (!u) return res.status(404).json({ message: "User not found" });
  res.json({ id: u._id, name: u.name, email: u.email, role: u.role });
});
app.get("/api/agent/me", auth, async (req,res)=>{
  // Try User first (for backwards compatibility)
  let u = await User.findById(req.userId).lean();
  
  // If not found in User, try Agent model
  if (!u) {
    const { default: Agent } = await import("./models/Agent.js");
    const agent = await Agent.findById(req.userId)
      .select("_id name email role phone username department monthlyTarget commissionRate")
      .lean();
    
    if (agent) {
      // Return agent data in user-like format
      return res.json({
        id: agent._id,
        name: agent.name,
        email: agent.email,
        role: agent.role || "agent",
      });
    }
  }
  
  // Only reach here if found in User model
  if (!u) return res.status(404).json({ message: "User not found" });
  res.json({ id: u._id, name: u.name, email: u.email, role: u.role });
});

// Mount full feature routers (bookings, inquiries, agents, analytics)
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/analytics", analyticsRoutes);

const PORT = Number(process.env.PORT) || 7000;

const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`)); 
