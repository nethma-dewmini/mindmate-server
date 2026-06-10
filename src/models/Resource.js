const db = require('../db');

class Resource {
  static async getAll(filtersParams) {
    const { authorRole, category, type, isPublic } = filtersParams;
    const filters = [];
    const values = [];

    if (authorRole) {
      values.push(authorRole);
      filters.push(`u.role = $${values.length}`);
    }
    if (category) {
      values.push(category);
      filters.push(`r.category ILIKE $${values.length}`);
    }
    if (type) {
      values.push(type.toUpperCase());
      filters.push(`r.type = $${values.length}`);
    }
    if (isPublic) {
      values.push("public");
      filters.push(`r.visibility = $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await db.query(
      `SELECT
        r.id, r.title, r.author_id, r.type, r.category, r.content_url, r.summary, r.visibility, r.created_at, r.updated_at,
        u.name AS author_name, u.email AS author_email, u.role AS author_role
      FROM resources r
      LEFT JOIN unistudents u ON u.id = r.author_id
      ${whereClause}
      ORDER BY r.created_at DESC`,
      values
    );

    return { count: result.rowCount, resources: result.rows };
  }

  static async getAllByAuthor(authorId) {
    const result = await db.query(
      `SELECT
        r.id, r.title, r.author_id, r.type, r.category, r.content_url, r.summary, r.visibility, r.created_at, r.updated_at,
        u.name AS author_name, u.email AS author_email, u.role AS author_role
      FROM resources r
      LEFT JOIN unistudents u ON u.id = r.author_id
      WHERE r.author_id = $1
      ORDER BY r.created_at DESC`,
      [authorId]
    );
    return { count: result.rowCount, resources: result.rows };
  }

  static async findById(id) {
    const result = await db.query(
      `SELECT r.id, r.author_id, r.content_url, r.title, r.type, r.category, r.summary, r.visibility
       FROM resources r
       WHERE r.id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data) {
    const { title, authorId, type, category, contentUrl, summary, visibility } = data;
    const result = await db.query(
      `INSERT INTO resources (
        title, author_id, type, category, content_url, summary, visibility, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`,
      [title, authorId, type, category, contentUrl, summary, visibility]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { title, type, category, contentUrl, summary, visibility } = data;
    const result = await db.query(
      `UPDATE resources
       SET title = $1, type = $2, category = $3, content_url = $4, summary = $5, visibility = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, type, category, contentUrl, summary, visibility, id]
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await db.query("DELETE FROM resources WHERE id = $1", [id]);
  }
}

module.exports = Resource;
