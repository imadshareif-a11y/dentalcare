// accounting/chartAccounts.js — منع تكرار الحسابات (نفس الرمز + الاسم)

const { resolveAccountCurrencyId } = require('./accountCurrency');

function normalizeName(value) {
  return String(value || '').trim();
}

function accountNamesMatch(existingRow, name, nameAr) {
  const wanted = normalizeName(nameAr || name);
  const a = normalizeName(existingRow.account_name_ar || existingRow.account_name);
  const b = normalizeName(existingRow.account_name);
  if (!wanted) return true;
  return wanted === a || wanted === b;
}

async function findAccountByCode(client, tenantId, accountCode) {
  const result = await client.query(
    `SELECT id, account_name, account_name_ar, account_type
     FROM chart_of_accounts
     WHERE tenant_id = $1 AND account_code = $2
     LIMIT 1`,
    [tenantId, String(accountCode).trim()]
  );
  return result.rows[0] || null;
}

/**
 * إنشاء حساب جديد مع عملة (افتراضي: العملة الأساسية).
 */
async function insertChartAccount(client, tenantId, {
  accountCode,
  accountName,
  accountNameAr,
  accountNameEn,
  accountNameHe,
  accountType,
  parentId = null,
  isGroup = false,
  sortOrder = null,
  currencyId = null,
  isActive = true,
}) {
  const code = String(accountCode).trim();
  const primaryName = normalizeName(accountNameAr || accountName);
  if (!code || !primaryName || !accountType) {
    throw Object.assign(new Error('بيانات الحساب ناقصة'), { statusCode: 400 });
  }

  const resolvedCurrencyId = await resolveAccountCurrencyId(client, tenantId, currencyId);

  let resolvedSortOrder = sortOrder;
  if (resolvedSortOrder == null || Number.isNaN(Number(resolvedSortOrder))) {
    const maxRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0)::int AS m
       FROM chart_of_accounts
       WHERE tenant_id = $1`,
      [tenantId]
    );
    resolvedSortOrder = Number(maxRes.rows[0]?.m || 0) + 1;
  } else {
    resolvedSortOrder = Number(resolvedSortOrder);
  }

  const result = await client.query(
    `INSERT INTO chart_of_accounts
       (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he,
        account_type, parent_id, is_group, is_active, sort_order, currency_id)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      tenantId,
      code,
      primaryName,
      accountNameEn || null,
      accountNameHe || null,
      accountType,
      parentId,
      isGroup,
      isActive,
      resolvedSortOrder,
      resolvedCurrencyId,
    ]
  );
  return result.rows[0].id;
}

/**
 * يُنشئ حسابًا أو يعيد الموجود إذا تطابق الرمز والاسم.
 * إذا الرمز موجود باسم مختلف → 409.
 */
async function ensureChartAccount(client, tenantId, {
  accountCode,
  accountName,
  accountNameAr,
  accountNameEn,
  accountNameHe,
  accountType,
  parentId = null,
  currencyId = null,
}) {
  const code = String(accountCode).trim();
  const primaryName = normalizeName(accountNameAr || accountName);
  if (!code || !primaryName || !accountType) {
    throw Object.assign(new Error('بيانات الحساب ناقصة'), { statusCode: 400 });
  }

  const existing = await findAccountByCode(client, tenantId, code);
  if (existing) {
    if (accountNamesMatch(existing, accountName, accountNameAr)) {
      return existing.id;
    }
    const label = normalizeName(existing.account_name_ar || existing.account_name);
    throw Object.assign(
      new Error(`رمز الحساب ${code} مستخدم مسبقًا (${label})`),
      { statusCode: 409 }
    );
  }

  return insertChartAccount(client, tenantId, {
    accountCode: code,
    accountName,
    accountNameAr,
    accountNameEn,
    accountNameHe,
    accountType,
    parentId,
    currencyId,
  });
}

