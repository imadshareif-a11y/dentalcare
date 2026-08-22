require('dotenv').config();
const { pool } = require('../server/db/pool');

async function tenantStats(client, tenantId) {
  await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

  const accounts = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT trim(account_code))::int AS distinct_codes
     FROM chart_of_accounts
     WHERE tenant_id = $1`,
    [tenantId]
  );
  const dupCodes = await client.query(
    `SELECT trim(account_code) AS account_code, COUNT(*)::int AS n,
            array_agg(id::text ORDER BY created_at NULLS LAST, id) AS ids
     FROM chart_of_accounts
     WHERE tenant_id = $1
     GROUP BY trim(account_code)
     HAVING COUNT(*) > 1
     ORDER BY 1`,
    [tenantId]
  );
  const dupNames = await client.query(
    `SELECT trim(account_code) AS account_code,
            COALESCE(NULLIF(trim(account_name_ar), ''), NULLIF(trim(account_name), '')) AS nm,
            COUNT(*)::int AS n
     FROM chart_of_accounts
     WHERE tenant_id = $1
     GROUP BY trim(account_code),
              COALESCE(NULLIF(trim(account_name_ar), ''), NULLIF(trim(account_name), ''))
     HAVING COUNT(*) > 1
     ORDER BY 1`,
    [tenantId]
  );
  const currencies = await client.query(
    `SELECT id, code, is_base, created_at FROM currencies WHERE tenant_id = $1 ORDER BY code, created_at`,
    [tenantId]
  );
  const dupCur = await client.query(
    `SELECT upper(trim(code)) AS code, COUNT(*)::int AS n
     FROM currencies WHERE tenant_id = $1
     GROUP BY upper(trim(code)) HAVING COUNT(*) > 1`,
    [tenantId]
  );
  const boxes = await client.query(
    `SELECT COUNT(*)::int AS n FROM cash_boxes WHERE tenant_id = $1`,
    [tenantId]
  );

  return {
    accounts: accounts.rows[0],
    dupCodes: dupCodes.rows,
    dupNames: dupNames.rows,
    currencies: currencies.rows,
    dupCur: dupCur.rows,
    boxes: boxes.rows[0].n,
  };
}

async function main() {
  const tenants = await pool.query('SELECT id, name, slug FROM tenants ORDER BY created_at ASC');
  console.log(`Tenants: ${tenants.rowCount}`);

  for (const tenant of tenants.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stats = await tenantStats(client, tenant.id);
      await client.query('ROLLBACK');

      console.log('\n===', tenant.name, `(${tenant.slug || tenant.id})`, '===');
      console.log(
        'Accounts:',
        stats.accounts.total,
        'rows,',
        stats.accounts.distinct_codes,
        'distinct codes'
      );
      if (stats.dupCodes.length) {
        console.log('Duplicate account codes:', JSON.stringify(stats.dupCodes, null, 2));
      } else {
        console.log('Duplicate account codes: none');
      }
      if (stats.dupNames.length) {
        console.log('Duplicate code+name:', JSON.stringify(stats.dupNames, null, 2));
      }
      console.log('Currencies:', stats.currencies.length, 'rows');
      stats.currencies.forEach((c) => {
        console.log(`  - ${c.code} id=${c.id} base=${c.is_base}`);
      });
      if (stats.dupCur.length) {
        console.log('Duplicate currency codes:', stats.dupCur);
      }
      console.log('Cash boxes:', stats.boxes);
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
