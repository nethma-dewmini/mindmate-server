const db = require('../db');

class PeerGroup {
  static async ensureMessagesTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id uuid PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
        group_id uuid NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        content text NOT NULL,
        metadata jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT NOW()
      )
    `);
    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_group_messages_group_id_created_at ON group_messages(group_id, created_at DESC)",
    );
  }

  static async getAll(publicOnly) {
    const q = publicOnly
      ? "SELECT * FROM peer_groups WHERE is_public = true ORDER BY created_at DESC"
      : "SELECT * FROM peer_groups ORDER BY created_at DESC";
    const result = await db.query(q);
    return result.rows;
  }

  static async create({ name, description, is_public, created_by }) {
    const result = await db.query(
      "INSERT INTO peer_groups (name, description, is_public, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, description || null, is_public, created_by]
    );
    const group = result.rows[0];

    if (created_by) {
      await db.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO NOTHING",
        [group.id, created_by, "owner"]
      );
    }
    return group;
  }

  static async getById(id) {
    const g = await db.query("SELECT * FROM peer_groups WHERE id = $1", [id]);
    if (g.rows.length === 0) return null;

    const members = await db.query(
      "SELECT user_id, role, joined_at FROM group_members WHERE group_id = $1",
      [id]
    );
    return { ...g.rows[0], members: members.rows };
  }

  static async join(id, userId) {
    await db.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO NOTHING",
      [id, userId, "member"]
    );
  }

  static async leave(id, userId) {
    await db.query(
      "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
      [id, userId]
    );
  }

  static async getMessages(id, limit, offset) {
    const result = await db.query(
      `SELECT
         gm.id, gm.group_id, gm.user_id, gm.content, gm.metadata, gm.created_at,
         COALESCE(gm.metadata->>'authorRole', u.role, 'student') AS author_role,
         COALESCE(u.name, 'User') AS author_name
       FROM group_messages gm
       LEFT JOIN unistudents u ON u.id::text = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    return result.rows;
  }

  static async getMemberRole(id, userId) {
    const memberRes = await db.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [id, userId]
    );
    return memberRes.rows[0]?.role || null;
  }

  static async makeOwner(id, userId) {
    await db.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner'",
      [id, userId, "owner"]
    );
  }

  static async postMessage(id, userId, content, metadata) {
    const insert = await db.query(
      "INSERT INTO group_messages (group_id, user_id, content, metadata) VALUES ($1,$2,$3,$4) RETURNING id, group_id, user_id, content, metadata, created_at",
      [id, userId, content, metadata]
    );
    return insert.rows[0];
  }

  static async getMessage(messageId, groupId) {
    const res = await db.query(
      "SELECT user_id, metadata FROM group_messages WHERE id = $1 AND group_id = $2",
      [messageId, groupId]
    );
    return res.rows[0] || null;
  }

  static async updateMessageMetadata(messageId, metadata) {
    const updateRes = await db.query(
      "UPDATE group_messages SET metadata = $1 WHERE id = $2 RETURNING id, group_id, user_id, content, metadata, created_at",
      [metadata, messageId]
    );
    return updateRes.rows[0];
  }

  static async deleteMessage(messageId) {
    await db.query("DELETE FROM group_messages WHERE id = $1", [messageId]);
  }

  static async update(id, { name, description, is_public }) {
    const q = await db.query(
      "UPDATE peer_groups SET name = COALESCE($1,name), description = COALESCE($2,description), is_public = COALESCE($3,is_public) WHERE id = $4 RETURNING *",
      [name || null, description || null, is_public, id]
    );
    return q.rows[0] || null;
  }

  static async delete(id) {
    await db.query("DELETE FROM peer_groups WHERE id = $1", [id]);
  }
}

module.exports = PeerGroup;
