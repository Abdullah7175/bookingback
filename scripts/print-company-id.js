// server/scripts/print-company-id.js
import "dotenv/config";
import mongoose from "mongoose";
import Company from "../models/company.js";

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI/MONGODB_URI missing");
  await mongoose.connect(uri);

  let c = await Company.findOne().lean();
  if (!c) c = await Company.create({ name: "Default Company" }); // creates one if missing
  console.log("Company ID:", c._id.toString());

  await mongoose.disconnect();
};
run().catch(console.error);
