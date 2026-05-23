const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/unistudents?limit=&offset=&q=
// Returns users with role = 'student'
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const q = (req.query.q || '').trim();

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
    res.json({ count: result.rowCount, students: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/unistudents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, name, email, role, registration_no, bio, phone, is_verified, created_at FROM unistudents WHERE id = $1 LIMIT 1',
      [id],
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Student not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
