const db = require('../db');

class Expert {
  static async create({ userId, title, specialization, qualifications, licenseNumber }) {
    const result = await db.query(
      `INSERT INTO experts (user_id, title, specialization, qualifications, license_number, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [userId, title, specialization, qualifications, licenseNumber]
    );
    return result.rows[0];
  }

  static async getAll(verifiedOnly = false) {
    const sql = `
      SELECT
        e.id, e.user_id, e.specialization, e.qualifications, e.license_number,
        e.price_per_session_cents, e.rating_avg, e.verified_at, e.created_at, e.updated_at,
        u.name, u.email, u.phone, u.bio, u.is_verified
      FROM experts e
      LEFT JOIN unistudents u ON u.id = e.user_id
      ${verifiedOnly ? "WHERE e.verified_at IS NOT NULL" : ""}
      ORDER BY e.created_at DESC
    `;
    const result = await db.query(sql);
    return { count: result.rowCount, experts: result.rows };
  }

  static async findById(id) {
    const result = await db.query(
      `SELECT
        e.id, e.user_id, e.specialization, e.qualifications, e.license_number,
        e.price_per_session_cents, e.rating_avg, e.verified_at, e.created_at, e.updated_at,
        u.name, u.email, u.phone, u.bio, u.is_verified
      FROM experts e
      LEFT JOIN unistudents u ON u.id = e.user_id
      WHERE e.id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Expert;
