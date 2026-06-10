const jwt = require("jsonwebtoken");
const Assessment = require("../models/Assessment");

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

function canManageAssessment(assessment, user) {
  if (!assessment || !user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return String(assessment.author_id) === String(user.id);
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
    authorName: row.author_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

exports.getPublicAssessments = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

    const data = await Assessment.getAllPublic();

    return res.status(200).json({
      status: "ok",
      count: data.count,
      assessments: data.assessments.map(mapAssessmentRow),
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyAssessments = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

    const data = await Assessment.getAllByAuthor(req.user.id);

    return res.status(200).json({
      status: "ok",
      count: data.count,
      assessments: data.assessments.map(mapAssessmentRow),
    });
  } catch (error) {
    next(error);
  }
};

exports.getAssessmentById = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

    const assessment = await Assessment.findById(req.params.id);

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
          process.env.JWT_SECRET || "dev_jwt_secret"
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
};

exports.createAssessment = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

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

    const assessment = await Assessment.create({
      key: nextKey,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      icon: String(icon || "🧠").trim() || "🧠",
      duration: Number(duration) > 0 ? Number(duration) : 5,
      visibility: nextVisibility,
      questions: normalizedQuestions,
      authorId: req.user.id
    });

    return res.status(201).json({
      status: "ok",
      message: "Assessment created successfully",
      assessment: {
        ...mapAssessmentRow(assessment),
        authorName: req.user.name,
      },
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
};

exports.updateAssessment = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

    const assessment = await Assessment.findById(req.params.id);

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

    const { title, description, icon, duration, visibility, key, questions } = req.body || {};

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

    const updatedAssessment = await Assessment.update(req.params.id, {
      title: title !== undefined && String(title).trim() ? String(title).trim() : undefined,
      description: description === undefined ? undefined : String(description).trim(),
      icon: icon !== undefined ? String(icon || "🧠").trim() || "🧠" : undefined,
      duration: duration !== undefined && Number(duration) > 0 ? Number(duration) : undefined,
      visibility: nextVisibility,
      key: key !== undefined && String(key).trim() ? String(key).trim() : undefined,
      questions: questions === undefined ? undefined : normalizedQuestions
    });

    return res.status(200).json({
      status: "ok",
      message: "Assessment updated successfully",
      assessment: {
        ...mapAssessmentRow(updatedAssessment),
        authorName: req.user.name,
      },
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
};

exports.deleteAssessment = async (req, res, next) => {
  try {
    await Assessment.ensureSchema();

    const assessment = await Assessment.findById(req.params.id);

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

    await Assessment.delete(req.params.id);

    return res.status(200).json({
      status: "ok",
      message: "Assessment deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
