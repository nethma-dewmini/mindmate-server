const db = require('../db');

class ExpertApplication {
  static async findLatestApproved(email) {
    const result = await db.query(
      `SELECT id, name, title, email, specialization
       FROM expert_applications
       WHERE LOWER(email) = LOWER($1)
         AND status = 'approved'
       ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async findPendingByEmail(email) {
    const result = await db.query(
      "SELECT id FROM expert_applications WHERE LOWER(email) = LOWER($1) AND status = 'pending'",
      [email]
    );
    return result.rows[0] || null;
  }

  static async create({ name, title, email, specialization, documents }) {
    const result = await db.query(
      `INSERT INTO expert_applications (name, title, email, specialization, documents, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING id, name, title, email, status, created_at`,
      [name, title || null, email.toLowerCase(), specialization || null, JSON.stringify(documents)]
    );
    return result.rows[0];
  }

  static async getLatestStatusByEmail(email) {
    const result = await db.query(
      `SELECT id, name, title, email, specialization, status, admin_notes, created_at, reviewed_at
       FROM expert_applications
       WHERE LOWER(email) = LOWER($1)
       ORDER BY (reviewed_at IS NULL) ASC, reviewed_at DESC, created_at DESC
       LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await db.query(
      "SELECT id, name, title, email, specialization, documents, status, admin_notes, created_at, reviewed_at FROM expert_applications WHERE id = $1 LIMIT 1",
      [id]
    );
    if (result.rows.length === 0) return null;
    
    const application = result.rows[0];
    if (typeof application.documents === "string") {
      try { application.documents = JSON.parse(application.documents || "[]"); } 
      catch (e) { application.documents = []; }
    } else {
      application.documents = application.documents || [];
    }
    return application;
  }

  static async getAll(status = null) {
    let sql = "SELECT id, name, email, status, created_at, reviewed_at FROM expert_applications";
    const params = [];
    if (status) {
      sql += " WHERE status = $1";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC LIMIT 100";
    const result = await db.query(sql, params);
    return result.rows;
  }

  static async getStatusSummary() {
    const result = await db.query("SELECT status, COUNT(*) as count FROM expert_applications GROUP BY status");
    const summary = { pending: 0, approved: 0, rejected: 0 };
    result.rows.forEach(row => {
      const s = String(row.status || "").toLowerCase();
      if (summary[s] !== undefined) summary[s] = parseInt(row.count, 10);
    });
    return summary;
  }

  static async updateStatus(id, status, adminNotes, adminId) {
    const result = await db.query(
      `UPDATE expert_applications 
       SET status=$1, admin_notes=$2, admin_id=$3, reviewed_at=NOW() 
       WHERE id=$4 
       RETURNING id, name, title, email, specialization, documents, status, admin_notes, created_at, reviewed_at`,
      [status, adminNotes || null, adminId, id]
    );
    return result.rows[0] || null;
  }
}

module.exports = ExpertApplication;
