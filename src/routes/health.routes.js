const express = require("express");
const { checkConnection } = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "mindmate-server",
    timestamp: new Date().toISOString(),
  });
});

router.get("/db", async (req, res, next) => {
  try {
    const nowRow = await checkConnection();

    res.status(200).json({
      status: "ok",
      service: "mindmate-server",
      database: "connected",
      timestamp: nowRow.now,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
