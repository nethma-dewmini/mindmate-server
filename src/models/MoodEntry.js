const db = require('../db');

class MoodEntry {
  static async countDistinctDays(userId) {
    const res = await db.query(
      "SELECT COUNT(DISTINCT created_at::date) AS count FROM mood_entries WHERE user_id = $1",
      [userId]
    );
    return res.rowCount > 0 ? Number(res.rows[0].count) : 0;
  }

  static async getLoggedDates(userId) {
    const res = await db.query(
      `SELECT DISTINCT created_at::date AS logged_date 
       FROM mood_entries 
       WHERE user_id = $1 
       ORDER BY logged_date DESC`,
      [userId]
    );
    return res.rows.map(r => new Date(r.logged_date));
  }

  static async getTodayAverage(userId) {
    const res = await db.query(
      "SELECT AVG(mood)::numeric(10,1) AS avg_mood FROM mood_entries WHERE user_id = $1 AND created_at::date = CURRENT_DATE",
      [userId]
    );
    return res.rows[0].avg_mood ? parseFloat(res.rows[0].avg_mood) : 0;
  }

  static async getYesterdayAverage(userId) {
    const res = await db.query(
      "SELECT AVG(mood)::numeric(10,1) AS avg_mood_yesterday FROM mood_entries WHERE user_id = $1 AND created_at::date = CURRENT_DATE - 1",
      [userId]
    );
    return res.rows[0].avg_mood_yesterday ? parseFloat(res.rows[0].avg_mood_yesterday) : 0;
  }

  static async getAll(userId, limit = 50, offset = 0) {
    const result = await db.query(
      "SELECT * FROM mood_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async findById(id, userId) {
    const result = await db.query(
      "SELECT * FROM mood_entries WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async create(userId, mood, note) {
    const result = await db.query(
      "INSERT INTO mood_entries (user_id, mood, note) VALUES ($1, $2, $3) RETURNING *",
      [userId, mood, note]
    );
    return result.rows[0];
  }

  static async update(id, userId, mood, note) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (mood !== undefined && mood !== null) {
      fields.push(`mood = $${idx++}`);
      values.push(mood);
    }
    if (note !== undefined) {
      fields.push(`note = $${idx++}`);
      values.push(note);
    }

    if (fields.length === 0) return null;

    const q = `UPDATE mood_entries SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
    values.push(id, userId);

    const result = await db.query(q, values);
    return result.rows[0] || null;
  }

  static async delete(id, userId) {
    const result = await db.query("DELETE FROM mood_entries WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]);
    return result.rowCount > 0;
  }
}

module.exports = MoodEntry;
