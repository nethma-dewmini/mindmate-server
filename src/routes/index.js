const express = require("express");
const healthRouter = require("./health.routes");
const expertsRouter = require("./experts.routes");
const authRouter = require("./auth.routes");
const applicationsRouter = require("./expert-applications.routes");

const router = express.Router();

router.use("/health", healthRouter);
router.use("/experts", expertsRouter);
router.use("/auth", authRouter);
router.use("/expert-applications", applicationsRouter);

module.exports = router;
