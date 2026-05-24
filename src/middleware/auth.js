const jwt = require("jsonwebtoken");

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Authorization token is required",
      });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_jwt_secret",
    );

    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token",
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      status: "error",
      message: "Authorization token is required",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Admin access required",
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};
