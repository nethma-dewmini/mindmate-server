const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const uploadsDir = path.join(__dirname, "../../uploads/resources");

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.warn("Could not create local uploads directory (this is normal on read-only serverless environments like Vercel):", err.message);
  }
}

const supabaseService = require("../utils/supabaseService");

const storage = multer.memoryStorage();

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
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
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

async function deleteResourceFromStorage(contentUrl) {
  if (!contentUrl) {
    return;
  }

  const prefix = "/api/uploads/resources/";
  const relativePath = String(contentUrl).startsWith(prefix)
    ? String(contentUrl).slice(prefix.length)
    : null;

  if (!relativePath) {
    return;
  }

  const parts = relativePath.split("/");
  if (parts.length < 2) return;

  const folderName = parts[0];
  const filename = parts[1];
  const filePathInBucket = `${folderName}/${filename}`;

  // Delete from Supabase if configured
  if (supabaseService.isConfigured()) {
    try {
      await supabaseService.deleteFile("expert-resources", filePathInBucket);
    } catch (err) {
      console.error("Failed to delete file from Supabase:", err);
    }
  }

  // Fallback / legacy local cleanup
  const localFolder = path.join(uploadsDir, folderName);
  if (fs.existsSync(localFolder)) {
    try {
      fs.rmSync(localFolder, { recursive: true, force: true });
    } catch (err) {
      console.error("Failed to delete local folder:", err);
    }
  }
}

async function loadResourceForUser(resourceId, user) {
  const result = await query(
    `SELECT id, author_id, content_url, title, type, category, summary, visibility
     FROM resources
     WHERE id = $1`,
    [resourceId],
  );

  if (!result.rowCount) {
    return null;
  }

  const resource = result.rows[0];
  const isOwner = String(resource.author_id) === String(user.id);
  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) {
    const error = new Error("You can only manage your own resources");
    error.statusCode = 403;
    throw error;
  }

  return resource;
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

    // If the request is unauthenticated, only return publicly visible resources
    if (!req.headers || !req.headers.authorization) {
      values.push("public");
      filters.push(`r.visibility = $${values.length}`);
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

router.get("/me", requireAuth, ensureExpert, async (req, res, next) => {
  try {
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
      WHERE r.author_id = $1
      ORDER BY r.created_at DESC`,
      [req.user.id],
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
      const { title, category, summary, type, visibility, videoUrl, audioUrl } =
        req.body || {};

      if (!title) {
        return res.status(400).json({
          status: "error",
          message: "Title is required",
        });
      }

      const hasUrlForType =
        (type === "VIDEO" && videoUrl) || (type === "AUDIO" && audioUrl);

      if (!req.file && !hasUrlForType) {
        return res.status(400).json({
          status: "error",
          message:
            "A document file or a valid URL (for video/audio) is required",
        });
      }

      let fileUrl = videoUrl || audioUrl || null;
      if (req.file) {
        const folderName = `resource-${Date.now()}`;
        const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${Date.now()}-${sanitized}`;
        const filePath = `${folderName}/${filename}`;

        if (supabaseService.isConfigured()) {
          await supabaseService.uploadFile("expert-resources", filePath, req.file.buffer, req.file.mimetype);
        } else {
          // Local fallback
          const localFolder = path.join(uploadsDir, folderName);
          if (!fs.existsSync(localFolder)) {
            fs.mkdirSync(localFolder, { recursive: true });
          }
          fs.writeFileSync(path.join(localFolder, filename), req.file.buffer);
        }

        fileUrl = `/api/uploads/resources/${filePath}`;
      }

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

router.patch(
  "/:id",
  requireAuth,
  ensureExpert,
  upload.single("document"),
  async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const existingResource = await loadResourceForUser(resourceId, req.user);

      if (!existingResource) {
        return res.status(404).json({
          status: "error",
          message: "Resource not found",
        });
      }

      const { title, category, summary, type, visibility } = req.body || {};

      if (!title && !existingResource.title) {
        return res.status(400).json({
          status: "error",
          message: "Resource title is required",
        });
      }

      let nextContentUrl = req.body.videoUrl || req.body.audioUrl || existingResource.content_url;
      if (req.file) {
        const folderName = `resource-${Date.now()}`;
        const sanitized = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${Date.now()}-${sanitized}`;
        const filePath = `${folderName}/${filename}`;

        if (supabaseService.isConfigured()) {
          await supabaseService.uploadFile("expert-resources", filePath, req.file.buffer, req.file.mimetype);
        } else {
          // Local fallback
          const localFolder = path.join(uploadsDir, folderName);
          if (!fs.existsSync(localFolder)) {
            fs.mkdirSync(localFolder, { recursive: true });
          }
          fs.writeFileSync(path.join(localFolder, filename), req.file.buffer);
        }

        nextContentUrl = `/api/uploads/resources/${filePath}`;
      }

      const updateResult = await query(
        `UPDATE resources
         SET title = $1,
             type = $2,
             category = $3,
             content_url = $4,
             summary = $5,
             visibility = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, title, type, category, content_url, summary, visibility, created_at, updated_at`,
        [
          (title || existingResource.title).trim(),
          (type || existingResource.type || "GUIDE").toUpperCase(),
          category || null,
          nextContentUrl,
          summary || null,
          visibility || existingResource.visibility || "public",
          resourceId,
        ],
      );

      if (req.file && existingResource.content_url) {
        deleteResourceFromStorage(existingResource.content_url).catch((err) =>
          console.error("Error cleaning up old resource file:", err)
        );
      }

      return res.status(200).json({
        status: "ok",
        message: "Resource updated successfully",
        resource: updateResult.rows[0],
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", requireAuth, ensureExpert, async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const existingResource = await loadResourceForUser(resourceId, req.user);

    if (!existingResource) {
      return res.status(404).json({
        status: "error",
        message: "Resource not found",
      });
    }

    await query("DELETE FROM resources WHERE id = $1", [resourceId]);

    if (existingResource.content_url) {
      deleteResourceFromStorage(existingResource.content_url).catch((err) =>
        console.error("Error deleting resource file:", err)
      );
    }

    return res.status(200).json({
      status: "ok",
      message: "Resource deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
