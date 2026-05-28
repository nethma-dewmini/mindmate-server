const express = require("express");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Middleware to ensure the authenticated user is an expert or admin
function ensureExpert(req, res, next) {
  if (req.user?.role !== "expert" && req.user?.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Expert access required",
    });
  }
  return next();
}

/**
 * GET /api/sessions/me
 * Retrieve all group sessions hosted by the authenticated expert.
 */
router.get("/me", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, session_date, session_time, topic, content, created_at, updated_at
       FROM group_sessions
       WHERE expert_id = $1
       ORDER BY session_date DESC, session_time DESC`,
      [req.user.id],
    );

    return res.status(200).json({
      status: "ok",
      count: result.rowCount,
      sessions: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sessions
 * Public/general endpoint to retrieve all group sessions.
 */
router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.id, s.session_date, s.session_time, s.topic, s.content, s.created_at, s.updated_at,
              u.name AS expert_name, u.email AS expert_email
       FROM group_sessions s
       LEFT JOIN unistudents u ON u.id = s.expert_id
       ORDER BY s.session_date ASC, s.session_time ASC`
    );

    return res.status(200).json({
      status: "ok",
      count: result.rowCount,
      sessions: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sessions
 * Create a new group session.
 */
router.post("/", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const { session_date, session_time, topic, content } = req.body || {};

    if (!session_date || !session_time || !topic) {
      return res.status(400).json({
        status: "error",
        message: "Session date, time, and topic are required fields",
      });
    }

    const result = await query(
      `INSERT INTO group_sessions (expert_id, session_date, session_time, topic, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, expert_id, session_date, session_time, topic, content, created_at, updated_at`,
      [req.user.id, session_date, session_time.trim(), topic.trim(), content ? content.trim() : null]
    );

    return res.status(201).json({
      status: "ok",
      message: "Session created successfully",
      session: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete a group session by ID.
 */
router.delete("/:id", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const sessionId = req.params.id;

    // Check if session exists and user is owner or admin
    const checkRes = await query(
      "SELECT expert_id FROM group_sessions WHERE id = $1",
      [sessionId]
    );

    if (checkRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Session not found",
      });
    }

    const session = checkRes.rows[0];
    const isOwner = String(session.expert_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own sessions",
      });
    }

    await query("DELETE FROM group_sessions WHERE id = $1", [sessionId]);

    return res.status(200).json({
      status: "ok",
      message: "Session deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
