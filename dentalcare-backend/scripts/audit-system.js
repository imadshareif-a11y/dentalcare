require('dotenv').config();
const { pool, withTenantClient } = require('../server/db/pool');
const { ensureTenantIsolation } = require('../server/db/ensureTenantIsolation');

async function main() {
  console.log('=== DentalCare system audit ===\n');

  await ensureTenantIsolation();
  console.log('OK ensureTenantIsolation');

  const tenants = await pool.query('SELECT id, name, status FROM tenants ORDER BY created_at ASC NULLS LAST');
  console.log(`\nTenants: ${tenants.rowCount}`);
  for (const row of tenants.rows) {
    console.log(`  - ${row.name} (${row.id}) status=${row.status}`);
  }

  const rls = await pool.query(
    `SELECT COUNT(DISTINCT tablename)::int AS tables
     FROM pg_policies
     WHERE schemaname = 'public' AND policyname LIKE 'tenant_isolation_%'`
  );
  console.log(`\nRLS tenant policies on ${rls.rows[0].tables} tables`);

  const tablesWithTenant = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'`
  );
  console.log(`Tables with tenant_id column: ${tablesWithTenant.rows[0].cnt}`);

  if (tenants.rowCount >= 1) {
    const tenantId = tenants.rows[0].id;
    const fakeId = '00000000-0000-0000-0000-000000000099';

    const blocked = await withTenantClient(tenantId, async (client) => {
      const r = await client.query('SELECT id FROM parties WHERE id = $1', [fakeId]);
      return r.rowCount;
    });
    console.log(`\nCross-tenant fake UUID read blocked: ${blocked === 0 ? 'YES' : 'NO'}`);

    const ownPatients = await withTenantClient(tenantId, async (client) => {
      const r = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT'`,
        [tenantId]
      );
      return r.rows[0].cnt;
    });
    console.log(`Patients in first tenant: ${ownPatients}`);
  }

  if (tenants.rowCount >= 2) {
    const [a, b] = tenants.rows;
    const patientB = await withTenantClient(b.id, async (client) => {
      const r = await client.query(
        `SELECT id FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT' LIMIT 1`,
        [b.id]
      );
      return r.rows[0]?.id || null;
    });

    if (patientB) {
      const leak = await withTenantClient(a.id, async (client) => {
        const r = await client.query('SELECT id FROM parties WHERE id = $1', [patientB]);
        return r.rowCount;
      });
      console.log(`\nTenant A reading Tenant B patient: ${leak === 0 ? 'BLOCKED' : 'LEAK!'}`);
    }
  } else {
    console.log('\nTwo-tenant live test skipped (need 2+ tenants for full cross-clinic test)');
  }

  console.log('\n=== Audit complete ===');
  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
