require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'tenants_v2_subscription.sql'), 'utf8');
  await pool.query(sql);
  const rows = await pool.query(
    `SELECT name, status, active_from, active_until FROM tenants ORDER BY created_at`
  );
  for (const t of rows.rows) {
    console.log(`${t.name}  ${t.status}  ${t.active_from} → ${t.active_until}`);
  }
  await pool.end();
  console.log('Subscription migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
