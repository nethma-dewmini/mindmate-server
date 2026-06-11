const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

// POST /api/auth/register
// Handles both student and expert registration
router.post("/register", authController.register);

// POST /api/auth/login
// Authenticate user with email and password
router.post("/login", authController.login);

// POST /api/auth/forgot-password
// Send password reset link
router.post("/forgot-password", authController.forgotPassword);

// POST /api/auth/reset-password
// Reset password using token
router.post("/reset-password", authController.resetPassword);
// POST /api/auth/verify-email
// Verify email using token
router.post("/verify-email", authController.verifyEmail);

// POST /api/auth/resend-verification
// Resend email verification link
router.post("/resend-verification", authController.resendVerification);

module.exports = router;
