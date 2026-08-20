require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'tenant_ai_provider_v1.sql');
  console.log('Running tenant_ai_provider_v1.sql...');
  await pool.query(fs.readFileSync(sqlPath, 'utf8'));
  await pool.end();
  console.log('Tenant AI provider migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
