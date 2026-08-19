require('dotenv').config();
const { pool } = require('../server/db/pool');

async function main() {
  const users = await pool.query(
    `SELECT username, role, permissions FROM users ORDER BY username`
  );
  for (const u of users.rows) {
    console.log(`${u.username} (${u.role}):`, JSON.stringify(u.permissions));
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
