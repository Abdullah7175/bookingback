// server/middleware/companyContext.js
import mongoose from "mongoose";
import Company from "../models/company.js";

// normalize values like: ObjectId("..."), `"..."`, `'...'`, with stray spaces
const normalizeCompanyId = (val) => {
  if (!val) return null;
  if (typeof val === "object" && val._id) val = val._id;
  if (typeof val !== "string") val = String(val);
  val = val.trim();
  // strip ObjectId("...") wrapper if present
  const m = val.match(/^ObjectId\(["']?([0-9a-fA-F]{24})["']?\)$/);
  if (m) val = m[1];
  // strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val.trim();
};

export const extractCompanyId = (req) =>
  req.headers["x-company-id"] ||
  req.query.companyId ||
  (req.user && (req.user.company?._id || req.user.company)) ||
  process.env.DEFAULT_COMPANY_ID ||
  null;

export const ensureCompany = (required = true) => async (req, res, next) => {
  try {
    let companyId = normalizeCompanyId(extractCompanyId(req));

    if (companyId && !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company id", value: companyId });
    }

    if (companyId) {
      const exists = await Company.exists({ _id: companyId });
      if (!exists) return res.status(400).json({ message: "Company not found", value: companyId });
    } else if (required) {
      return res.status(400).json({
        message: "Company context missing",
        tips: [
          "Send 'x-company-id' header",
          "or add '?companyId=...'",
          "or attach 'company' to the authenticated user",
          "or set DEFAULT_COMPANY_ID in .env",
        ],
      });
    }

    req.companyId = companyId || null;
    next();
  } catch (e) {
    console.error("ensureCompany error:", e);
    res.status(500).json({ message: "Server error" });
  }
};
