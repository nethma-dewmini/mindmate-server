const fs = require("fs");
const path = require("path");
const supabaseService = require("../utils/supabaseService");
const Resource = require("../models/Resource");

const uploadsDir = path.join(__dirname, "../../uploads/resources");

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

  if (supabaseService.isConfigured()) {
    try {
      await supabaseService.deleteFile("expert-resources", filePathInBucket);
    } catch (err) {
      console.error("Failed to delete file from Supabase:", err);
    }
  }

  const localFolder = path.join(uploadsDir, folderName);
  if (fs.existsSync(localFolder)) {
    try {
      fs.rmSync(localFolder, { recursive: true, force: true });
    } catch (err) {
      console.error("Failed to delete local folder:", err);
    }
  }
}

exports.getResources = async (req, res, next) => {
  try {
    const { authorRole, category, type } = req.query || {};
    const filters = { authorRole, category, type };

    if (!req.headers || !req.headers.authorization) {
      filters.isPublic = true;
    }

    const data = await Resource.getAll(filters);

    return res.status(200).json({
      status: "ok",
      count: data.count,
      resources: data.resources.map(mapResourceRow),
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyResources = async (req, res, next) => {
  try {
    const data = await Resource.getAllByAuthor(req.user.id);

    return res.status(200).json({
      status: "ok",
      count: data.count,
      resources: data.resources.map(mapResourceRow),
    });
  } catch (error) {
    next(error);
  }
};

exports.createResource = async (req, res, next) => {
  try {
    const { title, category, summary, type, visibility, videoUrl, audioUrl } = req.body || {};

    if (!title) {
      return res.status(400).json({
        status: "error",
        message: "Title is required",
      });
    }

    const hasUrlForType = (type === "VIDEO" && videoUrl) || (type === "AUDIO" && audioUrl);

    if (!req.file && !hasUrlForType) {
      return res.status(400).json({
        status: "error",
        message: "A document file or a valid URL (for video/audio) is required",
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
        const localFolder = path.join(uploadsDir, folderName);
        if (!fs.existsSync(localFolder)) {
          fs.mkdirSync(localFolder, { recursive: true });
        }
        fs.writeFileSync(path.join(localFolder, filename), req.file.buffer);
      }

      fileUrl = `/api/uploads/resources/${filePath}`;
    }

    const resource = await Resource.create({
      title: title.trim(),
      authorId: req.user.id,
      type: type || "GUIDE",
      category: category || null,
      contentUrl: fileUrl,
      summary: summary || null,
      visibility: visibility || "public"
    });

    return res.status(201).json({
      status: "ok",
      message: "Resource uploaded successfully",
      resource: mapResourceRow(resource),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateResource = async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const existingResource = await Resource.findById(resourceId);

    if (!existingResource) {
      return res.status(404).json({
        status: "error",
        message: "Resource not found",
      });
    }

    const isOwner = String(existingResource.author_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own resources"
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
        const localFolder = path.join(uploadsDir, folderName);
        if (!fs.existsSync(localFolder)) {
          fs.mkdirSync(localFolder, { recursive: true });
        }
        fs.writeFileSync(path.join(localFolder, filename), req.file.buffer);
      }

      nextContentUrl = `/api/uploads/resources/${filePath}`;
    }

    const updatedResource = await Resource.update(resourceId, {
      title: (title || existingResource.title).trim(),
      type: (type || existingResource.type || "GUIDE").toUpperCase(),
      category: category || null,
      contentUrl: nextContentUrl,
      summary: summary || null,
      visibility: visibility || existingResource.visibility || "public"
    });

    if (req.file && existingResource.content_url) {
      deleteResourceFromStorage(existingResource.content_url).catch((err) =>
        console.error("Error cleaning up old resource file:", err)
      );
    }

    return res.status(200).json({
      status: "ok",
      message: "Resource updated successfully",
      resource: mapResourceRow(updatedResource),
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteResource = async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const existingResource = await Resource.findById(resourceId);

    if (!existingResource) {
      return res.status(404).json({
        status: "error",
        message: "Resource not found",
      });
    }

    const isOwner = String(existingResource.author_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only manage your own resources"
      });
    }

    await Resource.delete(resourceId);

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
};
