const express = require("express");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { sendSessionBookingEmail, broadcastNewSessionEmail, sendSessionCancelationEmail } = require("../utils/emailService");

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

// Helper to decode token and retrieve student user ID if present
function getUserIdFromReq(req) {
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
      return payload.id;
    }
  } catch (err) {}
  return null;
}

/**
 * GET /api/sessions/me
 * Retrieve all group sessions hosted by the authenticated expert,
 * including a list of booked students for each session.
 */
router.get("/me", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.id, s.session_date, s.session_time, s.topic, s.content, s.meeting_link, s.meeting_details, s.created_at, s.updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
                 FROM group_session_bookings b
                 JOIN unistudents u ON u.id = b.student_id
                 WHERE b.session_id = s.id),
                '[]'::json
              ) AS attendees
       FROM group_sessions s
       WHERE s.expert_id = $1
       ORDER BY s.session_date DESC, s.session_time DESC`,
      [req.user.id]
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
 * Returns is_booked flag if request is made by an authenticated student.
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = getUserIdFromReq(req);

    const result = await query(
      `SELECT s.id, s.session_date, s.session_time, s.topic, s.content, s.meeting_link, s.meeting_details, s.created_at, s.updated_at,
              u.name AS expert_name, u.email AS expert_email,
              EXISTS(
                SELECT 1 FROM group_session_bookings b
                WHERE b.session_id = s.id AND b.student_id = $1
              ) AS is_booked
       FROM group_sessions s
       LEFT JOIN unistudents u ON u.id = s.expert_id
       ORDER BY s.session_date ASC, s.session_time ASC`,
      [userId]
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
    const { session_date, session_time, topic, content, meeting_link, meeting_details } = req.body || {};

    if (!session_date || !session_time || !topic) {
      return res.status(400).json({
        status: "error",
        message: "Session date, time, and topic are required fields",
      });
    }

    const result = await query(
      `INSERT INTO group_sessions (expert_id, session_date, session_time, topic, content, meeting_link, meeting_details, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, expert_id, session_date, session_time, topic, content, meeting_link, meeting_details, created_at, updated_at`,
      [
        req.user.id,
        session_date,
        session_time.trim(),
        topic.trim(),
        content ? content.trim() : null,
        meeting_link ? meeting_link.trim() : null,
        meeting_details ? meeting_details.trim() : null,
      ]
    );

    const session = result.rows[0];

    // Asynchronously broadcast emails to all students (non-blocking)
    (async () => {
      try {
        // Query expert details to get the name
        const expertRes = await query("SELECT name FROM unistudents WHERE id = $1", [req.user.id]);
        // Query all registered students
        const studentsRes = await query("SELECT name, email FROM unistudents WHERE role = 'student'");

        if (expertRes.rowCount > 0 && studentsRes.rowCount > 0) {
          const expertName = expertRes.rows[0].name;
          const students = studentsRes.rows;

          await broadcastNewSessionEmail({
            session,
            expertName,
            students,
          });
        }
      } catch (err) {
        console.error("❌ Failed to initiate session scheduling email broadcast:", err);
      }
    })();

    return res.status(201).json({
      status: "ok",
      message: "Session created successfully",
      session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/sessions/:id
 * Update session meeting details (link and joining details).
 */
router.patch("/:id", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { meeting_link, meeting_details } = req.body || {};

    // Check ownership
    const checkRes = await query("SELECT expert_id FROM group_sessions WHERE id = $1", [sessionId]);
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

    const result = await query(
      `UPDATE group_sessions
       SET meeting_link = $1, meeting_details = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, expert_id, session_date, session_time, topic, content, meeting_link, meeting_details, created_at, updated_at`,
      [
        meeting_link !== undefined ? (meeting_link ? meeting_link.trim() : null) : null,
        meeting_details !== undefined ? (meeting_details ? meeting_details.trim() : null) : null,
        sessionId,
      ]
    );

    return res.status(200).json({
      status: "ok",
      message: "Session meeting details updated successfully",
      session: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sessions/:id/book
 * Book a session for the student.
 */
router.post("/:id/book", requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.params.id;

    if (req.user.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Only students are allowed to book sessions",
      });
    }

    // Check if session exists
    const sessionCheck = await query("SELECT id FROM group_sessions WHERE id = $1", [sessionId]);
    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Session not found",
      });
    }

    // Insert booking
    const bookingRes = await query(
      `INSERT INTO group_session_bookings (session_id, student_id, booked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id, student_id) DO NOTHING`,
      [sessionId, req.user.id]
    );

    if (bookingRes.rowCount > 0) {
      try {
        // Fetch student email and name
        const studentRes = await query("SELECT name, email FROM unistudents WHERE id = $1", [req.user.id]);
        // Fetch session and host expert details
        const sessionInfoRes = await query(
          `SELECT s.topic, s.content, s.session_date, s.session_time, s.meeting_link, s.meeting_details,
                  u.name AS expert_name, u.email AS expert_email
           FROM group_sessions s
           LEFT JOIN unistudents u ON u.id = s.expert_id
           WHERE s.id = $1`,
          [sessionId]
        );

        if (studentRes.rowCount > 0 && sessionInfoRes.rowCount > 0) {
          const student = studentRes.rows[0];
          const session = sessionInfoRes.rows[0];

          sendSessionBookingEmail({
            studentEmail: student.email,
            studentName: student.name,
            expertName: session.expert_name,
            topic: session.topic,
            sessionDate: session.session_date,
            sessionTime: session.session_time,
            meetingLink: session.meeting_link,
            meetingDetails: session.meeting_details,
          }).catch((err) => console.error("Error sending session booking confirmation email:", err));
        }
      } catch (err) {
        console.error("Error preparing session booking confirmation email:", err);
      }
    }

    return res.status(200).json({
      status: "ok",
      message: "Session booked successfully",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sessions/:id/cancel
 * Cancel a booking for the student.
 */
router.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { reason } = req.body || {};

    if (req.user.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Only students are allowed to cancel bookings",
      });
    }

    // Retrieve details before deleting the booking
    const bookingDetailsRes = await query(
      `SELECT 
        s.topic, s.session_date, s.session_time,
        e.name AS expert_name, e.email AS expert_email,
        stud.name AS student_name, stud.email AS student_email
       FROM group_session_bookings b
       JOIN group_sessions s ON s.id = b.session_id
       JOIN unistudents e ON e.id = s.expert_id
       JOIN unistudents stud ON stud.id = b.student_id
       WHERE b.session_id = $1 AND b.student_id = $2`,
      [sessionId, req.user.id]
    );

    if (bookingDetailsRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Booking not found",
      });
    }

    const {
      topic,
      session_date,
      session_time,
      expert_name,
      expert_email,
      student_name,
      student_email,
    } = bookingDetailsRes.rows[0];

    // Delete the booking record
    await query(
      `DELETE FROM group_session_bookings
       WHERE session_id = $1 AND student_id = $2`,
      [sessionId, req.user.id]
    );

    // Asynchronously send session cancellation email to the expert
    sendSessionCancelationEmail({
      expertEmail: expert_email,
      expertName: expert_name,
      studentName: student_name,
      studentEmail: student_email,
      topic,
      sessionDate: session_date,
      sessionTime: session_time,
      reason: reason ? reason.trim() : "",
    }).catch((err) => {
      console.error("❌ Failed to send session cancellation email:", err);
    });

    return res.status(200).json({
      status: "ok",
      message: "Booking cancelled successfully",
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
