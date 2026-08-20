require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'purchase_docs_v1.sql'), 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('Purchase and discount accounts migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
