const { toBaseAmount } = require('./currency');

function mapCurrencyRow(row) {
  if (!row?.id) return null;
  return {
    currencyId: row.id,
    code: row.code,
    symbol: row.symbol,
    rate: Number(row.rate_to_base) || 1,
    decimalPlaces: Number(row.decimal_places) || 2,
    isBase: Boolean(row.is_base),
  };
}

async function resolveAccountCurrencyId(client, tenantId, currencyId) {
  if (currencyId) {
    const result = await client.query(
      `SELECT id FROM currencies WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
      [currencyId, tenantId]
    );
    if (result.rowCount === 0) {
      throw Object.assign(new Error('العملة غير موجودة أو غير نشطة'), { statusCode: 400 });
    }
    return currencyId;
  }

  const base = await client.query(
    `SELECT id FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
    [tenantId]
  );
  if (!base.rows[0]?.id) {
    throw Object.assign(new Error('لم تُعرَّف عملة أساس للعيادة'), { statusCode: 400 });
  }
  return base.rows[0].id;
}

/**
 * عملة الحساب: صندوق/بنك أولاً (مرتبط بالعملة)، ثم العمود المباشر، وإلا الأساس.
 */
async function resolveAccountCurrency(client, accountId) {
  const result = await client.query(
    `SELECT
       COALESCE(c_cb.id, c_ba.id, c_acct.id, c_base.id) AS id,
       COALESCE(c_cb.code, c_ba.code, c_acct.code, c_base.code) AS code,
       COALESCE(c_cb.symbol, c_ba.symbol, c_acct.symbol, c_base.symbol) AS symbol,
       COALESCE(c_cb.rate_to_base, c_ba.rate_to_base, c_acct.rate_to_base, c_base.rate_to_base, 1) AS rate_to_base,
       COALESCE(c_cb.decimal_places, c_ba.decimal_places, c_acct.decimal_places, c_base.decimal_places, 2) AS decimal_places,
       COALESCE(c_cb.is_base, c_ba.is_base, c_acct.is_base, c_base.is_base, TRUE) AS is_base
     FROM chart_of_accounts a
     LEFT JOIN cash_boxes cb ON cb.account_id = a.id AND cb.is_active = TRUE
     LEFT JOIN currencies c_cb ON c_cb.id = cb.currency_id
     LEFT JOIN bank_accounts ba ON ba.chart_account_id = a.id AND ba.is_active = TRUE
     LEFT JOIN currencies c_ba ON c_ba.id = ba.currency_id
     LEFT JOIN currencies c_acct ON c_acct.id = a.currency_id
     LEFT JOIN currencies c_base ON c_base.tenant_id = a.tenant_id AND c_base.is_base = TRUE
     WHERE a.id = $1
     LIMIT 1`,
    [accountId]
  );
  return mapCurrencyRow(result.rows[0]);
}

async function syncChartAccountCurrency(client, accountId, currencyId) {
  if (!accountId || !currencyId) return;
  await client.query(
    `UPDATE chart_of_accounts SET currency_id = $2 WHERE id = $1`,
    [accountId, currencyId]
  );
}

function foreignToBase(foreignAmount, rate, places = 2) {
  return toBaseAmount(Number(foreignAmount) || 0, rate, places);
}

module.exports = {
  resolveAccountCurrency,
  resolveAccountCurrencyId,
  syncChartAccountCurrency,
  foreignToBase,
  mapCurrencyRow,
};
