const db = require('../db');

class ChatbotSession {
  static async ensureTables() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS chatbot_sessions (
        id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
        user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Conversation',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_user_id ON chatbot_sessions(user_id)");

    await db.query(`
      CREATE TABLE IF NOT EXISTS chatbot_messages (
        id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
        user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user_id ON chatbot_messages(user_id)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at)");

    await db.query(`ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chatbot_sessions(id) ON DELETE CASCADE`);

    await db.query(`
      DO $$
      DECLARE
        r RECORD;
        new_session_id UUID;
      BEGIN
        FOR r IN SELECT DISTINCT user_id FROM chatbot_messages WHERE session_id IS NULL LOOP
          INSERT INTO chatbot_sessions (user_id, title)
          VALUES (r.user_id, 'Default Chat')
          RETURNING id INTO new_session_id;

          UPDATE chatbot_messages
          SET session_id = new_session_id
          WHERE user_id = r.user_id AND session_id IS NULL;
        END LOOP;
      END $$;
    `);

    await db.query(`ALTER TABLE chatbot_messages ALTER COLUMN session_id SET NOT NULL`);
  }

  static async getAll(userId) {
    const result = await db.query(
      "SELECT id, title, created_at FROM chatbot_sessions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return result.rows;
  }

  static async create(userId, title) {
    const result = await db.query(
      "INSERT INTO chatbot_sessions (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at",
      [userId, title]
    );
    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await db.query("DELETE FROM chatbot_sessions WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
    return result.rowCount > 0;
  }

  static async verifyOwnership(id, userId) {
    const result = await db.query(
      "SELECT id, title FROM chatbot_sessions WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async getLatestSession(userId) {
    const result = await db.query(
      "SELECT id, title FROM chatbot_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    return result.rows[0] || null;
  }

  static async updateTitle(id, title) {
    await db.query("UPDATE chatbot_sessions SET title = $1 WHERE id = $2", [title, id]);
  }

  static async getMessages(sessionId) {
    const result = await db.query(
      "SELECT id, role, content, created_at FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId]
    );
    return result.rows;
  }

  static async getContextMessages(sessionId, limit) {
    const result = await db.query(
      "SELECT role, content FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2",
      [sessionId, limit]
    );
    return result.rows.reverse();
  }

  static async addMessage(userId, sessionId, role, content) {
    const result = await db.query(
      "INSERT INTO chatbot_messages (user_id, session_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, role, content, created_at",
      [userId, sessionId, role, content]
    );
    return result.rows[0];
  }
}

module.exports = ChatbotSession;
