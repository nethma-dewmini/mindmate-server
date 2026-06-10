const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const unistudentsController = require("../controllers/unistudents.controller");

const router = express.Router();

router.get("/profile/me", requireAuth, unistudentsController.getProfile);
router.put("/profile/me", requireAuth, unistudentsController.updateProfile);
router.get("/", requireAuth, requireAdmin, unistudentsController.getStudents);
router.get("/:id", requireAuth, requireAdmin, unistudentsController.getStudentById);

module.exports = router;
