require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, withTenantClient } = require('../server/db/pool');
const { ensureDefaultCurrentAccount } = require('../server/accounting/bankAccounts');
const { seedStandardBanks } = require('../server/accounting/bankCatalog');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'banks_v1.sql');
  console.log('Running banks_v1.sql...');
  await pool.query(fs.readFileSync(sqlPath, 'utf8'));

  const tenants = await pool.query(`SELECT id FROM tenants`);
  for (const t of tenants.rows) {
    console.log(`Seeding banks catalog + default account for tenant ${t.id}...`);
    await withTenantClient(t.id, async (client) => {
      const result = await seedStandardBanks(client, t.id);
      console.log(`  banks: +${result.inserted} / ~${result.updated} (of ${result.total})`);
      await ensureDefaultCurrentAccount(client, t.id);
    });
  }

  await pool.end();
  console.log('Banks migration completed.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  pool.end();
  process.exit(1);
});
