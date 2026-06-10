const express = require("express");
const expertsController = require("../controllers/experts.controller");

const router = express.Router();

router.get("/", expertsController.getExperts);
router.get("/:id", expertsController.getExpertById);

module.exports = router;
