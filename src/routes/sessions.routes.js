const express = require("express");
const { requireAuth } = require("../middleware/auth");
const sessionsController = require("../controllers/sessions.controller");

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

router.get("/me", requireAuth, ensureExpert, sessionsController.getMySessions);
router.get("/", sessionsController.getAllSessions);
router.post("/", requireAuth, ensureExpert, sessionsController.createSession);
router.patch("/:id", requireAuth, ensureExpert, sessionsController.updateSessionDetails);
router.post("/:id/book", requireAuth, sessionsController.bookSession);
router.post("/:id/cancel", requireAuth, sessionsController.cancelBooking);
router.delete("/:id", requireAuth, ensureExpert, sessionsController.deleteSession);

module.exports = router;
