require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const dir = path.join(__dirname, '..', 'sql');
  for (const file of ['patients_v2_demographics.sql', 'patients_v3_birth_date.sql']) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
  }
  await pool.end();
  console.log('Patient demographics migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
