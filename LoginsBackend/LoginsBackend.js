

// server.js
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const JWT_KEY = process.env.JWT_KEY;

const allowedOrigins = [
  "http://localhost:5173",
  "https://urbanlite-react.onrender.com", // <-- change to your real frontend Render URL
  "https://tryurbanlite.in",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

// ------------------ MongoDB Connection ------------------
mongoose.connect(process.env.MONGO_URI_CUSTOMERS, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch((err) => {
  console.error("❌ MongoDB connection failed:", err.message);
  process.exit(1);
});

// ------------------ Schemas ------------------
// const UserSchema = new mongoose.Schema({
//   name: String,
//   Phone: { type: String, unique: true },
//   location: { lat: Number, lng: Number },
//   Password: String,
// });
const UserSchema = new mongoose.Schema({
  name: String,
  // 1. Make Phone sparse: true so multiple users without phones (Google users) don't conflict
  Phone: { type: String, unique: true, sparse: true }, 
  
  // 2. Add email for Google identification
  email: { type: String, unique: true, sparse: true }, 
  
  location: { lat: Number, lng: Number },
  address: String, // Ensure this exists
  // 3. Password must be optional since Google users won't have one
  Password: { type: String, required: false }, 
  
  // 4. Store the unique Google ID to prevent duplicate accounts
  googleId: { type: String, unique: true, sparse: true },
  
  // 5. Useful for tracking how the user joined
  authMethod: { type: String, enum: ['local', 'google'], default: 'local' }
});

const ContactMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  Phone: String,
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const ContactMessage = mongoose.model("ContactMessage", ContactMessageSchema);

// ------------------ JWT Middleware ------------------
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_KEY, (err, user) => {
    if (err){ 4
      console.log("JWT Error:", err.message);
      return res.status(403).json({ message: "Invalid or Expired Token", error: err.message });    
    }
    req.user = user;
    next();
  });
}


// In LoginsBackend.js (or your User Auth service)

// In LoginsBackend.js

// app.post("/api/user/verify-and-merge", verifyToken, async (req, res) => {
//   const { phone, address, location } = req.body;
//   const currentUserId = req.user.id;

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const gmailUser = await User.findById(currentUserId).session(session);
//     if (!gmailUser) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({ message: "User not found" });
//     }

//     const existingPhoneUser = await User.findOne({ Phone: phone }).session(session);

//     // ============================
//     // CASE 2: Phone exists → MERGE
//     // ============================
//     if (existingPhoneUser) {

//       const googleIdToMove = gmailUser.googleId;
//       const emailToMove = gmailUser.Email;

//       // remove googleId first to avoid duplicate unique index
//       gmailUser.googleId = undefined;
//       gmailUser.Email = undefined;
//       await gmailUser.save({ session });

//       // assign to phone user
//       existingPhoneUser.googleId = googleIdToMove || existingPhoneUser.googleId;
//       existingPhoneUser.Email = emailToMove || existingPhoneUser.Email;
//       existingPhoneUser.address = address || existingPhoneUser.address;
//       existingPhoneUser.location = location || existingPhoneUser.location;

//       await existingPhoneUser.save({ session });

//       // delete gmail-only account
//       await User.findByIdAndDelete(currentUserId).session(session);

//       await session.commitTransaction();
//       session.endSession();

//       const newToken = jwt.sign(
//         { id: existingPhoneUser._id, role: "customer" },
//         process.env.JWT_KEY,
//         { expiresIn: "7d" }
//       );

//       return res.json({
//         message: "Accounts merged successfully",
//         token: newToken,
//         user: existingPhoneUser,
//       });
//     }

//     // ============================
//     // CASE 1: New phone → UPDATE Gmail user
//     // ============================
//     gmailUser.Phone = phone;
//     gmailUser.address = address;
//     gmailUser.location = location;

//     await gmailUser.save({ session });

//     await session.commitTransaction();
//     session.endSession();

//     return res.json({
//       message: "Phone, location & address added",
//       user: gmailUser,
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });
// server.js

