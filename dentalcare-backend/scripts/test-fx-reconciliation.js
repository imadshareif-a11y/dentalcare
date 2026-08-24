require('dotenv').config();
const { pool, withSystemClient } = require('../server/db/pool');
const { ensureTenantSettingsSchema } = require('../server/db/ensureTenantSettings');
const { buildCashMovementLines } = require('../server/accounting/voucherLines');
const { postJournalEntryWithClient } = require('../server/accounting/engine');
const {
  computeFxDiff,
  getAccountBalances,
  FX_SOURCE_TYPE,
} = require('../server/accounting/fxReconciliation');

async function main() {
  await ensureTenantSettingsSchema();
  await withSystemClient(async (client) => {
    await client.query('BEGIN');

    const tenant = await client.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error('no tenant');

    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

    const user = await client.query(
      `SELECT id FROM users WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error('no user');

    const usd = await client.query(
      `SELECT id FROM currencies WHERE tenant_id = $1 AND code = 'USD' LIMIT 1`,
      [tenantId]
    );
    if (!usd.rows[0]) {
      console.log('skipped: no USD currency');
      await client.query('ROLLBACK');
      return;
    }

    const box = await client.query(
      `SELECT account_id FROM cash_boxes
       WHERE tenant_id = $1 AND currency_id = $2 AND box_kind = 'CASH' LIMIT 1`,
      [tenantId, usd.rows[0].id]
    );
    const patient = await client.query(
      `SELECT account_id FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT' LIMIT 1`,
      [tenantId]
    );
    if (!box.rows[0] || !patient.rows[0]) {
      console.log('skipped: need USD cash box and patient');
      await client.query('ROLLBACK');
      return;
    }

    const cashAccountId = box.rows[0].account_id;
    const counterAccountId = patient.rows[0].account_id;
    let balances;
    let diff;

    await client.query(
      `UPDATE currencies SET rate_to_base = 3.6 WHERE id = $1 AND tenant_id = $2`,
      [usd.rows[0].id, tenantId]
    );

    const receiptLines = await buildCashMovementLines(client, {
      cashAccountId,
      counterAccountId,
      foreignAmount: 100,
      direction: 'IN',
      currencyContext: { rate: 3.6 },
    });

    const receipt = await postJournalEntryWithClient(client, {
      tenantId,
      userId,
      sourceType: 'RECEIPT',
      memo: 'fx test receipt',
      lines: receiptLines,
    });

    balances = await getAccountBalances(client, tenantId, cashAccountId);
    diff = computeFxDiff(balances.foreignNet, balances.baseNet, 3.6, 2);
    if (diff !== 0) {
      throw new Error(`expected balanced after receipt, diff=${diff}`);
    }

    await client.query(
      `UPDATE currencies SET rate_to_base = 3.7 WHERE id = $1 AND tenant_id = $2`,
      [usd.rows[0].id, tenantId]
    );

    const paymentLines = await buildCashMovementLines(client, {
      cashAccountId,
      counterAccountId,
      foreignAmount: 100,
      direction: 'OUT',
      currencyContext: { rate: 3.7 },
    });

    const payment = await postJournalEntryWithClient(client, {
      tenantId,
      userId,
      sourceType: 'PAYMENT',
      memo: 'fx test payment',
      lines: paymentLines,
    });

    if (!payment.fxAdjustments?.length) {
      throw new Error('expected FX adjustment after payment with rate change');
    }

    balances = await getAccountBalances(client, tenantId, cashAccountId);
    diff = computeFxDiff(balances.foreignNet, balances.baseNet, 3.7, 2);
    if (diff !== 0) {
      throw new Error(`expected balanced base after FX adj, diff=${diff}`);
    }

    const fxEntry = await client.query(
      `SELECT 1 FROM journal_entries
       WHERE tenant_id = $1 AND source_type = $2 AND source_ref_id = $3`,
      [tenantId, FX_SOURCE_TYPE, payment.journalEntryId]
    );
    if (fxEntry.rowCount === 0) {
      throw new Error('FX entry not linked to triggering payment');
    }

    const tinyDiff = computeFxDiff(0, 0.005, 3.7, 2);
    if (tinyDiff !== 0) throw new Error('tolerance should ignore tiny diff');

    console.log('fx reconciliation test passed');
    await client.query('ROLLBACK');
  });
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
