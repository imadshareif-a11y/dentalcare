require('dotenv').config();
const { pool, withSystemClient } = require('../server/db/pool');
const { buildCashMovementLines } = require('../server/accounting/voucherLines');
const { resolveCurrencyContext } = require('../server/accounting/currency');

async function main() {
  await withSystemClient(async (client) => {
    await client.query('BEGIN');
    const tenant = await client.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error('no tenant');

    const usd = await client.query(
      `SELECT id, rate_to_base FROM currencies WHERE tenant_id = $1 AND code = 'USD' LIMIT 1`,
      [tenantId]
    );
    const box = await client.query(
      `SELECT account_id FROM cash_boxes
       WHERE tenant_id = $1 AND currency_id = $2 AND box_kind = 'CASH' LIMIT 1`,
      [tenantId, usd.rows[0]?.id]
    );
    const patient = await client.query(
      `SELECT account_id FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT' LIMIT 1`,
      [tenantId]
    );

    if (!usd.rows[0] || !box.rows[0] || !patient.rows[0]) {
      console.log('skipped: need USD cash box and patient');
      await client.query('ROLLBACK');
      return;
    }

    const currency = await resolveCurrencyContext(tenantId, usd.rows[0].id);
    const lines = await buildCashMovementLines(client, {
      cashAccountId: box.rows[0].account_id,
      counterAccountId: patient.rows[0].account_id,
      foreignAmount: 20,
      direction: 'IN',
      currencyContext: currency,
    });

    const cash = lines[0];
    const party = lines[1];
    console.log('USD rate:', currency.rate);
    console.log('cash foreignDebit:', cash.foreignDebit, 'cash debit (base):', cash.debit);
    console.log('party credit (base):', party.credit);

    if (cash.foreignDebit !== 20) throw new Error('cash foreign amount wrong');
    if (cash.debit !== party.credit) throw new Error('base amounts not balanced');
    if (Math.abs(cash.debit - 20 * currency.rate) > 0.02) {
      throw new Error(`base conversion wrong: ${cash.debit} vs ${20 * currency.rate}`);
    }

    console.log('voucher line test passed');
    await client.query('ROLLBACK');
  });
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
