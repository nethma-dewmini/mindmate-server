const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, "../../uploads/expert-applications");

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create a folder per application (timestamp-based)
    const appFolder = path.join(uploadsDir, `app-${Date.now()}`);
    if (!fs.existsSync(appFolder)) {
      fs.mkdirSync(appFolder, { recursive: true });
    }
    req.appFolder = appFolder;
    cb(null, appFolder);
  },
  filename: (req, file, cb) => {
    // Keep original filename but sanitize
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, sanitized);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
  fileFilter: (req, file, cb) => {
    // Allow PDF, images, and common document formats
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, images, and documents are allowed"));
    }
  },
});

// POST /api/expert-applications/apply
// Submit an expert application with documents
router.post("/apply", upload.array("documents", 10), async (req, res, next) => {
  try {
    const { name, email, role_requested, specialization, experience } =
      req.body || {};

    if (!name || !email || !role_requested) {
      return res.status(400).json({
        status: "error",
        message: "name, email, and role_requested are required",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "At least one document is required",
      });
    }

    // Check if email already has a pending application
    const existing = await db.query(
      "SELECT id FROM expert_applications WHERE email = $1 AND status = 'pending'",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message:
          "You already have a pending application. Please wait for admin review.",
      });
    }

    // Build documents array with file info
    const documents = req.files.map((file) => ({
      name: file.originalname,
      path: file.path,
      relativePath: `expert-applications/${path.basename(req.appFolder)}/${file.filename}`,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }));

    // Insert application into DB
    const insertSql = `INSERT INTO expert_applications 
      (name, email, role_requested, specialization, experience, documents, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING id, name, email, role_requested, status, created_at`;

    const result = await db.query(insertSql, [
      name,
      email.toLowerCase(),
      role_requested,
      specialization || null,
      experience || null,
      JSON.stringify(documents),
    ]);

    const application = result.rows[0];

    return res.status(201).json({
      status: "ok",
      message: "Application submitted successfully. Admin will review shortly.",
      application: {
        id: application.id,
        name: application.name,
        email: application.email,
        role_requested: application.role_requested,
        status: application.status,
        created_at: application.created_at,
        filesCount: documents.length,
      },
    });
  } catch (err) {
    // Clean up uploaded files on error
    if (req.appFolder && fs.existsSync(req.appFolder)) {
      fs.rmSync(req.appFolder, { recursive: true });
    }
    next(err);
  }
});

// GET /api/expert-applications/:id
// Get application details (admin or applicant)
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT id, name, email, role_requested, specialization, experience, documents, status, admin_notes, created_at, reviewed_at FROM expert_applications WHERE id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Application not found" });
    }

    const application = result.rows[0];
    application.documents = JSON.parse(application.documents || "[]");

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
});

// GET /api/expert-applications (admin)
// List all applications with optional status filter
router.get("/", async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql =
      "SELECT id, name, email, role_requested, status, created_at, reviewed_at FROM expert_applications";
    const params = [];

    if (status) {
      sql += " WHERE status = $1";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const result = await db.query(sql, params);

    return res.status(200).json({
      status: "ok",
      count: result.rows.length,
      applications: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
