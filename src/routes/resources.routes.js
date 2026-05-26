const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const uploadsDir = path.join(__dirname, "../../uploads/resources");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const resourceFolder = path.join(uploadsDir, `resource-${Date.now()}`);
    req.resourceFolder = resourceFolder;

    if (!fs.existsSync(resourceFolder)) {
      fs.mkdirSync(resourceFolder, { recursive: true });
    }

    cb(null, resourceFolder);
  },
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, image, and document files are allowed"));
    }
  },
});

function ensureExpert(req, res, next) {
  if (req.user?.role !== "expert" && req.user?.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Expert access required",
    });
  }

  return next();
}

function mapResourceRow(row) {
  return {
    id: row.id,
    title: row.title,
    authorId: row.author_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorRole: row.author_role,
    type: row.type,
    category: row.category,
    contentUrl: row.content_url,
    summary: row.summary,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const { authorRole, category, type } = req.query || {};
    const filters = [];
    const values = [];

    if (authorRole) {
      values.push(authorRole);
      filters.push(`u.role = $${values.length}`);
    }

    if (category) {
      values.push(category);
      filters.push(`r.category ILIKE $${values.length}`);
    }

    if (type) {
      values.push(type.toUpperCase());
      filters.push(`r.type = $${values.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await query(
      `SELECT
        r.id,
        r.title,
        r.author_id,
        r.type,
        r.category,
        r.content_url,
        r.summary,
        r.visibility,
        r.created_at,
        r.updated_at,
        u.name AS author_name,
        u.email AS author_email,
        u.role AS author_role
      FROM resources r
      LEFT JOIN unistudents u ON u.id = r.author_id
      ${whereClause}
      ORDER BY r.created_at DESC`,
      values,
    );

    return res.status(200).json({
      status: "ok",
      count: result.rowCount,
      resources: result.rows.map(mapResourceRow),
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  requireAuth,
  ensureExpert,
  upload.single("document"),
  async (req, res, next) => {
    try {
      const { title, category, summary, type, visibility } = req.body || {};

      if (!title || !req.file) {
        return res.status(400).json({
          status: "error",
          message: "Title and document file are required",
        });
      }

      const fileUrl = `/api/uploads/resources/${path.basename(req.resourceFolder)}/${req.file.filename}`;

      const result = await query(
        `INSERT INTO resources (
          title,
          author_id,
          type,
          category,
          content_url,
          summary,
          visibility,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, title, type, category, content_url, summary, visibility, created_at, updated_at`,
        [
          title.trim(),
          req.user.id,
          type || "GUIDE",
          category || null,
          fileUrl,
          summary || null,
          visibility || "public",
        ],
      );

      return res.status(201).json({
        status: "ok",
        message: "Resource uploaded successfully",
        resource: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
