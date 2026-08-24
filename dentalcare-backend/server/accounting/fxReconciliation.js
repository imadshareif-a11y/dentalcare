const { resolveAccountCurrency } = require('./accountCurrency');
const { ensureChartAccount } = require('./chartAccounts');
const { toBaseAmount } = require('./currency');

const FX_TOLERANCE = 0.01;
const FX_ACCOUNT_CODE = '5400';
const FX_SOURCE_TYPE = 'FX_REVALUATION';

async function ensureFxGainLossAccount(client, tenantId) {
  const id = await ensureChartAccount(client, tenantId, {
    accountCode: FX_ACCOUNT_CODE,
    accountName: 'فروق العملات',
    accountNameAr: 'فروق العملات',
    accountNameEn: 'FX Gains & Losses',
    accountNameHe: 'הפרשי מט"ח',
    accountType: 'EXPENSE',
  });
  await client.query(
    `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  await client.query(
    `UPDATE tenant_settings
     SET fx_gain_loss_account_id = COALESCE(fx_gain_loss_account_id, $2), updated_at = now()
     WHERE tenant_id = $1`,
    [tenantId, id]
  );
  return id;
}

async function resolveFxGainLossAccountId(client, tenantId) {
  await client.query(
    `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
  const settings = await client.query(
    `SELECT fx_gain_loss_account_id FROM tenant_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  let id = settings.rows[0]?.fx_gain_loss_account_id;
  if (id) {
    const ok = await client.query(
      `SELECT 1 FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
      [id, tenantId]
    );
    if (ok.rowCount > 0) return id;
  }

  const byCode = await client.query(
    `SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2 LIMIT 1`,
    [tenantId, FX_ACCOUNT_CODE]
  );
  if (byCode.rows[0]?.id) {
    id = byCode.rows[0].id;
    await client.query(
      `UPDATE tenant_settings SET fx_gain_loss_account_id = $2, updated_at = now() WHERE tenant_id = $1`,
      [tenantId, id]
    );
    return id;
  }

  return ensureFxGainLossAccount(client, tenantId);
}

