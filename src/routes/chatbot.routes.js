const express = require("express");
const { requireAuth } = require("../middleware/auth");
const chatbotController = require("../controllers/chatbot.controller");

const router = express.Router();

function requireStudent(req, res, next) {
  if (req.user?.role !== "student") {
    return res.status(403).json({
      status: "error",
      message: "Only students are allowed to access the AI Chatbot companion",
    });
  }
  return next();
}

router.use(requireAuth);
router.use(requireStudent);

router.get("/sessions", chatbotController.getSessions);
router.post("/sessions", chatbotController.createSession);
router.delete("/sessions/:id", chatbotController.deleteSession);
router.get("/sessions/:id/messages", chatbotController.getMessages);
router.post("/sessions/:id/messages", chatbotController.postMessage);

router.get("/", chatbotController.getBackwardCompatibleSession);
router.post("/", chatbotController.postBackwardCompatibleSession);

module.exports = router;
