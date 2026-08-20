require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, withTenantClient } = require('../server/db/pool');
const { ensureBoxesForAllCurrencies } = require('../server/accounting/cashBoxes');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'cash_boxes_v1.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Running cash_boxes_v1.sql...');
  await pool.query(sql);

  const tenants = await pool.query(`SELECT id FROM tenants`);
  for (const t of tenants.rows) {
    console.log(`Seeding cash boxes for tenant ${t.id}...`);
    await withTenantClient(t.id, async (client) => {
      await ensureBoxesForAllCurrencies(client, t.id);
    });
  }

  await pool.end();
  console.log('Cash boxes migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
