const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/unistudents/profile/me
// Get profile details & dynamic stats for the current logged-in user
router.get("/profile/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch user details
    const userRes = await db.query(
      `SELECT id, name, email, role, registration_no, bio, phone, created_at 
       FROM unistudents 
       WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const user = userRes.rows[0];

    // Calculate dynamic stats
    // 1. Days Active
    const daysActiveRes = await db.query(
      `SELECT GREATEST(CURRENT_DATE - created_at::date, 1) AS days_active 
       FROM unistudents WHERE id = $1`,
      [userId]
    );
    const daysActive = daysActiveRes.rowCount > 0 ? daysActiveRes.rows[0].days_active : 1;

    // 2. Assessments count
    const assessmentsRes = await db.query(
      "SELECT COUNT(*) AS count FROM assessment_results WHERE user_id = $1",
      [userId]
    );
    const assessmentsCount = assessmentsRes.rowCount > 0 ? Number(assessmentsRes.rows[0].count) : 0;

    // 3. Booked sessions count
    const bookingsRes = await db.query(
      "SELECT COUNT(*) AS count FROM group_session_bookings WHERE student_id = $1",
      [userId]
    );
    const bookingsCount = bookingsRes.rowCount > 0 ? Number(bookingsRes.rows[0].count) : 0;

    // 4. Mood logs count
    const moodLogsRes = await db.query(
      "SELECT COUNT(DISTINCT created_at::date) AS count FROM mood_entries WHERE user_id = $1",
      [userId]
    );
    const moodLogsCount = moodLogsRes.rowCount > 0 ? Number(moodLogsRes.rows[0].count) : 0;

    // 5. Mood Streak (timezone resilient logic)
    let moodStreak = 0;
    try {
      const datesRes = await db.query(
        `SELECT DISTINCT created_at::date AS logged_date 
         FROM mood_entries 
         WHERE user_id = $1 
         ORDER BY logged_date DESC`,
        [userId]
      );
      if (datesRes.rowCount > 0) {
        const loggedDates = datesRes.rows.map(r => new Date(r.logged_date));
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const latestDate = new Date(loggedDates[0]);
        latestDate.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(today - latestDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
          moodStreak = 1;
          for (let i = 0; i < loggedDates.length - 1; i++) {
            const current = new Date(loggedDates[i]);
            current.setHours(0, 0, 0, 0);
            const prev = new Date(loggedDates[i + 1]);
            prev.setHours(0, 0, 0, 0);

            const dayDiff = Math.ceil(Math.abs(current - prev) / (1000 * 60 * 60 * 24));
            if (dayDiff === 1) {
              moodStreak++;
            } else if (dayDiff > 1) {
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to calculate streak in profile endpoint:", e);
    }

    return res.status(200).json({
      status: "ok",
      user,
      stats: {
        daysActive,
        assessmentsCount,
        bookingsCount,
        moodLogsCount,
        moodStreak,
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/unistudents/profile/me
// Update details for the current user
router.put("/profile/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, bio, phone } = req.body || {};

    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Name is a required field",
      });
    }

    const result = await db.query(
      `UPDATE unistudents 
       SET name = $1, bio = $2, phone = $3, updated_at = NOW() 
       WHERE id = $4 
       RETURNING id, name, email, role, registration_no, bio, phone, created_at`,
      [name.trim(), bio ? bio.trim() : null, phone ? phone.trim() : null, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: "ok",
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/unistudents?limit=&offset=&q=
// Returns users with role = 'student'
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const q = (req.query.q || "").trim();

    let sql = `SELECT id, name, email, role, registration_no, is_verified, created_at FROM unistudents WHERE role = 'student'`;
    const params = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }
    params.push(limit);
    params.push(offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(sql, params);
    res.json({ count: result.rowCount, students: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/unistudents/:id
router.get("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT id, name, email, role, registration_no, bio, phone, is_verified, created_at FROM unistudents WHERE id = $1 LIMIT 1",
      [id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Student not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
