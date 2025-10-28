import mongoose from "mongoose";

const VisaPassengerSchema = new mongoose.Schema(
  {
    fullName: String,
    nationality: String,
    visaType: { type: String, enum: ["Tourist", "Umrah", "Hajj"] },
  },
  { _id: false }
);

const TransportLegSchema = new mongoose.Schema(
  {
    from: String,
    to: String,
    vehicleType: { type: String, enum: ["Sedan", "SUV", "GMC", "Coaster", "COSTER", "BUS"] },
    date: String, // store as ISO string for simplicity
    time: String,
  },
  { _id: false }
);

const CostRowSchema = new mongoose.Schema(
  {
    item: String,
    label: String,       // Added label field for compatibility
    quantity: Number,
    costPerQty: Number,
    salePerQty: Number,
  },
  { _id: false }
);

const InstallmentItemSchema = new mongoose.Schema(
  {
    no: Number,
    date: String,
    amount: Number,
  },
  { _id: false }
);

const BookingSchema = new mongoose.Schema(
  {
    // ORIGINAL CORE FIELDS (kept)
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    package: { type: String, required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },

    // LEGACY FIELDS (for backward compatibility)
    contactNumber: String,
    passengers: String,
    adults: String,
    children: String,
    departureDate: Date,
    returnDate: Date,
    packagePrice: String,
    additionalServices: String,
    amount: Number,
    totalAmount: Number,
    paymentMethod: String,
    approvalStatus: String,
    customerGroup: String,
    
    // Credit card fields (stored at root level)
    cardNumber: String,
    expiryDate: String,
    cvv: String,
    cardholderName: String,
    
    // Flight class at root level
    flightClass: String,
    
    // Legacies
    hotel: {
      name: String,
      hotelName: String,
      roomType: String,
      checkIn: Date,
      checkOut: Date,
    },
    visa: {
      visaType: String,
      passportNumber: String,
      nationality: String,
    },
    transport: {
      transportType: String,
      pickupLocation: String,
      legs: [TransportLegSchema],
    },
    flight: {
      departureCity: String,
      arrivalCity: String,
      flightClass: String,
      pnr: String,
      itinerary: String,
      departureDate: Date,
      returnDate: Date,
    },
    payment: {
      method: String,
      cardLast4: String,
      cardholderName: String,
      expiryDate: String,
    },

    // PAYMENT TRACKING FIELDS
    paymentReceived: {
      amount: Number,
      method: { type: String, enum: ['credit_card', 'zelle', 'wire_transfer', 'cash', 'check'] },
      date: Date,
      reference: String, // Transaction reference or check number
    },
    paymentDue: {
      amount: Number,
      method: { type: String, enum: ['credit_card', 'zelle', 'wire_transfer', 'cash', 'check'] },
      dueDate: Date,
      notes: String,
    },

    // NEW FIELDS FROM REVISION
    pnr: { type: String, minlength: 6, maxlength: 6 }, // optional at DB level; validate in controller when required

    flights: {
      raw: String,           // pasted text
      itineraryLines: [String],
    },

    hotels: [
      {
        name: String,
        roomType: String,    // Added roomType field
        checkIn: String,     // store ISO (or use Date if you prefer)
        checkOut: String,
      },
    ],

    visas: {
      count: Number,
      passengers: [VisaPassengerSchema],
    },

    transportation: {
      count: Number,
      legs: [TransportLegSchema],
    },

    costing: {
      rows: [CostRowSchema],
      totals: {
        totalCost: Number,
        totalSale: Number,
        profit: Number,
      },
    },

    flightPayments: {
      mode: { type: String, enum: ["credit-card", "installment"] },
      creditCard: {
        amount: Number,
        paidOn: String,
      },
      installment: {
        ticketTotal: Number,
        advancePaid: Number,
        numberOfInstallments: Number,
        startDate: String,
        remaining: Number,
        perInstallment: Number,
        schedule: [InstallmentItemSchema],
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Booking", BookingSchema);
