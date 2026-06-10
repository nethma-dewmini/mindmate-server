const db = require('../db');

class GroupSessionBooking {
  static async countByStudentId(studentId) {
    const res = await db.query(
      "SELECT COUNT(*) AS count FROM group_session_bookings WHERE student_id = $1",
      [studentId]
    );
    return res.rowCount > 0 ? Number(res.rows[0].count) : 0;
  }
}

module.exports = GroupSessionBooking;
