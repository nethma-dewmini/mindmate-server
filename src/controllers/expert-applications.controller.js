const fs = require("fs");
const {
  sendExpertApplicationAdminNotification,
  sendExpertApplicationApprovedEmail,
} = require("../utils/emailService");
const supabaseService = require("../utils/supabaseService");
const ExpertApplication = require("../models/ExpertApplication");

exports.apply = async (req, res, next) => {
  let folderName = "";
  try {
    const { name, title, email, specialization } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ status: "error", message: "name and email are required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "error", message: "At least one document is required" });
    }

    const existing = await ExpertApplication.findPendingByEmail(email);
    if (existing) {
      return res.status(409).json({
        status: "error",
        message: "You already have a pending application. Please wait for admin review.",
      });
    }

    folderName = `app-${Date.now()}`;
    const documents = [];

    if (supabaseService.isConfigured()) {
      for (const file of req.files) {
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${folderName}/${sanitized}`;

        await supabaseService.uploadFile("expert-applications", filePath, file.buffer, file.mimetype);

        documents.push({
          name: file.originalname,
          path: `/api/uploads/expert-applications/${filePath}`,
          relativePath: `expert-applications/${folderName}/${sanitized}`,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }
    } else {
      const path = require("path");
      const uploadsDir = path.join(__dirname, "../../uploads/expert-applications");
      const appFolder = path.join(uploadsDir, folderName);
      if (!fs.existsSync(appFolder)) {
        fs.mkdirSync(appFolder, { recursive: true });
      }
      req.appFolder = appFolder;

      for (const file of req.files) {
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const localFilePath = path.join(appFolder, sanitized);

        fs.writeFileSync(localFilePath, file.buffer);

        documents.push({
          name: file.originalname,
          path: localFilePath,
          relativePath: `expert-applications/${folderName}/${sanitized}`,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    const application = await ExpertApplication.create({ name, title, email, specialization, documents });

    sendExpertApplicationAdminNotification({
      name: application.name,
      title: application.title,
      email: application.email,
      specialization: specialization || null,
    }).catch((err) => console.error("Error sending admin notification email:", err));

    return res.status(201).json({
      status: "ok",
      message: "Application submitted successfully. Admin will review shortly.",
      application: { ...application, filesCount: documents.length },
    });
  } catch (err) {
    if (supabaseService.isConfigured() && folderName) {
      for (const file of req.files || []) {
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${folderName}/${sanitized}`;
        supabaseService.deleteFile("expert-applications", filePath).catch(() => {});
      }
    } else if (req.appFolder && fs.existsSync(req.appFolder)) {
      fs.rmSync(req.appFolder, { recursive: true });
    }
    next(err);
  }
};

exports.getStatus = async (req, res, next) => {
  try {
    const { email } = req.query || {};

    if (!email) {
      return res.status(400).json({ status: "error", message: "email is required" });
    }

    const application = await ExpertApplication.getLatestStatusByEmail(email);

    if (!application) {
      return res.status(404).json({ status: "error", message: "No expert application found for this email" });
    }

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const application = await ExpertApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ status: "error", message: "Application not found" });
    }

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const applications = await ExpertApplication.getAll(req.query.status);
    const summary = await ExpertApplication.getStatusSummary();

    return res.status(200).json({
      status: "ok",
      count: applications.length,
      applications,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body || {};

    const normalized = String(status || "").toLowerCase().trim();
    if (!["pending", "approved", "rejected"].includes(normalized)) {
      return res.status(400).json({ status: "error", message: "Invalid status" });
    }

    const adminId = req.user && req.user.id ? req.user.id : null;
    const application = await ExpertApplication.updateStatus(id, normalized, admin_notes, adminId);

    if (!application) {
      return res.status(404).json({ status: "error", message: "Application not found" });
    }

    if (normalized === "approved") {
      sendExpertApplicationApprovedEmail(application.email, application.name).catch((err) =>
        console.error("Error sending expert approval email:", err)
      );
    } else if (normalized === "rejected") {
      const db = require('../db');
      await db.query("DELETE FROM unistudents WHERE LOWER(email) = LOWER($1) AND role = 'expert'", [application.email]);
    }

    return res.status(200).json({ status: "ok", application });
  } catch (err) {
    next(err);
  }
};
