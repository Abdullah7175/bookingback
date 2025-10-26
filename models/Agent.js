import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const agentSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "agent" },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
    // Additional fields from frontend
    username: { type: String },
    department: { type: String },
    monthlyTarget: { type: Number, default: 5000 },
    commissionRate: { type: Number, default: 5.0 },
  },
  { timestamps: true }
);

// Password hashing is done in the controller before save

// Method to compare passwords
agentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

const Agent = mongoose.model("Agent", agentSchema);
export default Agent;