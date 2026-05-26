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
          null,
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
