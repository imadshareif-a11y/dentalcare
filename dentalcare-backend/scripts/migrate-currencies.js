require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const dir = path.join(__dirname, '..', 'sql');
  for (const file of ['currencies_v1.sql', 'permissions_v3_accounts.sql']) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Running ${file}...`);
    await pool.query(sql);
  }
  await pool.end();
  console.log('Currencies migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
