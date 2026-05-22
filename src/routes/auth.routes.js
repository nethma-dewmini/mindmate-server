const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db");

const UOM_INDEX_LETTER_MAP = {
  0: "H",
  1: "J",
  2: "K",
  3: "L",
  4: "M",
  5: "N",
  6: "P",
  7: "R",
  8: "T",
  9: "U",
  10: "V",
  11: "X",
  12: "A",
  13: "B",
  14: "C",
  15: "D",
  16: "E",
  17: "F",
  18: "G",
};

function getExpectedUomIndexLetter(indexNumber) {
  const normalized = String(indexNumber || "").trim();

  if (!/^\d{6}[A-Za-z]$/.test(normalized)) {
    return null;
  }

  const digits = normalized.slice(0, 6).split("").map(Number);
  const providedLetter = normalized.slice(6).toUpperCase();
  const weights = [8, 7, 6, 5, 4, 3];

  const sum = digits.reduce(
    (total, digit, index) => total + digit * weights[index],
    0,
  );

  const expectedLetter = UOM_INDEX_LETTER_MAP[sum % 19];
  if (!expectedLetter) {
    return null;
  }

  return providedLetter === expectedLetter ? expectedLetter : null;
}

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, role, studentId } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "name, email and password are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase();

    if (!role || !["student", "expert"].includes(role)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid role. Must be 'student' or 'expert'",
      });
    }

    if (role === "student") {
      if (!normalizedEmail.endsWith("@uom.lk")) {
        return res.status(400).json({
          status: "error",
          message: "Must use a valid University of Moratuwa email (@uom.lk)",
        });
      }

      if (!studentId) {
        return res.status(400).json({
          status: "error",
          message: "Registration No is required for students",
        });
      }

      if (!getExpectedUomIndexLetter(studentId)) {
        return res.status(400).json({
          status: "error",
          message:
            "Invalid Registration No. Use a 6-digit UOM index number followed by the correct letter, for example 225015L",
        });
      }
    }

    // check existing user
    const existing = await db.query(
      "SELECT id, email FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "User with that email already exists",
      });
    }

    if (role === "student") {
      const existingRegistration = await db.query(
        "SELECT id FROM users WHERE registration_no = $1",
        [studentId],
      );
      if (existingRegistration.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          message: "This Registration No is already registered",
        });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const insertSql =
      role === "student"
        ? `INSERT INTO users (name, email, password_hash, role, registration_no, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, name, email, role, registration_no, created_at`
        : `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name, email, role, created_at`;

    const values =
      role === "student"
        ? [name, normalizedEmail, hash, role, studentId]
        : [name, normalizedEmail, hash, role];

    const result = await db.query(insertSql, values);
    const user = result.rows[0];

    return res.status(201).json({ status: "ok", user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
