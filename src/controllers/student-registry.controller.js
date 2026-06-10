const StudentRegistry = require("../models/StudentRegistry");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRegistrationNo(registrationNo) {
  return String(registrationNo || "").trim().toUpperCase();
}

exports.getRegistry = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const q = String(req.query.q || "").trim();

    const data = await StudentRegistry.getAll(limit, offset, q);

    return res.json({
      status: "ok",
      count: data.count,
      registry: data.registry,
    });
  } catch (err) {
    next(err);
  }
};

exports.createRegistryEntry = async (req, res, next) => {
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

    const existing = await StudentRegistry.findByRegNoAndEmail(normalizedRegistrationNo, normalizedEmail);

    // To properly prevent duplicate registration_no OR email separately, we should really check them individually or use a different query, 
    // but preserving original logic where it checks if the exact combo exists or if we should check OR.
    // The original route had: WHERE registration_no = $1 OR LOWER(email) = LOWER($2)
    // Wait, let's fix that. I should just use the exact query the original had to avoid breaking behavior.
    const db = require("../db");
    const existingCheck = await db.query(
      `SELECT id FROM student_registry WHERE registration_no = $1 OR LOWER(email) = LOWER($2) LIMIT 1`,
      [normalizedRegistrationNo, normalizedEmail]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "A registry entry already exists for that registration number or email",
      });
    }

    const registryEntry = await StudentRegistry.create(normalizedRegistrationNo, normalizedEmail);

    return res.status(201).json({
      status: "ok",
      message: "Student registry entry created successfully",
      registry: registryEntry,
    });
  } catch (err) {
    next(err);
  }
};
