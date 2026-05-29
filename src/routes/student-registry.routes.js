const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeRegistrationNo(registrationNo) {
  return String(registrationNo || "")
    .trim()
    .toUpperCase();
}

// GET /api/student-registry?limit=&offset=&q=
// Admin can view the registry used for student registration
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const q = String(req.query.q || "").trim();

    let sql = `
      SELECT id, registration_no, email, created_at, updated_at
      FROM student_registry
    `;
    const params = [];

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` WHERE (LOWER(registration_no) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }

    params.push(limit);
    params.push(offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(sql, params);

    return res.json({
      status: "ok",
      count: result.rowCount,
      registry: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/student-registry
// Admin adds a student entry before the student can self-register
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { registration_no, name, email } = req.body || {};

    if (!registration_no || !email) {
      return res.status(400).json({
        status: "error",
        message: "registration_no and email are required",
      });
    }

    if (!/^\d{6}[A-Z]$/.test(String(registration_no).trim())) {
      return res.status(400).json({
        status: "error",
        message: "Invalid Registration No. The last letter must be a capital letter.",
      });
    }

    const normalizedRegistrationNo = normalizeRegistrationNo(registration_no);
    const normalizedEmail = normalizeEmail(email);

    const existing = await db.query(
      `SELECT id
       FROM student_registry
       WHERE registration_no = $1 OR LOWER(email) = LOWER($2)
       LIMIT 1`,
      [normalizedRegistrationNo, normalizedEmail],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message:
          "A registry entry already exists for that registration number or email",
      });
    }

    const result = await db.query(
      `INSERT INTO student_registry (registration_no, email, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, registration_no, email, created_at, updated_at`,
      [normalizedRegistrationNo, normalizedEmail],
    );

    return res.status(201).json({
      status: "ok",
      message: "Student registry entry created successfully",
      registry: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
