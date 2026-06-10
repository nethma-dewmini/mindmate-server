const { checkConnection } = require("../db");

exports.getPing = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "mindmate-server",
    timestamp: new Date().toISOString(),
  });
};

exports.getDbHealth = async (req, res, next) => {
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
};
