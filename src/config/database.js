import mongoose from "mongoose";

console.log("Connecting to MongoDB...");

// Customer DB
export const customerDB = mongoose.createConnection(
  process.env.MONGO_URI_CUSTOMERS
);

// Worker DB
export const workerDB = mongoose.createConnection(
  process.env.MONGO_URI_WORKER
);

// Booking DB
export const bookingDB = mongoose.createConnection(
  process.env.MONGO_URI_BOOKINGS
);

// Customer Events
customerDB.on("connected", () => {
  console.log("✅ Customer DB Connected");
});

customerDB.on("error", (err) => {
  console.error("❌ Customer DB Error:", err.message);
});

// Worker Events
workerDB.on("connected", () => {
  console.log("✅ Worker DB Connected");
});

workerDB.on("error", (err) => {
  console.error("❌ Worker DB Error:", err.message);
});

// Booking Events
bookingDB.on("connected", () => {
  console.log("✅ Booking DB Connected");
});

bookingDB.on("error", (err) => {
  console.error("❌ Booking DB Error:", err.message);
});

export default {
  customerDB,
  workerDB,
  bookingDB,
};