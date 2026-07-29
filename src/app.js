import express from "express";
import cors from "cors";

const app = express();

global.app = app;

app.use(express.json());
// Put this right above your database connections or other routes
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).send("Healthy");
});
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  // add your frontend production URL here when ready
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, or AWS health checkers)
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