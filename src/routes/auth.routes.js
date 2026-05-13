const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../db");

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ status: "error", message: "name, email and password are required" });
    }

    // check existing user
    const existing = await db.query("SELECT id, email FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ status: "error", message: "User with that email already exists" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const insertSql = `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name, email, role, created_at`;
    const values = [name, email.toLowerCase(), hash, role || 'student'];

    const result = await db.query(insertSql, values);
    const user = result.rows[0];

    return res.status(201).json({ status: "ok", user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
