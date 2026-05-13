require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || "mindmate",
  user: process.env.DB_USER || "postgres",
  password:
    typeof process.env.DB_PASSWORD === "string" ? process.env.DB_PASSWORD : "",
});

async function query(text, params) {
  return pool.query(text, params);
}

async function checkConnection() {
  const result = await query("SELECT NOW() AS now");
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  checkConnection,
};
