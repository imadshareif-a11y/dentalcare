const { pool } = require('./pool');

let ensured = false;

async function ensureUserPreferencesSchema() {
  if (ensured) return;
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  ensured = true;
}

module.exports = { ensureUserPreferencesSchema };
