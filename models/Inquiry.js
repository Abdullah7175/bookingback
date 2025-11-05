import mongoose from "mongoose";

const responseSchema = new mongoose.Schema(
  {
    responder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    approved: { type: Boolean, default: false }, // admin approval
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const inquirySchema = new mongoose.Schema(
  {
    // External ID from PostgreSQL system (optional - for inquiries coming from external portal)
    externalId: { type: String, index: true, sparse: true },
    
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "in-progress", "resolved", "closed", "responded"],
      default: "pending",
    },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    responses: [responseSchema],
    
    // Package details fields (optional - only for package-specific inquiries)
    packageDetails: {
      packageName: String,
      pricing: {
        double: String,
        triple: String,
        quad: String,
        currency: String,
      },
      duration: {
        nightsMakkah: String,
        nightsMadina: String,
        totalNights: String,
      },
      hotels: {
        makkah: String,
        madina: String,
      },
      services: {
        transportation: String,
        visa: String,
      },
      inclusions: {
        breakfast: Boolean,
        dinner: Boolean,
        visa: Boolean,
        ticket: Boolean,
        roundtrip: Boolean,
        ziyarat: Boolean,
        guide: Boolean,
      },
    },
  },
  { timestamps: true }
);

const Inquiry = mongoose.model("Inquiry", inquirySchema);
export default Inquiry;
