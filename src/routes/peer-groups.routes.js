const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const peerGroupsController = require("../controllers/peer-groups.controller");

const router = express.Router();

router.get("/", peerGroupsController.getGroups);
router.post("/", requireAuth, requireAdmin, peerGroupsController.createGroup);
router.get("/:id", peerGroupsController.getGroupById);
router.post("/:id/join", requireAuth, peerGroupsController.joinGroup);
router.post("/:id/leave", requireAuth, peerGroupsController.leaveGroup);
router.get("/:id/messages", peerGroupsController.getMessages);
router.post("/:id/messages", requireAuth, peerGroupsController.postMessage);
router.post("/:id/messages/:messageId/reactions", requireAuth, peerGroupsController.reactToMessage);
router.delete("/:id/messages/:messageId", requireAuth, peerGroupsController.deleteMessage);
router.patch("/:id", requireAuth, requireAdmin, peerGroupsController.updateGroup);
router.delete("/:id", requireAuth, requireAdmin, peerGroupsController.deleteGroup);

module.exports = router;
