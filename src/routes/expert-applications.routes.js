const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const {
  sendExpertApplicationAdminNotification,
  sendExpertApplicationApprovedEmail,
} = require("../utils/emailService");

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
    const { name, title, email, specialization } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({
        status: "error",
        message: "name and email are required",
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
      (name, title, email, specialization, documents, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING id, name, title, email, status, created_at`;

    const result = await db.query(insertSql, [
      name,
      title || null,
      email.toLowerCase(),
      specialization || null,
      JSON.stringify(documents),
    ]);

    const application = result.rows[0];

    // Send admin notification email (non-blocking, handled safely)
    sendExpertApplicationAdminNotification({
      name: application.name,
      title: application.title,
      email: application.email,
      specialization: specialization || null,
    }).catch((err) => console.error("Error sending admin notification email:", err));

    return res.status(201).json({
      status: "ok",
      message: "Application submitted successfully. Admin will review shortly.",
      application: {
        id: application.id,
        name: application.name,
        title: application.title,
        email: application.email,
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

// GET /api/expert-applications/status?email=...
// Public endpoint to let an applicant check their latest application status by email
router.get("/status", async (req, res, next) => {
  try {
    const { email } = req.query || {};

    if (!email) {
      return res.status(400).json({
        status: "error",
        message: "email is required",
      });
    }

    const result = await db.query(
      `SELECT id, name, title, email, specialization, status, admin_notes, created_at, reviewed_at
       FROM expert_applications
       WHERE LOWER(email) = LOWER($1)
       ORDER BY (reviewed_at IS NULL) ASC, reviewed_at DESC, created_at DESC
       LIMIT 1`,
      [String(email).trim()],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No expert application found for this email",
      });
    }

    return res.status(200).json({
      status: "ok",
      application: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/expert-applications/:id
// Get application details (admin only)
router.get("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT id, name, email, specialization, documents, status, admin_notes, created_at, reviewed_at FROM expert_applications WHERE id = $1",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Application not found" });
    }

    const application = result.rows[0];
    // `documents` column may be returned as JSON (object) or as a string depending on driver
    let docs = application.documents;
    if (typeof docs === "string") {
      try {
        docs = JSON.parse(docs || "[]");
      } catch (e) {
        docs = [];
      }
    }
    application.documents = docs || [];

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
});

// GET /api/expert-applications (admin)
// List all applications with optional status filter
router.get("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql =
      "SELECT id, name, email, status, created_at, reviewed_at FROM expert_applications";
    const params = [];

    if (status) {
      sql += " WHERE status = $1";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const result = await db.query(sql, params);

    // Get count of each status
    const summaryResult = await db.query(
      "SELECT status, COUNT(*) as count FROM expert_applications GROUP BY status"
    );
    const summary = { pending: 0, approved: 0, rejected: 0 };
    summaryResult.rows.forEach((row) => {
      const s = String(row.status || "").toLowerCase();
      if (summary[s] !== undefined) {
        summary[s] = parseInt(row.count, 10);
      }
    });

    return res.status(200).json({
      status: "ok",
      count: result.rows.length,
      applications: result.rows,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/expert-applications/:id (admin)
// Update application status (approve/reject) and add admin notes
router.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body || {};

    const normalized = String(status || "")
      .toLowerCase()
      .trim();
    const allowed = ["pending", "approved", "rejected"];
    if (!allowed.includes(normalized)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid status" });
    }

    const adminId = req.user && req.user.id ? req.user.id : null;

    const updateSql = `UPDATE expert_applications SET status=$1, admin_notes=$2, admin_id=$3, reviewed_at=NOW() WHERE id=$4 RETURNING id, name, title, email, specialization, documents, status, admin_notes, created_at, reviewed_at`;
    const result = await db.query(updateSql, [
      normalized,
      admin_notes || null,
      adminId,
      id,
    ]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Application not found" });
    }

    const application = result.rows[0];
    if (normalized === "approved") {
      sendExpertApplicationApprovedEmail(application.email, application.name).catch((err) =>
        console.error("Error sending expert approval email:", err)
      );
    }

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
