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

// Initialize database tables/indexes needed for verification
pool.query(`
  CREATE TABLE IF NOT EXISTS registration_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    registration_no VARCHAR(50) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_registration_otps_email_reg ON registration_otps (email, registration_no);
`).catch(err => console.error("Error creating registration_otps table:", err));

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
