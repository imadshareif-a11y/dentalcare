require('dotenv').config();
const { pool, withSystemClient } = require('../server/db/pool');
const { resolveAccountCurrency, ledgerLineAmounts, ledgerNetBalance } = require('../server/accounting/accountCurrency');

async function main() {
  await withSystemClient(async (client) => {
    const tenant = await client.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenant.rows[0]?.id;
    const box = await client.query(
      `SELECT cb.account_id, c.code, c.is_base
       FROM cash_boxes cb
       JOIN currencies c ON c.id = cb.currency_id
       WHERE cb.tenant_id = $1 AND c.code = 'USD' AND cb.box_kind = 'CASH'
       LIMIT 1`,
      [tenantId]
    );
    if (!box.rows[0]) {
      console.log('skipped: no USD cash box');
      return;
    }

    const accountId = box.rows[0].account_id;
    const currency = await resolveAccountCurrency(client, accountId);
    const useForeign = !currency.isBase;

    const opening = await client.query(
      `SELECT COALESCE(SUM(l.debit), 0) AS debit,
              COALESCE(SUM(l.credit), 0) AS credit,
              COALESCE(SUM(l.foreign_debit), 0) AS foreign_debit,
              COALESCE(SUM(l.foreign_credit), 0) AS foreign_credit
       FROM journal_entry_lines l
       WHERE l.account_id = $1 AND l.tenant_id = $2`,
      [accountId, tenantId]
    );

    const baseNet = Number(opening.rows[0].debit) - Number(opening.rows[0].credit);
    const foreignNet = ledgerNetBalance(opening.rows[0], useForeign);

    console.log('USD box currency:', currency.code, 'useForeign:', useForeign);
    console.log('balance in base (ILS):', baseNet);
    console.log('balance in account currency (USD):', foreignNet);

    if (!useForeign) throw new Error('USD box should not be base');
    console.log('ledger currency test passed');
  });
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
