const express = require("express");
const { query } = require("../db");
const { sendContactSubmissionEmail } = require("../utils/emailService");

const router = express.Router();

// Ensure the table exists automatically on startup
const initTablePromise = query(`
  CREATE TABLE IF NOT EXISTS contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  );
`).catch((err) => {
  console.error("Failed to initialize contact_messages table:", err);
});

router.post("/", async (req, res, next) => {
  try {
    await initTablePromise;
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required." });
    }

    const sql = `
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `;

    const result = await query(sql, [name, email, subject || null, message]);

    // Send email notification to admin (asynchronous/non-blocking)
    sendContactSubmissionEmail({ name, email, subject, message }).catch((err) => {
      console.error("Failed to send contact submission email notification:", err);
    });

    res.status(201).json({
      status: "success",
      message: "Thank you! Your message has been sent to our administrator.",
      contactId: result.rows[0].id,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
