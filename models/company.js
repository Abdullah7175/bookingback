// models/Company.js
import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },     // e.g. "mtumrah"
    domain: { type: String, unique: true, sparse: true },   // e.g. "mtumrah.com"
    email: { type: String },
    phone: { type: String },
    address: { type: String },

    // Branding (optional)
    primaryColor: { type: String, default: "#0ea5e9" },
    logoUrl: { type: String },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Single index definition (removed duplicate)
companySchema.index({ name: 1 });

export default mongoose.models.Company || mongoose.model("Company", companySchema);
    