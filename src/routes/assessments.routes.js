const express = require("express");
const { requireAuth } = require("../middleware/auth");
const assessmentsController = require("../controllers/assessments.controller");

const router = express.Router();

function ensureExpert(req, res, next) {
  if (req.user?.role !== "expert" && req.user?.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Expert access required",
    });
  }
  return next();
}

router.get("/public", assessmentsController.getPublicAssessments);
router.get("/me", requireAuth, ensureExpert, assessmentsController.getMyAssessments);
router.get("/:id", assessmentsController.getAssessmentById);
router.post("/", requireAuth, ensureExpert, assessmentsController.createAssessment);
router.patch("/:id", requireAuth, ensureExpert, assessmentsController.updateAssessment);
router.delete("/:id", requireAuth, ensureExpert, assessmentsController.deleteAssessment);

module.exports = router;
