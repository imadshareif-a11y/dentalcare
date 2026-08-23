const { pool } = require('./pool');

let ensured = false;

const ENSURE_SQL = `
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_currency
  ON chart_of_accounts (tenant_id, currency_id);
`;

/** صناديق/بنوك: عملة الحساب = عملة الصندوق أو البنك */
const REPAIR_LINKED_CURRENCY_SQL = `
UPDATE chart_of_accounts a
SET currency_id = cb.currency_id
FROM cash_boxes cb
WHERE cb.account_id = a.id
  AND cb.is_active = TRUE
  AND a.currency_id IS DISTINCT FROM cb.currency_id;

UPDATE chart_of_accounts a
SET currency_id = ba.currency_id
FROM bank_accounts ba
WHERE ba.chart_account_id = a.id
  AND ba.is_active = TRUE
  AND ba.currency_id IS NOT NULL
  AND a.currency_id IS DISTINCT FROM ba.currency_id;
`;

async function repairLinkedAccountCurrencies(client = pool) {
  await client.query(REPAIR_LINKED_CURRENCY_SQL);
}

async function ensureChartAccountCurrencySchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);
  await repairLinkedAccountCurrencies();
  ensured = true;
}

module.exports = {
  ensureChartAccountCurrencySchema,
  repairLinkedAccountCurrencies,
};