async function reassignChartAccount(client, tenantId, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;

  await client.query(
    `UPDATE journal_entry_lines jl
     SET account_id = $2
     FROM journal_entries je
     WHERE jl.journal_entry_id = je.id
       AND je.tenant_id = $3
       AND jl.account_id = $1`,
    [fromId, toId, tenantId]
  );

  await client.query(
    `UPDATE parties SET account_id = $2 WHERE tenant_id = $3 AND account_id = $1`,
    [fromId, toId, tenantId]
  );

  const targetBox = await client.query(
    `SELECT id FROM cash_boxes WHERE tenant_id = $1 AND account_id = $2 LIMIT 1`,
    [tenantId, toId]
  );
  if (targetBox.rowCount > 0) {
    await client.query(
      `DELETE FROM cash_boxes WHERE tenant_id = $1 AND account_id = $2`,
      [tenantId, fromId]
    );
  } else {
    await client.query(
      `UPDATE cash_boxes SET account_id = $2 WHERE tenant_id = $3 AND account_id = $1`,
      [fromId, toId, tenantId]
    );
  }

  const targetBank = await client.query(
    `SELECT id FROM bank_accounts WHERE tenant_id = $1 AND chart_account_id = $2 LIMIT 1`,
    [tenantId, toId]
  );
  if (targetBank.rowCount > 0) {
    await client.query(
      `DELETE FROM bank_accounts WHERE tenant_id = $1 AND chart_account_id = $2`,
      [tenantId, fromId]
    );
  } else {
    await client.query(
      `UPDATE bank_accounts SET chart_account_id = $2 WHERE tenant_id = $3 AND chart_account_id = $1`,
      [fromId, toId, tenantId]
    );
  }

  await client.query(
    `UPDATE checks SET holding_account_id = $2
     WHERE tenant_id = $3 AND holding_account_id = $1`,
    [fromId, toId, tenantId]
  );
  await client.query(
    `UPDATE checks SET location_account_id = $2
     WHERE tenant_id = $3 AND location_account_id = $1`,
    [fromId, toId, tenantId]
  );
  await client.query(
    `UPDATE chart_of_accounts SET parent_id = $2
     WHERE tenant_id = $3 AND parent_id = $1`,
    [fromId, toId, tenantId]
  );

  await client.query(
    `DELETE FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2`,
    [fromId, tenantId]
  );
}

/** إزالة حسابات مكررة: نفس account_code + نفس الاسم، ثم نفس الرمز فقط */
async function dedupeChartAccounts(client, tenantId) {
  let removed = 0;
  const nameKey = `COALESCE(NULLIF(trim(account_name_ar), ''), NULLIF(trim(account_name), ''))`;

  const byCodeAndName = await client.query(
    `SELECT account_code, ${nameKey} AS nm, array_agg(id ORDER BY id) AS ids
     FROM chart_of_accounts
     WHERE tenant_id = $1
     GROUP BY account_code, ${nameKey}
     HAVING COUNT(*) > 1`,
    [tenantId]
  );

  for (const row of byCodeAndName.rows) {
    const [keepId, ...removeIds] = row.ids;
    for (const removeId of removeIds) {
      await reassignChartAccount(client, tenantId, removeId, keepId);
      removed += 1;
    }
  }

  const byCode = await client.query(
    `SELECT account_code, array_agg(id ORDER BY id) AS ids
     FROM chart_of_accounts
     WHERE tenant_id = $1
     GROUP BY account_code
     HAVING COUNT(*) > 1`,
    [tenantId]
  );

  for (const row of byCode.rows) {
    const [keepId, ...removeIds] = row.ids;
    for (const removeId of removeIds) {
      await reassignChartAccount(client, tenantId, removeId, keepId);
      removed += 1;
    }
  }

  return removed;
}

module.exports = {
  normalizeName,
  findAccountByCode,
  insertChartAccount,
  ensureChartAccount,
  reassignChartAccount,
  dedupeChartAccounts,
};