async function getAccountBalances(client, tenantId, accountId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(debit), 0) AS debit,
            COALESCE(SUM(credit), 0) AS credit,
            COALESCE(SUM(foreign_debit), 0) AS foreign_debit,
            COALESCE(SUM(foreign_credit), 0) AS foreign_credit
     FROM journal_entry_lines
     WHERE account_id = $1 AND tenant_id = $2`,
    [accountId, tenantId]
  );
  const row = result.rows[0];
  return {
    baseNet: Number(row.debit) - Number(row.credit),
    foreignNet: Number(row.foreign_debit) - Number(row.foreign_credit),
  };
}

function computeFxDiff(foreignNet, baseNet, rate, places = 2) {
  const expectedBase = toBaseAmount(foreignNet, rate, places);
  const diff = Math.round((expectedBase - baseNet) * 100) / 100;
  if (Math.abs(diff) < FX_TOLERANCE) return 0;
  return diff;
}

async function listForeignMonetaryAccounts(client, tenantId) {
  const result = await client.query(
    `SELECT DISTINCT account_id FROM (
       SELECT cb.account_id
       FROM cash_boxes cb
       JOIN currencies c ON c.id = cb.currency_id AND c.tenant_id = cb.tenant_id
       WHERE cb.tenant_id = $1 AND cb.is_active = TRUE AND c.is_base = FALSE
       UNION
       SELECT ba.chart_account_id AS account_id
       FROM bank_accounts ba
       JOIN currencies c ON c.id = ba.currency_id AND c.tenant_id = ba.tenant_id
       WHERE ba.tenant_id = $1 AND ba.is_active = TRUE AND c.is_base = FALSE
     ) sub
     WHERE account_id IS NOT NULL`,
    [tenantId]
  );
  return result.rows.map((row) => row.account_id);
}

async function insertFxJournalEntry(client, {
  tenantId,
  userId,
  accountId,
  fxAccountId,
  diff,
  triggerEntryId,
  memo,
  entryDate,
}) {
  const abs = Math.abs(diff);
  const cashLine = diff > 0
    ? { accountId, debit: abs, credit: 0 }
    : { accountId, debit: 0, credit: abs };
  const fxLine = diff > 0
    ? { accountId: fxAccountId, debit: 0, credit: abs }
    : { accountId: fxAccountId, debit: abs, credit: 0 };

  const lineMemo = memo || 'تسوية فروق عملة';
  const entryResult = await client.query(
    `INSERT INTO journal_entries
       (tenant_id, source_type, source_ref_id, memo, created_by, currency_id, exchange_rate, entry_date)
     VALUES ($1, $2, $3, $4, $5, NULL, 1, COALESCE($6::date, CURRENT_DATE))
     RETURNING id`,
    [tenantId, FX_SOURCE_TYPE, triggerEntryId || null, lineMemo, userId, entryDate || null]
  );
  const journalEntryId = entryResult.rows[0].id;

  for (const line of [cashLine, fxLine]) {
    await client.query(
      `INSERT INTO journal_entry_lines
         (tenant_id, journal_entry_id, account_id, debit, credit, line_memo,
          currency_id, exchange_rate, foreign_debit, foreign_credit)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, 1, 0, 0)`,
      [tenantId, journalEntryId, line.accountId, line.debit, line.credit, lineMemo]
    );
  }

  return {
    journalEntryId,
    amount: abs,
    direction: diff > 0 ? 'gain' : 'loss',
  };
}

async function reconcileAccountFx(client, {
  tenantId,
  userId,
  accountId,
  triggerEntryId,
  memo,
  entryDate,
}) {
  const currency = await resolveAccountCurrency(client, accountId);
  if (!currency || currency.isBase) return null;

  const { baseNet, foreignNet } = await getAccountBalances(client, tenantId, accountId);
  const diff = computeFxDiff(foreignNet, baseNet, currency.rate, currency.decimalPlaces);
  if (diff === 0) return null;

  const fxAccountId = await resolveFxGainLossAccountId(client, tenantId);
  if (!fxAccountId) {
    console.warn(`[fx] skipped tenant ${tenantId}: no FX account configured`);
    return null;
  }

  return insertFxJournalEntry(client, {
    tenantId,
    userId,
    accountId,
    fxAccountId,
    diff,
    triggerEntryId,
    memo,
    entryDate,
  });
}

async function reconcileAfterJournalEntry(client, {
  tenantId,
  userId,
  journalEntryId,
  lines,
  sourceType,
  entryDate,
}) {
  if (sourceType === FX_SOURCE_TYPE) return [];

  const accountIds = [...new Set((lines || []).map((line) => line.accountId).filter(Boolean))];
  const foreignAccountIds = [];
  for (const accountId of accountIds) {
    const currency = await resolveAccountCurrency(client, accountId);
    if (currency && !currency.isBase) foreignAccountIds.push(accountId);
  }

  const results = [];
  for (const accountId of foreignAccountIds) {
    const adjustment = await reconcileAccountFx(client, {
      tenantId,
      userId,
      accountId,
      triggerEntryId: journalEntryId,
      memo: 'تسوية فروق عملة بعد ترحيل',
      entryDate,
    });
    if (adjustment) results.push(adjustment);
  }
  return results;
}

async function reconcileAllForeignAccounts(client, { tenantId, userId, memo, entryDate }) {
  const accountIds = await listForeignMonetaryAccounts(client, tenantId);
  const results = [];
  for (const accountId of accountIds) {
    const adjustment = await reconcileAccountFx(client, {
      tenantId,
      userId,
      accountId,
      triggerEntryId: null,
      memo: memo || 'تسوية فروق بعد تحديث أسعار الصرف',
      entryDate,
    });
    if (adjustment) results.push(adjustment);
  }
  return results;
}

module.exports = {
  FX_TOLERANCE,
  FX_SOURCE_TYPE,
  ensureFxGainLossAccount,
  resolveFxGainLossAccountId,
  computeFxDiff,
  getAccountBalances,
  reconcileAccountFx,
  reconcileAfterJournalEntry,
  reconcileAllForeignAccounts,
  listForeignMonetaryAccounts,
};
