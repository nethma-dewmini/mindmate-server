const db = require('../db');

class StudentRegistry {
  static async findByRegNoAndEmail(registrationNo, email) {
    const result = await db.query(
      `SELECT registration_no, email
       FROM student_registry
       WHERE registration_no = $1
         AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [registrationNo, email]
    );
    return result.rows[0] || null;
  }

  static async getAll(limit, offset, q) {
    let sql = `SELECT id, registration_no, email, created_at, updated_at FROM student_registry`;
    const params = [];
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      sql += ` WHERE (LOWER(registration_no) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }
    params.push(limit);
    params.push(offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await db.query(sql, params);
    return { count: result.rowCount, registry: result.rows };
  }

  static async create(registrationNo, email) {
    const result = await db.query(
      `INSERT INTO student_registry (registration_no, email, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, registration_no, email, created_at, updated_at`,
      [registrationNo, email]
    );
    return result.rows[0];
  }
}

module.exports = StudentRegistry;
