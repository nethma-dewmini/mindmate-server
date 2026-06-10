const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../utils/emailService");

// Import Models
const User = require("../models/User");
const Expert = require("../models/Expert");
const StudentRegistry = require("../models/StudentRegistry");
const ExpertApplication = require("../models/ExpertApplication");
const PasswordReset = require("../models/PasswordReset");

// --- Utility Functions ---
async function sendResetEmail(email, link) {
  return await sendPasswordResetEmail(email, link);
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const UOM_INDEX_LETTER_MAP = {
  0: "H", 1: "J", 2: "K", 3: "L", 4: "M", 5: "N", 6: "P", 7: "R", 8: "T",
  9: "U", 10: "V", 11: "X", 12: "A", 13: "B", 14: "C", 15: "D", 16: "E",
  17: "F", 18: "G",
};

function getExpectedUomIndexLetter(indexNumber) {
  const normalized = String(indexNumber || "").trim();
  if (!/^\d{6}[A-Z]$/.test(normalized)) return null;

  const digits = normalized.slice(0, 6).split("").map(Number);
  const providedLetter = normalized.slice(6).toUpperCase();
  const weights = [8, 7, 6, 5, 4, 3];

  const sum = digits.reduce((total, digit, index) => total + digit * weights[index], 0);
  const expectedLetter = UOM_INDEX_LETTER_MAP[sum % 19];
  if (!expectedLetter) return null;

  return providedLetter === expectedLetter ? expectedLetter : null;
}

function normalizeStudentEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRegistrationNo(registrationNo) {
  return String(registrationNo || "").trim().toUpperCase();
}
// -----------------------

exports.register = async (req, res, next) => {
  try {
    const {
      name, title, email, password, role, studentId, specialization, qualifications, licenseNumber,
    } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ status: "error", message: "name, email and password are required" });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long, containing at least one uppercase letter, one lowercase letter, and one number.",
      });
    }

    const normalizedEmail = normalizeStudentEmail(email);
    let normalizedRegistrationNo = null;

    if (!role || !["student", "expert", "admin"].includes(role)) {
      return res.status(400).json({ status: "error", message: "Invalid role. Must be 'student', 'expert', or 'admin'" });
    }

    if (role === "student") {
      if (!normalizedEmail.endsWith("@uom.lk")) {
        return res.status(400).json({ status: "error", message: "Must use a valid University of Moratuwa email (@uom.lk)" });
      }
      if (!studentId) {
        return res.status(400).json({ status: "error", message: "Registration No is required for students" });
      }
      if (!/^\d{6}[A-Z]$/.test(String(studentId).trim())) {
        return res.status(400).json({ status: "error", message: "Invalid Registration No. The last letter must be a capital letter." });
      }
      normalizedRegistrationNo = normalizeRegistrationNo(studentId);
      if (!getExpectedUomIndexLetter(normalizedRegistrationNo)) {
        return res.status(400).json({ status: "error", message: "Invalid Registration No." });
      }

      const registryStudent = await StudentRegistry.findByRegNoAndEmail(normalizedRegistrationNo, normalizedEmail);
      if (!registryStudent) {
        return res.status(403).json({
          status: "error",
          message: "No matching student record was found for the entered registration number and email.",
        });
      }
    }

    let approvedExpertApplication = null;
    if (role === "expert") {
      approvedExpertApplication = await ExpertApplication.findLatestApproved(normalizedEmail);
      if (!approvedExpertApplication) {
        return res.status(403).json({
          status: "error",
          message: "Your expert application is not approved yet. Please wait for admin approval before registering.",
        });
      }
    }

    // Check existing user
    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ status: "error", message: "User with that email already exists" });
    }

    if (role === "student") {
      const existingRegistration = await User.findByRegistrationNo(normalizedRegistrationNo);
      if (existingRegistration) {
        return res.status(409).json({ status: "error", message: "This Registration No is already registered" });
      }
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    let resultUser;
    if (role === "student") {
      resultUser = await User.createStudent({ name, email: normalizedEmail, passwordHash: hash, role, registrationNo: normalizedRegistrationNo });
    } else {
      resultUser = await User.createExpertOrAdmin({ name, email: normalizedEmail, passwordHash: hash, role });
    }

    // If expert, create expert profile
    if (role === "expert") {
      await Expert.create({
        userId: resultUser.id,
        title: title || approvedExpertApplication.title || null,
        specialization: specialization || approvedExpertApplication.specialization || null,
        qualifications: qualifications || null,
        licenseNumber: licenseNumber || null,
      });
    }

    if (role === "student") {
      return res.status(201).json({ status: "ok", message: "Registration successful", user: resultUser });
    }

    const token = jwt.sign(
      { id: resultUser.id, role: resultUser.role || role },
      process.env.JWT_SECRET || "dev_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      status: "ok",
      message: role === "expert" ? "Expert registration successful" : "Registration successful",
      user: resultUser,
      token,
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Email and password are required" });
    }

    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ status: "error", message: "Invalid email or password" });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ status: "error", message: "Invalid email or password" });
    }

    const { password_hash, ...userWithoutPassword } = user;
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "dev_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      status: "ok",
      message: "Login successful",
      user: userWithoutPassword,
      token,
    });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ status: "error", message: "Email is required" });
    }

    const normalizedEmail = normalizeStudentEmail(email);
    const user = await User.findByEmail(normalizedEmail);
    
    if (!user) {
      return res.status(200).json({
        status: "ok",
        message: "If an account exists for this email, a reset link has been sent.",
      });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + parseInt(process.env.PASSWORD_RESET_EXPIRES_MIN || "60") * 60 * 1000);

    await PasswordReset.create(user.id, token, expiresAt);

    const clientOrigin = process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${clientOrigin.replace(/\/$/, "")}/reset-password?token=${token}`;

    const sent = await sendResetEmail(user.email, resetLink);

    if (!sent && process.env.ALLOW_EMAIL_VERIFICATION_BYPASS === "true") {
      return res.status(200).json({
        status: "ok",
        message: "Reset token generated (dev)",
        token,
        resetLink,
      });
    }

    return res.status(200).json({
      status: "ok",
      message: "If an account exists for this email, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ status: "error", message: "Token and new password are required" });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long, containing at least one uppercase letter, one lowercase letter, and one number.",
      });
    }

    const reset = await PasswordReset.findByToken(token);
    
    if (!reset) {
      return res.status(400).json({ status: "error", message: "Invalid or expired token" });
    }

    if (reset.used) {
      return res.status(400).json({ status: "error", message: "This reset token has already been used" });
    }

    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ status: "error", message: "Reset token expired" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    await User.updatePassword(reset.user_id, hash);
    await PasswordReset.markAsUsed(reset.id);

    return res.status(200).json({ status: "ok", message: "Password has been reset" });
  } catch (err) {
    next(err);
  }
};
