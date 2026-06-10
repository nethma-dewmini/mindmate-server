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

module.exports = router;
