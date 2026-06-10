const db = require('../db');

class ContactMessage {
  static async initTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `).catch((err) => {
      console.error("Failed to initialize contact_messages table:", err);
    });
  }

  static async create(data) {
    const { name, email, subject, message } = data;
    const result = await db.query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [name, email, subject || null, message]
    );
    return result.rows[0];
  }
}

module.exports = ContactMessage;
