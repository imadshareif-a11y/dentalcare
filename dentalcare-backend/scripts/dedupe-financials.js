require('dotenv').config();
const { pool } = require('../server/db/pool');
const { dedupeChartAccounts } = require('../server/accounting/chartAccounts');

/** إزالة عملات/صناديق/حسابات مكررة — آمن للتشغيل على Railway بعد seed/migrate متكرر */
async function dedupeTenant(client, tenantId) {
  const report = {
    tenantId,
    accountsRemoved: 0,
    currenciesRemoved: 0,
    boxesRemoved: 0,
    basesFixed: 0,
  };

  report.accountsRemoved = await dedupeChartAccounts(client, tenantId);

  const currencyDupes = await client.query(
    `SELECT code, array_agg(id ORDER BY is_base DESC, created_at ASC, id ASC) AS ids
     FROM currencies
     WHERE tenant_id = $1
     GROUP BY code
     HAVING COUNT(*) > 1`,
    [tenantId]
  );

  for (const row of currencyDupes.rows) {
    const ids = row.ids;
    const keepId = ids[0];
    const removeIds = ids.slice(1);
    for (const removeId of removeIds) {
      await client.query(
        `UPDATE journal_entries SET currency_id = $1
         WHERE tenant_id = $2 AND currency_id = $3`,
        [keepId, tenantId, removeId]
      );
      await client.query(
        `UPDATE checks SET currency_id = $1
         WHERE tenant_id = $2 AND currency_id = $3`,
        [keepId, tenantId, removeId]
      );
      await client.query('DELETE FROM cash_boxes WHERE tenant_id = $1 AND currency_id = $2', [tenantId, removeId]);
      await client.query('DELETE FROM bank_accounts WHERE tenant_id = $1 AND currency_id = $2', [tenantId, removeId]);
      await client.query('DELETE FROM currencies WHERE id = $1 AND tenant_id = $2', [removeId, tenantId]);
      report.currenciesRemoved += 1;
    }
  }

  const bases = await client.query(
    `SELECT id FROM currencies
     WHERE tenant_id = $1 AND is_base = TRUE
     ORDER BY created_at ASC, id ASC`,
    [tenantId]
  );
  if (bases.rowCount > 1) {
    const keepId = bases.rows[0].id;
    for (let i = 1; i < bases.rows.length; i += 1) {
      await client.query('UPDATE currencies SET is_base = FALSE WHERE id = $1', [bases.rows[i].id]);
      report.basesFixed += 1;
    }
    await client.query(
      `UPDATE currencies SET is_base = TRUE, rate_to_base = 1 WHERE id = $1`,
      [keepId]
    );
  }

  if (bases.rowCount === 0) {
    const first = await client.query(
      `SELECT id FROM currencies WHERE tenant_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
      [tenantId]
    );
    if (first.rowCount > 0) {
      await client.query(
        `UPDATE currencies SET is_base = TRUE, rate_to_base = 1 WHERE id = $1`,
        [first.rows[0].id]
      );
    }
  }

  const boxDupes = await client.query(
    `SELECT currency_id, box_kind,
            array_agg(id ORDER BY is_system DESC, created_at ASC, id ASC) AS ids
     FROM cash_boxes
     WHERE tenant_id = $1
     GROUP BY currency_id, box_kind
     HAVING COUNT(*) > 1`,
    [tenantId]
  );

  for (const row of boxDupes.rows) {
    const removeIds = row.ids.slice(1);
    for (const removeId of removeIds) {
      await client.query('DELETE FROM cash_boxes WHERE id = $1 AND tenant_id = $2', [removeId, tenantId]);
      report.boxesRemoved += 1;
    }
  }

  const accountDupes = await client.query(
    `SELECT account_id, array_agg(id ORDER BY is_system DESC, created_at ASC, id ASC) AS ids
     FROM cash_boxes
     WHERE tenant_id = $1
     GROUP BY account_id
     HAVING COUNT(*) > 1`,
    [tenantId]
  );

  for (const row of accountDupes.rows) {
    const removeIds = row.ids.slice(1);
    for (const removeId of removeIds) {
      await client.query('DELETE FROM cash_boxes WHERE id = $1 AND tenant_id = $2', [removeId, tenantId]);
      report.boxesRemoved += 1;
    }
  }

  return report;
}

async function ensureUniqueIndexes() {
  const stmts = [
    `CREATE UNIQUE INDEX IF NOT EXISTS currencies_tenant_code_uq
       ON currencies (tenant_id, code)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base_per_tenant
       ON currencies (tenant_id) WHERE is_base = TRUE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_one_system_per_currency_kind
       ON cash_boxes (tenant_id, currency_id, box_kind) WHERE is_system = TRUE`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_tenant_account_uq
       ON cash_boxes (tenant_id, account_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_tenant_code_uq
       ON chart_of_accounts (tenant_id, account_code)`,
  ];
  for (const sql of stmts) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn('index skip:', err.message);
    }
  }
}

async function main() {
  await ensureUniqueIndexes();

  const tenants = await pool.query('SELECT id, name, slug FROM tenants ORDER BY created_at ASC');
  let totalCurrencies = 0;
  let totalBoxes = 0;
  let totalAccounts = 0;

  for (const tenant of tenants.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const report = await dedupeTenant(client, tenant.id);
      await client.query('COMMIT');
      if (report.accountsRemoved || report.currenciesRemoved || report.boxesRemoved || report.basesFixed) {
        console.log(
          `${tenant.name} (${tenant.slug || tenant.id}): -${report.accountsRemoved} accounts, -${report.currenciesRemoved} currencies, -${report.boxesRemoved} boxes, bases fixed ${report.basesFixed}`
        );
      }
      totalAccounts += report.accountsRemoved;
      totalCurrencies += report.currenciesRemoved;
      totalBoxes += report.boxesRemoved;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed tenant ${tenant.name}:`, err.message);
    } finally {
      client.release();
    }
  }

  console.log(`Done. Removed ${totalAccounts} duplicate accounts, ${totalCurrencies} duplicate currencies, ${totalBoxes} duplicate boxes.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
