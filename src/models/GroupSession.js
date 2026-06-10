const db = require('../db');

class GroupSession {
  static async getAllByExpert(expertId) {
    const result = await db.query(
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
      [expertId]
    );
    return { count: result.rowCount, sessions: result.rows };
  }

  static async getAllPublic(userId) {
    const result = await db.query(
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
    return { count: result.rowCount, sessions: result.rows };
  }

  static async findById(id) {
    const result = await db.query("SELECT * FROM group_sessions WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  static async create(data) {
    const { expertId, sessionDate, sessionTime, topic, content, meetingLink, meetingDetails } = data;
    const result = await db.query(
      `INSERT INTO group_sessions (expert_id, session_date, session_time, topic, content, meeting_link, meeting_details, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [expertId, sessionDate, sessionTime, topic, content, meetingLink, meetingDetails]
    );
    return result.rows[0];
  }

  static async updateDetails(id, meetingLink, meetingDetails) {
    const result = await db.query(
      `UPDATE group_sessions
       SET meeting_link = $1, meeting_details = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [meetingLink, meetingDetails, id]
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await db.query("DELETE FROM group_sessions WHERE id = $1", [id]);
  }

  static async book(id, studentId) {
    const result = await db.query(
      `INSERT INTO group_session_bookings (session_id, student_id, booked_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id, student_id) DO NOTHING
       RETURNING *`,
      [id, studentId]
    );
    return result.rowCount > 0;
  }

  static async cancelBooking(id, studentId) {
    const result = await db.query(
      `DELETE FROM group_session_bookings
       WHERE session_id = $1 AND student_id = $2`,
      [id, studentId]
    );
    return result.rowCount > 0;
  }

  static async getBookingDetailsForCancel(id, studentId) {
    const result = await db.query(
      `SELECT 
        s.topic, s.session_date, s.session_time,
        e.name AS expert_name, e.email AS expert_email,
        stud.name AS student_name, stud.email AS student_email
       FROM group_session_bookings b
       JOIN group_sessions s ON s.id = b.session_id
       JOIN unistudents e ON e.id = s.expert_id
       JOIN unistudents stud ON stud.id = b.student_id
       WHERE b.session_id = $1 AND b.student_id = $2`,
      [id, studentId]
    );
    return result.rows[0] || null;
  }

  static async getSessionInfoWithExpert(id) {
    const result = await db.query(
      `SELECT s.topic, s.content, s.session_date, s.session_time, s.meeting_link, s.meeting_details,
              u.name AS expert_name, u.email AS expert_email
       FROM group_sessions s
       LEFT JOIN unistudents u ON u.id = s.expert_id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = GroupSession;
