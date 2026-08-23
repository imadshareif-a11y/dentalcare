const { withTenantClient } = require('../db/pool');

function toBaseAmount(amount, rate, places = 2) {
  const n = Number(amount) * Number(rate || 1);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

/**
 * يحمّل عملة المستند (أو الأساس إن لم تُرسل) — دائماً ضمن tenant_id.
 */
async function resolveCurrencyContext(tenantId, currencyId) {
  return withTenantClient(tenantId, async (client) => {
    let row;
    if (currencyId) {
      const result = await client.query(
        `SELECT id, code, symbol, rate_to_base, decimal_places, is_base, is_active
         FROM currencies WHERE id = $1 AND tenant_id = $2`,
        [currencyId, tenantId]
      );
      row = result.rows[0];
      if (!row || !row.is_active) {
        throw Object.assign(new Error('العملة غير موجودة أو غير نشطة'), { statusCode: 400 });
      }
    } else {
      const result = await client.query(
        `SELECT id, code, symbol, rate_to_base, decimal_places, is_base, is_active
         FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
        [tenantId]
      );
      row = result.rows[0];
      if (!row) {
        throw Object.assign(new Error('لم تُعرَّف عملة أساس للعيادة — أضفها من الحسابات/العملات'), { statusCode: 400 });
      }
    }

    return {
      currencyId: row.id,
      code: row.code,
      symbol: row.symbol,
      rate: Number(row.rate_to_base) || 1,
      decimalPlaces: Number(row.decimal_places) || 2,
      isBase: Boolean(row.is_base),
    };
  });
}

async function setBaseCurrency(client, tenantId, currencyId) {
  const existing = await client.query(
    `SELECT id, symbol, decimal_places FROM currencies WHERE id = $1 AND tenant_id = $2`,
    [currencyId, tenantId]
  );
  if (existing.rowCount === 0) {
    throw Object.assign(new Error('العملة غير موجودة'), { statusCode: 404 });
  }
  const currency = existing.rows[0];

  await client.query(
    `UPDATE currencies SET is_base = FALSE WHERE tenant_id = $1 AND is_base = TRUE AND id <> $2`,
    [tenantId, currencyId]
  );
  await client.query(
    `UPDATE currencies
     SET is_base = TRUE, rate_to_base = 1, is_active = TRUE
     WHERE id = $1 AND tenant_id = $2`,
    [currencyId, tenantId]
  );
  await client.query(
    `INSERT INTO tenant_settings (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await client.query(
    `UPDATE tenant_settings
     SET currency_symbol = $2,
         decimal_places = COALESCE($3, decimal_places),
         updated_at = now()
     WHERE tenant_id = $1`,
    [tenantId, String(currency.symbol).slice(0, 8), Number(currency.decimal_places)]
  );
  return currency;
}

module.exports = {
  toBaseAmount,
  resolveCurrencyContext,
  setBaseCurrency,
};
