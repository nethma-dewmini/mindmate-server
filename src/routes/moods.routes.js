const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Apply requireAuth middleware to protect all routes
router.use(requireAuth);

// 1. GET /summary - Get mood statistics and streak for the logged-in student
router.get("/summary", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const days = Number(req.query.days) || 30;

    // 1. Get count and average mood
    const summaryRes = await db.query(
      `SELECT COUNT(*)::int AS count, 
              AVG(mood)::numeric(10,1) AS avg_mood 
       FROM mood_entries 
       WHERE user_id = $1 AND created_at >= NOW() - ($2::int * INTERVAL '1 day')`,
      [userId, days]
    );

    const count = summaryRes.rows[0].count || 0;
    const avgMood = parseFloat(summaryRes.rows[0].avg_mood || 0);

    // 2. Get distinct entry dates to compute streak
    const dateRes = await db.query(
      `SELECT DISTINCT (created_at::date) AS entry_date 
       FROM mood_entries 
       WHERE user_id = $1 
       ORDER BY entry_date DESC 
       LIMIT 1000`,
      [userId]
    );

    let streak = 0;
    if (dateRes.rows.length > 0) {
      const dates = dateRes.rows.map(r => {
        let val = r.entry_date;
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          val = `${y}-${m}-${d}`;
        }
        const [year, month, day] = String(val).split("T")[0].split("-").map(Number);
        return new Date(year, month - 1, day);
      });

      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);

      const firstEntryDate = dates[0];
      const diffTimeFirst = todayDate.getTime() - firstEntryDate.getTime();
      const diffDaysFirst = Math.floor(diffTimeFirst / (1000 * 60 * 60 * 24));

      if (diffDaysFirst <= 1) {
        streak = 1;
        let expectedDate = new Date(firstEntryDate);
        for (let i = 1; i < dates.length; i++) {
          expectedDate.setDate(expectedDate.getDate() - 1);
          const currentDate = dates[i];
          if (currentDate.getTime() === expectedDate.getTime()) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    res.json({
      count,
      avg_mood: avgMood,
      streak
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET / - List mood entries for the logged-in student (query: ?limit=&offset=)
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;

    const result = await db.query(
      "SELECT * FROM mood_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// 3. GET /:id - Get a single mood entry
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await db.query(
      "SELECT * FROM mood_entries WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "entry not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// 4. POST / - Create a new mood entry
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { mood, note = null } = req.body;

    if (typeof mood === "undefined" || mood === null) {
      return res.status(400).json({ error: "mood is required" });
    }

    const moodInt = Number(mood);
    if (isNaN(moodInt) || moodInt < 1 || moodInt > 5) {
      return res.status(400).json({ error: "mood must be an integer between 1 and 5" });
    }

    const result = await db.query(
      "INSERT INTO mood_entries (user_id, mood, note) VALUES ($1, $2, $3) RETURNING *",
      [userId, moodInt, note]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// 5. PUT /:id - Update a mood entry
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { mood, note } = req.body;
    
    const fields = [];
    const values = [];
    let idx = 1;

    if (typeof mood !== "undefined" && mood !== null) {
      const moodInt = Number(mood);
      if (isNaN(moodInt) || moodInt < 1 || moodInt > 5) {
        return res.status(400).json({ error: "mood must be an integer between 1 and 5" });
      }
      fields.push(`mood = $${idx++}`);
      values.push(moodInt);
    }
    if (typeof note !== "undefined") {
      fields.push(`note = $${idx++}`);
      values.push(note);
    }

    if (fields.length === 0)
      return res.status(400).json({ error: "no fields to update" });

    const q = `UPDATE mood_entries SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
    values.push(id, userId);

    const result = await db.query(q, values);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "entry not found" });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// 6. DELETE /:id - Delete a mood entry
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await db.query("DELETE FROM mood_entries WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "entry not found" });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
