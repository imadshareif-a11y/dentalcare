require('dotenv').config();
const { pool } = require('../server/db/pool');

async function main() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' ORDER BY ordinal_position`
  );
  console.log('users columns:', cols.rows.map((x) => x.column_name).join(', '));
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
