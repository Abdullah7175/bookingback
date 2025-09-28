// utils/dbManager.js (ESM)
import Booking from "../models/Booking.js";
import Inquiry from "../models/Inquiry.js";
import Agent from "../models/Agent.js";
import Company from "../models/Company.js";

/**
 * For now this returns the shared models.
 * If you need true multi-tenant isolation later, we can swap this
 * to return company-specific models/collections using the companyId.
 */
export async function getCompanyModels(companyId) {
  // You can log/verify the company context if helpful:
  // console.log("getCompanyModels companyId:", companyId);
  return {
    Booking,
    Inquiry,
    Agent,
    Company,
  };
}

// Provide BOTH named and default exports to avoid import mismatches
export default getCompanyModels;
