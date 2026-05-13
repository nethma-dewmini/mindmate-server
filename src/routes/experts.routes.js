const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const verifiedOnly = req.query.verified === "true";

    const sql = `
      SELECT
        e.id,
        e.user_id,
        e.specialization,
        e.qualifications,
        e.license_number,
        e.price_per_session_cents,
        e.rating_avg,
        e.verified_at,
        e.created_at,
        e.updated_at,
        u.name,
        u.email,
        u.phone,
        u.bio,
        u.is_verified
      FROM experts e
      LEFT JOIN users u ON u.id = e.user_id
      ${verifiedOnly ? "WHERE e.verified_at IS NOT NULL" : ""}
      ORDER BY e.created_at DESC
    `;

    const result = await query(sql);

    res.status(200).json({
      status: "ok",
      count: result.rowCount,
      experts: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT
          e.id,
          e.user_id,
          e.specialization,
          e.qualifications,
          e.license_number,
          e.price_per_session_cents,
          e.rating_avg,
          e.verified_at,
          e.created_at,
          e.updated_at,
          u.name,
          u.email,
          u.phone,
          u.bio,
          u.is_verified
        FROM experts e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.id = $1
        LIMIT 1
      `,
      [req.params.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Expert not found" });
    }

    res.status(200).json({
      status: "ok",
      expert: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
