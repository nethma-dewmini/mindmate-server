const GroupSession = require("../models/GroupSession");
const User = require("../models/User");
const { sendSessionBookingEmail, broadcastNewSessionEmail, sendSessionCancelationEmail } = require("../utils/emailService");

function getUserIdFromReq(req) {
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const jwt = require("jsonwebtoken");
      const token = authHeader.slice(7).trim();
      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
      return payload.id;
    }
  } catch (err) {}
  return null;
}

exports.getMySessions = async (req, res, next) => {
  try {
    const data = await GroupSession.getAllByExpert(req.user.id);
    return res.status(200).json({
      status: "ok",
      count: data.count,
      sessions: data.sessions,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllSessions = async (req, res, next) => {
  try {
    const userId = getUserIdFromReq(req);
    const data = await GroupSession.getAllPublic(userId);
    return res.status(200).json({
      status: "ok",
      count: data.count,
      sessions: data.sessions,
    });
  } catch (error) {
    next(error);
  }
};

exports.createSession = async (req, res, next) => {
  try {
    const { session_date, session_time, topic, content, meeting_link, meeting_details } = req.body || {};

    if (!session_date || !session_time || !topic) {
      return res.status(400).json({
        status: "error",
        message: "Session date, time, and topic are required fields",
      });
    }

    const session = await GroupSession.create({
      expertId: req.user.id,
      sessionDate: session_date,
      sessionTime: session_time.trim(),
      topic: topic.trim(),
      content: content ? content.trim() : null,
      meetingLink: meeting_link ? meeting_link.trim() : null,
      meetingDetails: meeting_details ? meeting_details.trim() : null
    });

    (async () => {
      try {
        const expert = await User.findByIdWithDetails(req.user.id);
        const { students } = await User.getAllStudents(10000, 0, ""); // Fetch all

        if (expert && students.length > 0) {
          const expertName = expert.name;
          await broadcastNewSessionEmail({ session, expertName, students });
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
};

exports.updateSessionDetails = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { meeting_link, meeting_details } = req.body || {};

    const session = await GroupSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        status: "error",
        message: "Session not found",
      });
    }

    const isOwner = String(session.expert_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own sessions",
      });
    }

    const updatedSession = await GroupSession.updateDetails(
      sessionId,
      meeting_link !== undefined ? (meeting_link ? meeting_link.trim() : null) : null,
      meeting_details !== undefined ? (meeting_details ? meeting_details.trim() : null) : null
    );

    return res.status(200).json({
      status: "ok",
      message: "Session meeting details updated successfully",
      session: updatedSession,
    });
  } catch (error) {
    next(error);
  }
};

exports.bookSession = async (req, res, next) => {
  try {
    const sessionId = req.params.id;

    if (req.user.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Only students are allowed to book sessions",
      });
    }

    const sessionExists = await GroupSession.findById(sessionId);
    if (!sessionExists) {
      return res.status(404).json({
        status: "error",
        message: "Session not found",
      });
    }

    const success = await GroupSession.book(sessionId, req.user.id);

    if (success) {
      try {
        const student = await User.findByIdWithDetails(req.user.id);
        const sessionInfo = await GroupSession.getSessionInfoWithExpert(sessionId);

        if (student && sessionInfo) {
          sendSessionBookingEmail({
            studentEmail: student.email,
            studentName: student.name,
            expertName: sessionInfo.expert_name,
            topic: sessionInfo.topic,
            sessionDate: sessionInfo.session_date,
            sessionTime: sessionInfo.session_time,
            meetingLink: sessionInfo.meeting_link,
            meetingDetails: sessionInfo.meeting_details,
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
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { reason } = req.body || {};

    if (req.user.role !== "student") {
      return res.status(403).json({
        status: "error",
        message: "Only students are allowed to cancel bookings",
      });
    }

    const bookingDetails = await GroupSession.getBookingDetailsForCancel(sessionId, req.user.id);

    if (!bookingDetails) {
      return res.status(404).json({
        status: "error",
        message: "Booking not found",
      });
    }

    await GroupSession.cancelBooking(sessionId, req.user.id);

    sendSessionCancelationEmail({
      expertEmail: bookingDetails.expert_email,
      expertName: bookingDetails.expert_name,
      studentName: bookingDetails.student_name,
      studentEmail: bookingDetails.student_email,
      topic: bookingDetails.topic,
      sessionDate: bookingDetails.session_date,
      sessionTime: bookingDetails.session_time,
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
};

exports.deleteSession = async (req, res, next) => {
  try {
    const sessionId = req.params.id;

    const session = await GroupSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        status: "error",
        message: "Session not found",
      });
    }

    const isOwner = String(session.expert_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own sessions",
      });
    }

    await GroupSession.delete(sessionId);

    return res.status(200).json({
      status: "ok",
      message: "Session deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
