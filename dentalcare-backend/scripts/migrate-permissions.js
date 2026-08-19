require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function runSqlFile(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`Running ${relativePath}...`);
  await pool.query(sql);
  console.log(`Done: ${relativePath}`);
}

async function main() {
  await runSqlFile('sql/permissions_v0_add_column.sql');
  await runSqlFile('sql/permissions_v1.sql');
  await pool.end();
  console.log('Permissions migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
