require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'tenants_v1_slug.sql'), 'utf8');
  await pool.query(sql);
  const rows = await pool.query('SELECT name, slug, status FROM tenants ORDER BY created_at');
  console.log('Tenants:');
  for (const t of rows.rows) {
    console.log(`  ${t.slug}  ${t.status}  ${t.name}`);
  }
  await pool.end();
  console.log('Slug migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
