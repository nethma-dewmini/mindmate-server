require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && !jwtSecret) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is required in production but was not found.");
}

module.exports = {
  JWT_SECRET: jwtSecret || "dev_jwt_secret",
};
