const db = require('./src/db');

async function migrate() {
  try {
    await db.query(`
      ALTER TABLE unistudents 
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;
    `);
    console.log("Migration successful");
  } catch (err) {
    console.error("Migration failed", err);
  } finally {
    process.exit(0);
  }
}

migrate();
