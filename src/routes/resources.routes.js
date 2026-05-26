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

function getResourceFolderFromUrl(contentUrl) {
  if (!contentUrl) {
    return null;
  }

  const prefix = "/api/uploads/resources/";
  const relativePath = String(contentUrl).startsWith(prefix)
    ? String(contentUrl).slice(prefix.length)
    : null;

  if (!relativePath) {
    return null;
  }

  const [folderName] = relativePath.split("/");
  return folderName ? path.join(uploadsDir, folderName) : null;
}

function removeFolderIfExists(folderPath) {
  if (folderPath && fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
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

      const nextContentUrl = req.file
        ? `/api/uploads/resources/${path.basename(req.resourceFolder)}/${req.file.filename}`
        : existingResource.content_url;

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

      if (req.file) {
        const previousFolder = getResourceFolderFromUrl(
          existingResource.content_url,
        );
        const nextFolder = getResourceFolderFromUrl(nextContentUrl);

        if (previousFolder && previousFolder !== nextFolder) {
          removeFolderIfExists(previousFolder);
        }
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

    const resourceFolder = getResourceFolderFromUrl(
      existingResource.content_url,
    );
    removeFolderIfExists(resourceFolder);

    return res.status(200).json({
      status: "ok",
      message: "Resource deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
