const db = require('../db');

class PasswordReset {
  static async create(userId, token, expiresAt) {
    const result = await db.query(
      `INSERT INTO password_resets (user_id, token, expires_at, used, created_at)
       VALUES ($1, $2, $3, false, NOW())
       RETURNING *`,
      [userId, token, expiresAt]
    );
    return result.rows[0];
  }

  static async findByToken(token) {
    const result = await db.query(
      `SELECT id, user_id, expires_at, used FROM password_resets WHERE token = $1 LIMIT 1`,
      [token]
    );
    return result.rows[0] || null;
  }

  static async markAsUsed(id) {
    const result = await db.query(
      `UPDATE password_resets SET used = true WHERE id = $1`,
      [id]
    );
    return result.rowCount > 0;
  }
}

module.exports = PasswordReset;
