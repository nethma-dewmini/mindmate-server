const express = require("express");
const healthRouter = require("./health.routes");
const expertsRouter = require("./experts.routes");
const authRouter = require("./auth.routes");
const applicationsRouter = require("./expert-applications.routes");
const peerGroupsRouter = require("./peer-groups.routes");
const moodsRouter = require("./moods.routes");
const assessmentsRouter = require("./assessments.routes");
const unistudentsRouter = require("./unistudents.routes");
const studentRegistryRouter = require("./student-registry.routes");
const resourcesRouter = require("./resources.routes");
const sessionsRouter = require("./sessions.routes");

const router = express.Router();

router.use("/health", healthRouter);
router.use("/experts", expertsRouter);
router.use("/auth", authRouter);
router.use("/expert-applications", applicationsRouter);
router.use("/peer-groups", peerGroupsRouter);
router.use("/assessments", assessmentsRouter);
router.use("/moods", moodsRouter);
router.use("/unistudents", unistudentsRouter);
router.use("/student-registry", studentRegistryRouter);
router.use("/resources", resourcesRouter);
router.use("/sessions", sessionsRouter);

module.exports = router;
