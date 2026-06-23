const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const studentRegistryController = require("../controllers/student-registry.controller");

const router = express.Router();

router.get("/", requireAuth, requireAdmin, studentRegistryController.getRegistry);
router.post("/", requireAuth, requireAdmin, studentRegistryController.createRegistryEntry);
router.post("/bulk-delete", requireAuth, requireAdmin, studentRegistryController.bulkDeleteRegistryEntries);
router.delete("/:id", requireAuth, requireAdmin, studentRegistryController.deleteRegistryEntry);

module.exports = router;
