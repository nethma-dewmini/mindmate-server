const express = require("express");
const db = require("../db");

const router = express.Router();

// Create mood entry
router.post("/", async (req, res, next) => {
  try {
    const { user_id, mood, note = null, metadata = {} } = req.body;
    if (!user_id || typeof mood === "undefined")
      return res.status(400).json({ error: "user_id and mood are required" });
    const result = await db.query(
      "INSERT INTO mood_entries (user_id, mood, note, metadata) VALUES ($1,$2,$3,$4) RETURNING *",
      [user_id, mood, note, metadata],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// List mood entries (query: ?user_id=&limit=&offset=)
router.get("/", async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    if (!user_id)
      return res
        .status(400)
        .json({ error: "user_id query parameter is required" });
    const result = await db.query(
      "SELECT * FROM mood_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [user_id, limit, offset],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Get a single mood entry
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM mood_entries WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "entry not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update a mood entry (note, mood, metadata)
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mood, note, metadata } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if (typeof mood !== "undefined") {
      fields.push(`mood = $${idx++}`);
      values.push(mood);
    }
    if (typeof note !== "undefined") {
      fields.push(`note = $${idx++}`);
      values.push(note);
    }
    if (typeof metadata !== "undefined") {
      fields.push(`metadata = $${idx++}`);
      values.push(metadata);
    }
    if (fields.length === 0)
      return res.status(400).json({ error: "no fields to update" });
    fields.push(`updated_at = NOW()`);
    const q = `UPDATE mood_entries SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
    values.push(id);
    const result = await db.query(q, values);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "entry not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a mood entry
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM mood_entries WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Summary for a user over a period: /api/moods/summary?user_id=&days=30
router.get("/summary", async (req, res, next) => {
  try {
    const { user_id } = req.query;
    const days = Number(req.query.days) || 30;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    const q =
      'SELECT COUNT(*)::int AS count, AVG(mood)::numeric(10,2) AS avg_mood, MIN(created_at) AS first_entry, MAX(created_at) AS last_entry FROM mood_entries WHERE user_id = $1 AND created_at >= NOW() - ($2::int || \" days\")::interval';
    // Note: build interval safely by using integer days
    const result = await db.query(
      'SELECT COUNT(*)::int AS count, AVG(mood)::numeric(10,2) AS avg_mood, MIN(created_at) AS first_entry, MAX(created_at) AS last_entry FROM mood_entries WHERE user_id = $1 AND created_at >= NOW() - ($2 || \" days\")::interval',
      [user_id, String(days)],
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
