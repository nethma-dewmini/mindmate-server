const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const resourcesController = require("../controllers/resources.controller");

const router = express.Router();

const uploadsDir = path.join(__dirname, "../../uploads/resources");

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.warn("Could not create local uploads directory (this is normal on read-only serverless environments like Vercel):", err.message);
  }
}

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

router.get("/", resourcesController.getResources);
router.get("/me", requireAuth, ensureExpert, resourcesController.getMyResources);
router.post("/", requireAuth, ensureExpert, upload.single("document"), resourcesController.createResource);
router.patch("/:id", requireAuth, ensureExpert, upload.single("document"), resourcesController.updateResource);
router.delete("/:id", requireAuth, ensureExpert, resourcesController.deleteResource);

module.exports = router;
