const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db");

// POST /api/auth/register
// Handles both student and expert registration
router.post("/register", async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role,
      studentId,
      specialization,
      qualifications,
      licenseNumber,
      experience,
    } = req.body || {};

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "name, email and password are required",
      });
    }

    // Validate role
    if (!role || !["student", "expert"].includes(role)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid role. Must be 'student' or 'expert'",
      });
    }

    // Student-specific validation
    if (role === "student") {
      if (!studentId) {
        return res.status(400).json({
          status: "error",
          message: "Registration No is required for students",
        });
      }

      // Validate UoM email format
      if (!email.toLowerCase().endsWith("@uom.lk")) {
        return res.status(400).json({
          status: "error",
          message: "Must use a valid University of Moratuwa email (@uom.lk)",
        });
      }

      // Validate registration number format (2250***A)
      if (!/^22\d{4}[A-Za-z]$/.test(studentId)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid Registration No format. Should be like 2250***A",
        });
      }

      // Check if registration number already exists
      const existingReg = await db.query(
        "SELECT id FROM users WHERE registration_no = $1",
        [studentId],
      );
      if (existingReg.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          message: "This Registration No is already registered",
        });
      }
    }

    // Check if email already exists
    const existing = await db.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "User with that email already exists",
      });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    // Insert user based on role
    let insertSql, values, resultUser;

    if (role === "student") {
      insertSql = `
        INSERT INTO users (name, email, password_hash, role, registration_no, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, name, email, role, registration_no, created_at
      `;
      values = [name, email.toLowerCase(), hash, role, studentId];
    } else {
      insertSql = `
        INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id, name, email, role, created_at
      `;
      values = [name, email.toLowerCase(), hash, role];
    }

    const result = await db.query(insertSql, values);
    resultUser = result.rows[0];

    // If expert, create expert profile
    if (
      role === "expert" &&
      (specialization || qualifications || licenseNumber)
    ) {
      await db.query(
        `INSERT INTO experts (user_id, specialization, qualifications, license_number, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          resultUser.id,
          specialization || null,
          qualifications || null,
          licenseNumber || null,
        ],
      );
    }

    return res.status(201).json({
      status: "ok",
      message: "Registration successful",
      user: resultUser,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
// Authenticate user with email and password
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }

    // Get user by email
    const result = await db.query(
      `SELECT id, name, email, password_hash, role, registration_no FROM users 
       WHERE email = $1`,
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Return user without password hash
    const { password_hash, ...userWithoutPassword } = user;

    return res.status(200).json({
      status: "ok",
      message: "Login successful",
      user: userWithoutPassword,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
