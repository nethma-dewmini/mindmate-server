const PeerGroup = require("../models/PeerGroup");

exports.getGroups = async (req, res, next) => {
  try {
    const publicOnly = req.query.publicOnly === "true";
    const groups = await PeerGroup.getAll(publicOnly);
    res.json(groups);
  } catch (err) {
    next(err);
  }
};

exports.createGroup = async (req, res, next) => {
  try {
    const { name, description, is_public = true, created_by = null } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    
    const group = await PeerGroup.create({ name, description, is_public, created_by });
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
};

exports.getGroupById = async (req, res, next) => {
  try {
    const group = await PeerGroup.getById(req.params.id);
    if (!group) return res.status(404).json({ error: "group not found" });
    res.json(group);
  } catch (err) {
    next(err);
  }
};

exports.joinGroup = async (req, res, next) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "student access required" });
    }
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const group = await PeerGroup.getById(id);
    if (!group) return res.status(404).json({ error: "group not found" });

    await PeerGroup.join(id, user_id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.leaveGroup = async (req, res, next) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "student access required" });
    }
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    await PeerGroup.leave(id, user_id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    await PeerGroup.ensureMessagesTable();
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const messages = await PeerGroup.getMessages(id, limit, offset);
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

exports.postMessage = async (req, res, next) => {
  try {
    await PeerGroup.ensureMessagesTable();
    if (!["student", "admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "student or admin access required" });
    }
    const { id } = req.params;
    const { user_id, content, metadata = {} } = req.body;
    if (!user_id || !content) return res.status(400).json({ error: "user_id and content are required" });

    if (req.user.role === "admin") {
      const role = await PeerGroup.getMemberRole(id, user_id);
      if (role !== "owner") {
        await PeerGroup.makeOwner(id, user_id);
      }
    }

    const group = await PeerGroup.getById(id);
    if (!group) return res.status(404).json({ error: "group not found" });

    const isPublic = group.is_public;
    const memberRole = await PeerGroup.getMemberRole(id, user_id);

    if (!isPublic && !memberRole) {
      return res.status(403).json({ error: "must be a member to post in this group" });
    }

    const normalizedMetadata = {
      ...metadata,
      authorRole: req.user.role,
    };

    const message = await PeerGroup.postMessage(id, user_id, content, normalizedMetadata);
    res.status(201).json({
      ...message,
      author_role: req.user.role,
    });
  } catch (err) {
    next(err);
  }
};

exports.reactToMessage = async (req, res, next) => {
  try {
    await PeerGroup.ensureMessagesTable();
    const { id, messageId } = req.params;
    const { user_id, type } = req.body;

    if (!user_id || !type) {
      return res.status(400).json({ error: "user_id and type are required" });
    }
    if (!["like", "support"].includes(type)) {
      return res.status(400).json({ error: "type must be either 'like' or 'support'" });
    }

    const message = await PeerGroup.getMessage(messageId, id);
    if (!message) {
      return res.status(404).json({ error: "message not found" });
    }

    const metadata = message.metadata || {};
    const reactions = metadata.reactions || {};
    const currentUsers = Array.isArray(reactions[type]) ? reactions[type] : [];

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

    const updatedMessage = await PeerGroup.updateMessageMetadata(messageId, updatedMetadata);

    res.json({
      ...updatedMessage,
      reaction_type: type,
      reacted: !hasReacted,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteMessage = async (req, res, next) => {
  try {
    await PeerGroup.ensureMessagesTable();
    const { id, messageId } = req.params;
    const isAdminCaller = req.user && req.user.role === "admin";
    const userId = req.body && req.body.user_id ? req.body.user_id : null;

    const message = await PeerGroup.getMessage(messageId, id);
    if (!message) return res.status(404).json({ error: "message not found" });

    if (!isAdminCaller && message.user_id !== userId) {
      return res.status(403).json({ error: "not authorized to delete this message" });
    }

    await PeerGroup.deleteMessage(messageId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, is_public } = req.body;
    const updated = await PeerGroup.update(id, { name, description, is_public });
    if (!updated) return res.status(404).json({ error: "group not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    await PeerGroup.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
