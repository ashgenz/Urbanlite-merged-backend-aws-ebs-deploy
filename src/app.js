import express from "express";
import cors from "cors";

const app = express();

global.app = app;

app.use(express.json());

const allowedOrigins = [""];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

// Load ONLY auth routes
await import("./routes/auth.js");
await import("./routes/booking.js");
await import("./routes/worker.js");

export default app;