const express = require("express");
const { requireAuth } = require("../middleware/auth");
const moodsController = require("../controllers/moods.controller");

const router = express.Router();

router.use(requireAuth);

router.get("/summary", moodsController.getSummary);
router.get("/", moodsController.getMoods);
router.get("/:id", moodsController.getMoodById);
router.post("/", moodsController.createMood);
router.put("/:id", moodsController.updateMood);
router.delete("/:id", moodsController.deleteMood);

module.exports = router;