// server.js -> Profile Completion / Merge Route
app.post("/api/user/verify-and-merge", verifyToken, async (req, res) => {
  const { phone, location, address } = req.body;
  const googleUserId = req.user.id; // The ID: 6994bbc4... (Google Account)

  try {
    const googleUser = await User.findById(googleUserId);
    if (!googleUser) return res.status(404).json({ message: "Google account not found." });

    // Look for the existing Phone account: 6994bba0...
    let phoneUser = await User.findOne({ Phone: phone });

    if (phoneUser) {
      // CASE: MERGE
      // 1. Check if phone account is already tied to a DIFFERENT email
      if (phoneUser.email && phoneUser.email !== googleUser.email) {
        return res.status(400).json({ 
          message: "This mobile number is already linked to another email." 
        });
      }

      // 2. PREVENT DUP KEY ERROR: 
      // Capture the Google data and delete the Google record immediately 
      // to free up the 'email' and 'googleId' unique indexes.
      const dataToMove = {
        email: googleUser.email,
        googleId: googleUser.googleId,
        authMethod: 'google'
      };

      await User.findByIdAndDelete(googleUserId);

      // 3. Update the Phone account with the captured Google info
      phoneUser.email = dataToMove.email;
      phoneUser.googleId = dataToMove.googleId;
      phoneUser.authMethod = dataToMove.authMethod;
      phoneUser.location = location || phoneUser.location;
      phoneUser.address = address || phoneUser.address;

      await phoneUser.save();

      // 4. Issue a new token tied to the PERMANENT Phone account ID
      const token = jwt.sign(
        { id: phoneUser._id, name: phoneUser.name, Phone: phoneUser.Phone },
        JWT_KEY,
        { expiresIn: "7d" }
      );

      return res.status(200).json({ 
        message: "Accounts merged successfully", 
        token, 
        customerId: phoneUser._id 
      });

    } else {
      // CASE: NEW PHONE (No merge needed, just update current record)
      googleUser.Phone = phone;
      googleUser.location = location;
      googleUser.address = address;
      await googleUser.save();

      const token = jwt.sign(
        { id: googleUser._id, name: googleUser.name, Phone: googleUser.Phone },
        JWT_KEY,
        { expiresIn: "7d" }
      );

      return res.status(200).json({ message: "Profile updated", token, customerId: googleUser._id });
    }
  } catch (err) {
    console.error("Merge Error:", err);
    res.status(500).json({ message: "Database error during merge", error: err.message });
  }
});


//google-auth
// New route for Google Login
app.post("/api/user/google-signin", async (req, res) => {
  const { name, email, location, googleId } = req.body;

  try {
    // 1. Check for existing user by Google ID or Email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // 2. Create new user. 
      // IMPORTANT: We do not include 'Phone: null' so the sparse index stays clean.
      user = new User({ 
        name, 
        email, 
        location, 
        googleId, 
        authMethod: 'google' 
      });
      await user.save();
      console.log("New Google user registered:", email);
    } else {
      // 3. Update existing user with Google ID if they previously used Phone
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
      console.log("Existing user logged in:", email);
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email }, 
      JWT_KEY, 
      { expiresIn: "1h" }
    );

    res.status(200).json({ token, customerId: user._id });
  } catch (err) {
    // Check your VS Code Terminal for this output!
    console.error("!!! GOOGLE AUTH ERROR !!!", err.message);
    
    if (err.code === 11000) {
      return res.status(400).json({ message: "Account with this detail already exists." });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
});



// ------------------ Auth Routes ------------------

// Signup
// app.post("/api/user/signin", async (req, res) => {
//   const { Name, Phone, location, Password } = req.body;

//   try {
//     const existingUser = await User.findOne({ Phone });
//     if (existingUser) return res.status(409).send("false");

//     const hashedPassword = await bcrypt.hash(Password, 10);
//     const user = new User({ name: Name, Phone, location, Password: hashedPassword });
//     await user.save();

//     res.status(200).send("User saved");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("DB error");
//   }
// });
// Updated Signup with Auto-Login
app.post("/api/user/signin", async (req, res) => {
  const { Name, Phone, location, Password } = req.body;
  try {
    const existingUser = await User.findOne({ Phone });
    if (existingUser) return res.status(409).json({ message: "User exists" });

    const hashedPassword = await bcrypt.hash(Password, 10);
    const user = new User({ name: Name, Phone, location, Password: hashedPassword });
    await user.save();

    // Generate the token immediately
    const token = jwt.sign(
      { id: user._id, name: user.name, Phone: user.Phone }, 
      JWT_KEY, 
      { expiresIn: "1h" }
    );

    // Return the SAME data as your login route
    res.status(200).json({ token, customerId: user._id });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/api/user/login", async (req, res) => {
  const { Phone, Password } = req.body;

  try {
    const user = await User.findOne({ Phone });
    if (!user) return res.status(401).json({ message: "User not found" });

    const match = await bcrypt.compare(Password, user.Password);
    if (!match) return res.status(403).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, name: user.name, Phone: user.Phone }, JWT_KEY, { expiresIn: "1h" });
    res.json({ token, customerId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify token
// Change this in your server.js
app.get("/verify", verifyToken, async (req, res) => {
  try {
    // Fetch fresh data from DB using the ID from the token
    const user = await User.findById(req.user.id).select("-Password"); 
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ------------------ Contact Us Routes ------------------

// Send message
app.post("/api/user/contact", verifyToken, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: "Message is required" });

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const newMsg = new ContactMessage({
      userId: user._id,
      name: user.name,
      Phone: user.Phone,
      message,
    });

    await newMsg.save();
    res.status(201).json({ message: "Message saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all messages of logged-in user
app.get("/api/user/contact", verifyToken, async (req, res) => {
  try {
    const messages = await ContactMessage.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------ Forgot Password ------------------
app.post("/api/user/forgot-password/reset-password", async (req, res) => {
  const { phone, newPassword } = req.body;
  try {
    const user = await User.findOne({ Phone: phone });
    if (!user) return res.status(404).json({ error: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.Password = hashed;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// Keep-Alive Endpoint
app.get('/ping', (req, res) => {
  res.status(200).send('Pong');
});
// ------------------ Check Phone ------------------
app.post("/api/user/check-phone", async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await User.findOne({ Phone: phone });
    res.json({ exists: !!user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: "Server error" });
  }
});

// Start server
const PORT = process.env.PORTCUSTOMER;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${PORT}`));
