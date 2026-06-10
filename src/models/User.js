const db = require('../db');

class User {
  static async findByEmail(email) {
    const result = await db.query(
      `SELECT id, name, email, password_hash, role, registration_no 
       FROM unistudents 
       WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async findByRegistrationNo(registrationNo) {
    const result = await db.query(
      `SELECT id FROM unistudents WHERE registration_no = $1 LIMIT 1`,
      [registrationNo]
    );
    return result.rows[0] || null;
  }

  static async createStudent({ name, email, passwordHash, role, registrationNo }) {
    const result = await db.query(
      `INSERT INTO unistudents (name, email, password_hash, role, registration_no, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, email, role, registration_no, created_at`,
      [name, email, passwordHash, role, registrationNo]
    );
    return result.rows[0];
  }

  static async createExpertOrAdmin({ name, email, passwordHash, role }) {
    const result = await db.query(
      `INSERT INTO unistudents (name, email, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );
    return result.rows[0];
  }

  static async updatePassword(id, passwordHash) {
    const result = await db.query(
      `UPDATE unistudents SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, id]
    );
    return result.rowCount > 0;
  }

  static async getProfile(userId) {
    const res = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.registration_no, u.bio, u.phone, u.created_at,
              e.specialization, e.qualifications, e.license_number
       FROM unistudents u
       LEFT JOIN experts e ON e.user_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  static async getDaysActive(userId) {
    const res = await db.query(
      `SELECT GREATEST(CURRENT_DATE - created_at::date, 1) AS days_active 
       FROM unistudents WHERE id = $1`,
      [userId]
    );
    return res.rowCount > 0 ? res.rows[0].days_active : 1;
  }

  static async updateProfile(userId, { name, bio, phone }) {
    const res = await db.query(
      `UPDATE unistudents 
       SET name = $1, bio = $2, phone = $3, updated_at = NOW() 
       WHERE id = $4`,
      [name, bio, phone, userId]
    );
    return res.rowCount > 0;
  }

  static async getAllStudents(limit, offset, q) {
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
    return { count: result.rowCount, students: result.rows };
  }

  static async findByIdWithDetails(id) {
    const result = await db.query(
      "SELECT id, name, email, role, registration_no, bio, phone, is_verified, created_at FROM unistudents WHERE id = $1 LIMIT 1",
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = User;
