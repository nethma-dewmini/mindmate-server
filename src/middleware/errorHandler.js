function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  res.status(statusCode).json({
    message: err.message || "Internal server error",
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
