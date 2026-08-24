require('dotenv').config();
const { pool, withSystemClient } = require('../server/db/pool');
const { bootstrapClinic } = require('../server/tenants/bootstrap');

async function main() {
  await withSystemClient(async (client) => {
    await client.query('BEGIN');
    try {
      const username = `test${Date.now()}`;
      const created = await bootstrapClinic(client, {
        clinicName: 'Test Clinic Bootstrap',
        ownerUsername: username,
        ownerPassword: 'password123',
      });

      const currencies = await client.query(
        'SELECT code, is_base FROM currencies WHERE tenant_id = $1',
        [created.tenantId]
      );
      const accounts = await client.query(
        'SELECT COUNT(*)::int AS n FROM chart_of_accounts WHERE tenant_id = $1',
        [created.tenantId]
      );

      console.log('bootstrap OK');
      console.log('  slug:', created.slug);
      console.log('  currencies:', currencies.rows);
      console.log('  accounts:', accounts.rows[0].n);

      await client.query('ROLLBACK');
      console.log('rolled back (no data kept)');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
  await pool.end();
}

main().catch((err) => {
  console.error('bootstrap test failed:', err.message);
  process.exit(1);
});
