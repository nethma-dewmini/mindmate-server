const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

async function ensureGroupMessagesTable() {
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

// List all groups (optionally ?publicOnly=true)
router.get("/", async (req, res, next) => {
  try {
    const publicOnly = req.query.publicOnly === "true";
    const q = publicOnly
      ? "SELECT * FROM peer_groups WHERE is_public = true ORDER BY created_at DESC"
      : "SELECT * FROM peer_groups ORDER BY created_at DESC";
    const result = await db.query(q);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Create a group (admin only)
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, is_public = true, created_by = null } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = await db.query(
      "INSERT INTO peer_groups (name, description, is_public, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, description || null, is_public, created_by],
    );
    const group = result.rows[0];

    // Add creator as member if created_by provided
    if (created_by) {
      await db.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO NOTHING",
        [group.id, created_by, "owner"],
      );
    }

    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
});

// Get group detail including members
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const g = await db.query("SELECT * FROM peer_groups WHERE id = $1", [id]);
    if (g.rows.length === 0)
      return res.status(404).json({ error: "group not found" });
    const members = await db.query(
      "SELECT user_id, role, joined_at FROM group_members WHERE group_id = $1",
      [id],
    );
    res.json({ ...g.rows[0], members: members.rows });
  } catch (err) {
    next(err);
  }
});

// Join group
router.post("/:id/join", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "student access required" });
    }
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    // ensure group exists
    const g = await db.query("SELECT id FROM peer_groups WHERE id = $1", [id]);
    if (g.rows.length === 0)
      return res.status(404).json({ error: "group not found" });

    await db.query(
      "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO NOTHING",
      [id, user_id, "member"],
    );
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Leave group
router.post("/:id/leave", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "student access required" });
    }
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    await db.query(
      "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
      [id, user_id],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// List messages for a group (pagination: ?limit=&offset=)
router.get("/:id/messages", async (req, res, next) => {
  try {
    await ensureGroupMessagesTable();
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const result = await db.query(
      `SELECT
         gm.id,
         gm.group_id,
         gm.user_id,
         gm.content,
         gm.metadata,
         gm.created_at,
         COALESCE(gm.metadata->>'authorRole', u.role, 'student') AS author_role,
         COALESCE(u.name, 'User') AS author_name
       FROM group_messages gm
       LEFT JOIN unistudents u ON u.id::text = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Post a message to group
router.post("/:id/messages", requireAuth, async (req, res, next) => {
  try {
    await ensureGroupMessagesTable();
    if (!["student", "admin"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "student or admin access required" });
    }
    const { id } = req.params;
    const { user_id, content, metadata = {} } = req.body;
    if (!user_id || !content)
      return res
        .status(400)
        .json({ error: "user_id and content are required" });

    if (req.user.role === "admin") {
      const memberRes = await db.query(
        "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND role = 'owner'",
        [id, user_id],
      );
      if (memberRes.rows.length === 0) {
        await db.query(
          "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner'",
          [id, user_id, "owner"],
        );
      }
    }

    // ensure membership (optional: allow anonymous posting if group is public)
    const groupRes = await db.query(
      "SELECT is_public FROM peer_groups WHERE id = $1",
      [id],
    );
    if (groupRes.rows.length === 0)
      return res.status(404).json({ error: "group not found" });
    const isPublic = groupRes.rows[0].is_public;

    const memberRes = await db.query(
      "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
      [id, user_id],
    );
    if (!isPublic && memberRes.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "must be a member to post in this group" });
    }

    const normalizedMetadata = {
      ...metadata,
      authorRole: req.user.role,
    };

    const insert = await db.query(
      "INSERT INTO group_messages (group_id, user_id, content, metadata) VALUES ($1,$2,$3,$4) RETURNING id, group_id, user_id, content, metadata, created_at",
      [id, user_id, content, normalizedMetadata],
    );
    res.status(201).json({
      ...insert.rows[0],
      author_role: req.user.role,
    });
  } catch (err) {
    next(err);
  }
});

// React to a message (toggle like/support)
router.post(
  "/:id/messages/:messageId/reactions",
  requireAuth,
  async (req, res, next) => {
    try {
      await ensureGroupMessagesTable();
      const { id, messageId } = req.params;
      const { user_id, type } = req.body;

      if (!user_id || !type) {
        return res.status(400).json({ error: "user_id and type are required" });
      }

      if (!["like", "support"].includes(type)) {
        return res
          .status(400)
          .json({ error: "type must be either 'like' or 'support'" });
      }

      const messageRes = await db.query(
        "SELECT metadata FROM group_messages WHERE id = $1 AND group_id = $2",
        [messageId, id],
      );

      if (messageRes.rows.length === 0) {
        return res.status(404).json({ error: "message not found" });
      }

      const metadata = messageRes.rows[0].metadata || {};
      const reactions = metadata.reactions || {};
      const currentUsers = Array.isArray(reactions[type])
        ? reactions[type]
        : [];

      const hasReacted = currentUsers.includes(user_id);
      const nextUsers = hasReacted
        ? currentUsers.filter((idValue) => idValue !== user_id)
        : [...currentUsers, user_id];

      const updatedMetadata = {
        ...metadata,
        reactions: {
          ...reactions,
          [type]: nextUsers,
        },
      };

      const updateRes = await db.query(
        "UPDATE group_messages SET metadata = $1 WHERE id = $2 RETURNING id, group_id, user_id, content, metadata, created_at",
        [updatedMetadata, messageId],
      );

      res.json({
        ...updateRes.rows[0],
        reaction_type: type,
        reacted: !hasReacted,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Delete a message (simple check: allow if user_id matches or caller is admin)
router.delete(
  "/:id/messages/:messageId",
  requireAuth,
  async (req, res, next) => {
    try {
      await ensureGroupMessagesTable();
      const { id, messageId } = req.params;
      const isAdminCaller = req.user && req.user.role === "admin";
      const userId = req.body && req.body.user_id ? req.body.user_id : null;
      const m = await db.query(
        "SELECT user_id FROM group_messages WHERE id = $1 AND group_id = $2",
        [messageId, id],
      );
      if (m.rows.length === 0)
        return res.status(404).json({ error: "message not found" });
      if (!isAdminCaller && m.rows[0].user_id !== userId) {
        return res
          .status(403)
          .json({ error: "not authorized to delete this message" });
      }
      await db.query("DELETE FROM group_messages WHERE id = $1", [messageId]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// Update group (admin only)
router.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, is_public } = req.body;
    const q = await db.query(
      "UPDATE peer_groups SET name = COALESCE($1,name), description = COALESCE($2,description), is_public = COALESCE($3,is_public) WHERE id = $4 RETURNING *",
      [name || null, description || null, is_public, id],
    );
    if (q.rows.length === 0)
      return res.status(404).json({ error: "group not found" });
    res.json(q.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete group (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM peer_groups WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
