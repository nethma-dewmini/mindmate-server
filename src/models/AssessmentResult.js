const db = require('../db');

class AssessmentResult {
  static async countByUserId(userId) {
    const res = await db.query(
      "SELECT COUNT(*) AS count FROM assessment_results WHERE user_id = $1",
      [userId]
    );
    return res.rowCount > 0 ? Number(res.rows[0].count) : 0;
  }
}

module.exports = AssessmentResult;
