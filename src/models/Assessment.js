const db = require('../db');

class Assessment {
  static async ensureSchema() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
        key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT NOT NULL DEFAULT '🧠',
        duration INTEGER NOT NULL DEFAULT 5,
        visibility TEXT NOT NULL DEFAULT 'private',
        questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS key TEXT`);
    await db.query(
      `UPDATE assessments
       SET key = COALESCE(key, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8))
       WHERE key IS NULL OR key = ''`
    );
    await db.query(`ALTER TABLE assessments ALTER COLUMN key SET DEFAULT NULL`);
    await db.query(`ALTER TABLE assessments ALTER COLUMN key SET NOT NULL`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_key ON assessments (key)`);

    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🧠'`);
    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 5`);
    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'`);
    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL`);
    await db.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`);
  }

  static async getAllPublic() {
    const result = await db.query(
      `SELECT a.id, a.key, a.title, a.description, a.icon, a.duration, a.visibility, a.questions, a.author_id, a.created_at, a.updated_at, u.name AS author_name
       FROM assessments a
       LEFT JOIN unistudents u ON u.id = a.author_id
       WHERE a.visibility = 'public'
       ORDER BY a.updated_at DESC, a.created_at DESC`
    );
    return { count: result.rowCount, assessments: result.rows };
  }

  static async getAllByAuthor(authorId) {
    const result = await db.query(
      `SELECT a.id, a.key, a.title, a.description, a.icon, a.duration, a.visibility, a.questions, a.author_id, a.created_at, a.updated_at, u.name AS author_name
       FROM assessments a
       LEFT JOIN unistudents u ON u.id = a.author_id
       WHERE a.author_id = $1
       ORDER BY a.updated_at DESC, a.created_at DESC`,
      [authorId]
    );
    return { count: result.rowCount, assessments: result.rows };
  }

  static async findById(id) {
    const result = await db.query(
      `SELECT a.id, a.key, a.title, a.description, a.icon, a.duration, a.visibility, a.questions, a.author_id, a.created_at, a.updated_at, u.name AS author_name
       FROM assessments a
       LEFT JOIN unistudents u ON u.id = a.author_id
       WHERE a.id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data) {
    const { key, title, description, icon, duration, visibility, questions, authorId } = data;
    const result = await db.query(
      `INSERT INTO assessments (
        key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [key, title, description, icon, duration, visibility, JSON.stringify(questions), authorId]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { title, description, icon, duration, visibility, key, questions } = data;
    const result = await db.query(
      `UPDATE assessments
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           icon = COALESCE($3, icon),
           duration = COALESCE($4, duration),
           visibility = $5,
           key = COALESCE($6, key),
           questions = COALESCE($7, questions),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, description, icon, duration, visibility, key, questions ? JSON.stringify(questions) : null, id]
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    await db.query("DELETE FROM assessments WHERE id = $1", [id]);
  }
}

module.exports = Assessment;
