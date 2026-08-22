// db/ensureUsersAvatar.js — أعمدة صورة الحساب على users
const { pool } = require('./pool');

let ensured = false;

const ENSURE_USERS_AVATAR_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_bytes BYTEA;
`;

async function ensureUsersAvatarSchema() {
  if (ensured) return;
  await pool.query(ENSURE_USERS_AVATAR_SQL);
  ensured = true;
}

module.exports = { ensureUsersAvatarSchema };
