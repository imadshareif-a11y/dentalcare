require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const dir = path.join(__dirname, '..', 'sql');
  for (const file of ['appointments_v1.sql', 'appointments_v2.sql']) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
  }
  await pool.end();
  console.log('Appointments migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
