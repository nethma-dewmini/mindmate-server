const express = require("express");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function ensureAssessmentsSchema() {
  await query(`
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

  await query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS key TEXT`);
  await query(
    `UPDATE assessments
     SET key = COALESCE(key, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8))
     WHERE key IS NULL OR key = ''`,
  );
  await query(`ALTER TABLE assessments ALTER COLUMN key SET DEFAULT NULL`);
  await query(`ALTER TABLE assessments ALTER COLUMN key SET NOT NULL`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_key ON assessments (key)`,
  );

  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🧠'`,
  );
  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 5`,
  );
  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'`,
  );
  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb`,
  );
  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL`,
  );
  await query(
    `ALTER TABLE assessments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`,
  );
}

function ensureExpert(req, res, next) {
  if (req.user?.role !== "expert" && req.user?.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Expert access required",
    });
  }

  return next();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createAssessmentKey(title) {
  const base = slugify(title) || "assessment";
  return `${base}-${Date.now().toString(36)}`;
}

function normalizeQuestions(questions) {
  if (questions === undefined || questions === null || questions === "") {
    return [];
  }

  const parsed =
    typeof questions === "string"
      ? JSON.parse(questions)
      : Array.isArray(questions)
        ? questions
        : [];

  return parsed
    .map((question) => ({
      prompt: String(question?.prompt || "").trim(),
      options: Array.isArray(question?.options)
        ? question.options
            .map((option) => String(option || "").trim())
            .filter(Boolean)
        : [],
    }))
    .filter((question) => question.prompt && question.options.length > 0);
}

function mapAssessmentRow(row) {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    icon: row.icon,
    duration: row.duration,
    visibility: row.visibility,
    questions:
      typeof row.questions === "string"
        ? JSON.parse(row.questions || "[]")
        : row.questions || [],
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAssessmentById(id) {
  const result = await query(
    `SELECT id, key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at
     FROM assessments
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  return result.rowCount ? result.rows[0] : null;
}

function canManageAssessment(assessment, user) {
  if (!assessment || !user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return String(assessment.author_id) === String(user.id);
}

router.get("/public", async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const result = await query(
      `SELECT id, key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at
       FROM assessments
       WHERE visibility = 'public'
       ORDER BY updated_at DESC, created_at DESC`,
    );

    return res.status(200).json({
      status: "ok",
      count: result.rowCount,
      assessments: result.rows.map(mapAssessmentRow),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const result = await query(
      `SELECT id, key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at
       FROM assessments
       WHERE author_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [req.user.id],
    );

    return res.status(200).json({
      status: "ok",
      count: result.rowCount,
      assessments: result.rows.map(mapAssessmentRow),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const assessment = await loadAssessmentById(req.params.id);

    if (!assessment) {
      return res.status(404).json({
        status: "error",
        message: "Assessment not found",
      });
    }

    if (assessment.visibility !== "public") {
      const authHeader = req.headers.authorization || "";

      if (!authHeader.startsWith("Bearer ")) {
        return res.status(404).json({
          status: "error",
          message: "Assessment not found",
        });
      }

      try {
        req.user = jwt.verify(
          authHeader.slice(7).trim(),
          process.env.JWT_SECRET || "dev_jwt_secret",
        );
      } catch (error) {
        return res.status(401).json({
          status: "error",
          message: "Invalid or expired token",
        });
      }

      if (!canManageAssessment(assessment, req.user)) {
        return res.status(404).json({
          status: "error",
          message: "Assessment not found",
        });
      }
    }

    return res.status(200).json({
      status: "ok",
      assessment: mapAssessmentRow(assessment),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const { title, description, icon, duration, visibility, key, questions } =
      req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({
        status: "error",
        message: "Title is required",
      });
    }

    const normalizedQuestions = normalizeQuestions(questions);
    const nextKey = String(key || "").trim() || createAssessmentKey(title);
    const nextVisibility =
      String(visibility || "private").toLowerCase() === "public"
        ? "public"
        : "private";

    const result = await query(
      `INSERT INTO assessments (
        key,
        title,
        description,
        icon,
        duration,
        visibility,
        questions,
        author_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at`,
      [
        nextKey,
        String(title).trim(),
        description ? String(description).trim() : null,
        String(icon || "🧠").trim() || "🧠",
        Number(duration) > 0 ? Number(duration) : 5,
        nextVisibility,
        JSON.stringify(normalizedQuestions),
        req.user.id,
      ],
    );

    return res.status(201).json({
      status: "ok",
      message: "Assessment created successfully",
      assessment: mapAssessmentRow(result.rows[0]),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        status: "error",
        message: "Questions must be valid JSON when sent as text",
      });
    }

    next(error);
  }
});

router.patch("/:id", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const assessment = await loadAssessmentById(req.params.id);

    if (!assessment) {
      return res.status(404).json({
        status: "error",
        message: "Assessment not found",
      });
    }

    if (!canManageAssessment(assessment, req.user)) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own assessments",
      });
    }

    const { title, description, icon, duration, visibility, key, questions } =
      req.body || {};
    const nextVisibility =
      visibility === undefined
        ? assessment.visibility
        : String(visibility || "private").toLowerCase() === "public"
          ? "public"
          : "private";

    const normalizedQuestions =
      questions === undefined
        ? assessment.questions
        : normalizeQuestions(questions);

    const result = await query(
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
       RETURNING id, key, title, description, icon, duration, visibility, questions, author_id, created_at, updated_at`,
      [
        title !== undefined && String(title).trim()
          ? String(title).trim()
          : null,
        description === undefined ? null : String(description).trim(),
        icon !== undefined ? String(icon || "🧠").trim() || "🧠" : null,
        duration !== undefined && Number(duration) > 0
          ? Number(duration)
          : null,
        nextVisibility,
        key !== undefined && String(key).trim() ? String(key).trim() : null,
        questions === undefined ? null : JSON.stringify(normalizedQuestions),
        req.params.id,
      ],
    );

    return res.status(200).json({
      status: "ok",
      message: "Assessment updated successfully",
      assessment: mapAssessmentRow(result.rows[0]),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        status: "error",
        message: "Questions must be valid JSON when sent as text",
      });
    }

    next(error);
  }
});

router.delete("/:id", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    await ensureAssessmentsSchema();

    const assessment = await loadAssessmentById(req.params.id);

    if (!assessment) {
      return res.status(404).json({
        status: "error",
        message: "Assessment not found",
      });
    }

    if (!canManageAssessment(assessment, req.user)) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own assessments",
      });
    }

    await query("DELETE FROM assessments WHERE id = $1", [req.params.id]);

    return res.status(200).json({
      status: "ok",
      message: "Assessment deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
