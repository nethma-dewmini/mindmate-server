const express = require("express");
const multer = require("multer");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const expertApplicationsController = require("../controllers/expert-applications.controller");

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max per file
  fileFilter: (req, file, cb) => {
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

router.post("/apply", upload.array("documents", 10), expertApplicationsController.apply);
router.get("/status", expertApplicationsController.getStatus);
router.get("/:id", requireAuth, requireAdmin, expertApplicationsController.getById);
router.get("/", requireAuth, requireAdmin, expertApplicationsController.getAll);
router.patch("/:id", requireAuth, requireAdmin, expertApplicationsController.updateStatus);

module.exports = router;
