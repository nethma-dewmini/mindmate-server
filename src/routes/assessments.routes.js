const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

async function ensureAssessmentsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS assessments (
      id uuid PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
      title text NOT NULL,
      description text,
      questions jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
}

function normalizeQuestions(questions) {
  if (questions === undefined || questions === null || questions === "") {
    return null;
  }

  if (Array.isArray(questions) || typeof questions === "object") {
    return questions;
  }

  return JSON.parse(questions);
}

router.get("/", async (req, res, next) => {
  try {
    await ensureAssessmentsTable();
    const result = await db.query(
      "SELECT id, title, description, questions, created_at FROM assessments ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    await ensureAssessmentsTable();
    const result = await db.query(
      "SELECT id, title, description, questions, created_at FROM assessments WHERE id = $1 LIMIT 1",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "assessment not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await ensureAssessmentsTable();

    const { title, description = null, questions = null } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const parsedQuestions = normalizeQuestions(questions);

    const result = await db.query(
      `INSERT INTO assessments (title, description, questions)
       VALUES ($1, $2, $3)
       RETURNING id, title, description, questions, created_at`,
      [title.trim(), description, parsedQuestions],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await ensureAssessmentsTable();

    const { id } = req.params;
    const { title, description, questions } = req.body || {};
    const parsedQuestions =
      questions === undefined ? undefined : normalizeQuestions(questions);

    const result = await db.query(
      `UPDATE assessments
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           questions = COALESCE($3, questions)
       WHERE id = $4
       RETURNING id, title, description, questions, created_at`,
      [
        title ? title.trim() : null,
        description === undefined ? null : description,
        parsedQuestions === undefined ? null : parsedQuestions,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "assessment not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await ensureAssessmentsTable();
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM assessments WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "assessment not found" });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
