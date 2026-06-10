const Expert = require("../models/Expert");

exports.getExperts = async (req, res, next) => {
  try {
    const verifiedOnly = req.query.verified === "true";
    const data = await Expert.getAll(verifiedOnly);

    res.status(200).json({
      status: "ok",
      count: data.count,
      experts: data.experts,
    });
  } catch (error) {
    next(error);
  }
};

exports.getExpertById = async (req, res, next) => {
  try {
    const expert = await Expert.findById(req.params.id);

    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }

    res.status(200).json({
      status: "ok",
      expert,
    });
  } catch (error) {
    next(error);
  }
};
