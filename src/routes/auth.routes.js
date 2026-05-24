const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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

function normalizeStudentEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeRegistrationNo(registrationNo) {
  return String(registrationNo || "")
    .trim()
    .toUpperCase();
}

async function findRegistryStudent(registrationNo, email) {
  const result = await db.query(
    `SELECT registration_no, email
     FROM student_registry
     WHERE registration_no = $1
       AND LOWER(email) = LOWER($2)
     LIMIT 1`,
    [normalizeRegistrationNo(registrationNo), normalizeStudentEmail(email)],
  );

  return result.rows[0] || null;
}

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
    } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "name, email and password are required",
      });
    }

    const normalizedEmail = normalizeStudentEmail(email);
    let normalizedRegistrationNo = null;

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

      normalizedRegistrationNo = normalizeRegistrationNo(studentId);

      if (!getExpectedUomIndexLetter(normalizedRegistrationNo)) {
        return res.status(400).json({
          status: "error",
          message: "Invalid Registration No.",
        });
      }

      const registryStudent = await findRegistryStudent(
        normalizedRegistrationNo,
        normalizedEmail,
      );
      if (!registryStudent) {
        return res.status(403).json({
          status: "error",
          message:
            "No matching student record was found for the entered registration number and email.",
        });
      }
    }

    // check existing user
    const existing = await db.query(
      "SELECT id, email FROM unistudents WHERE email = $1",
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
        "SELECT id FROM unistudents WHERE registration_no = $1",
        [normalizedRegistrationNo],
      );
      if (existingRegistration.rows.length > 0) {
        return res.status(409).json({
          status: "error",
          message: "This Registration No is already registered",
        });
      }
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const insertSql =
      role === "student"
        ? `INSERT INTO unistudents (name, email, password_hash, role, registration_no, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, name, email, role, registration_no, created_at`
        : `INSERT INTO unistudents (name, email, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name, email, role, created_at`;

    const values =
      role === "student"
        ? [name, normalizedEmail, hash, role, normalizedRegistrationNo]
        : [name, normalizedEmail, hash, role];

    const result = await db.query(insertSql, values);
    const resultUser = result.rows[0];

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

    if (role === "student") {
      return res.status(201).json({
        status: "ok",
        message: "Registration successful",
        user: resultUser,
      });
    }

    // Issue JWT for the newly created user
    const token = jwt.sign(
      { id: resultUser.id, role: resultUser.role || role },
      process.env.JWT_SECRET || "dev_jwt_secret",
      { expiresIn: "7d" },
    );

    return res.status(201).json({
      status: "ok",
      message: "Registration successful",
      user: resultUser,
      token,
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
      `SELECT id, name, email, password_hash, role, registration_no FROM unistudents 
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

    // Return user without password hash and issue JWT
    const { password_hash, ...userWithoutPassword } = user;
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "dev_jwt_secret",
      { expiresIn: "7d" },
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
});

module.exports = router;
