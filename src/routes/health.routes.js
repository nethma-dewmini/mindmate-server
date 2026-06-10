const express = require("express");
const healthController = require("../controllers/health.controller");

const router = express.Router();

router.get("/", healthController.getPing);
router.get("/db", healthController.getDbHealth);

module.exports = router;
