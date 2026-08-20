// accounting/bankAccounts.js
const KIND_META = {
  CURRENT: {
    accountType: 'ASSET',
    codeStart: 1100,
    codeEnd: 1149,
    preferredCodes: ['1100'],
    ar: (label) => label || 'حساب جاري',
    en: () => 'Current account',
    he: () => 'חשבון עובר ושב',
  },
  COLLECTION: {
    accountType: 'ASSET',
    codeStart: 1150,
    codeEnd: 1169,
    preferredCodes: [],
    ar: () => 'حساب برسم التحصيل',
    en: () => 'For collection',
    he: () => 'לגבייה',
  },
  PAYMENT: {
    accountType: 'LIABILITY',
    codeStart: 1170,
    codeEnd: 1189,
    preferredCodes: [],
    ar: () => 'حساب برسم الدفع',
    en: () => 'For payment',
    he: () => 'לתשלום',
  },
  SAVINGS: {
    accountType: 'ASSET',
    codeStart: 1190,
    codeEnd: 1199,
    preferredCodes: [],
    ar: () => 'حساب توفير',
    en: () => 'Savings account',
    he: () => 'חשבון חיסכון',
  },
};

async function nextCodeInRange(client, tenantId, start, end, preferredCodes = []) {
  for (const code of preferredCodes) {
    const exists = await client.query(
      `SELECT 1 FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2`,
      [tenantId, code]
    );
    if (exists.rowCount === 0) return code;
  }
  const used = await client.query(
    `SELECT account_code FROM chart_of_accounts
     WHERE tenant_id = $1
       AND account_code ~ '^[0-9]+$'
       AND account_code::int BETWEEN $2 AND $3`,
    [tenantId, start, end]
  );
  const taken = new Set(used.rows.map((r) => Number(r.account_code)));
  for (let n = start; n <= end; n += 1) {
    if (!taken.has(n)) return String(n);
  }
  throw Object.assign(new Error(`لا يوجد رقم حساب متاح في النطاق ${start}-${end}`), { statusCode: 400 });
}

async function createChartAccount(client, tenantId, {
  accountCode, accountType, nameAr, nameEn, nameHe,
}) {
  const result = await client.query(
    `INSERT INTO chart_of_accounts
       (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
     VALUES ($1, $2, $3, $3, $4, $5, $6)
     RETURNING id`,
    [tenantId, accountCode, nameAr, nameEn, nameHe, accountType]
  );
  return result.rows[0].id;
}

async function createBankAccount(client, tenantId, {
  bankId, accountKind, name, nameEn, nameHe, accountNumber, currencyId, reusePreferred = false,
}) {
  const meta = KIND_META[accountKind];
  if (!meta) {
    throw Object.assign(new Error('نوع الحساب البنكي غير صالح'), { statusCode: 400 });
  }

  const nameAr = (name || '').trim() || meta.ar();
  let chartAccountId = null;

  if (reusePreferred && meta.preferredCodes.length) {
    for (const code of meta.preferredCodes) {
      const found = await client.query(
        `SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2 LIMIT 1`,
        [tenantId, code]
      );
      if (found.rowCount) {
        const linked = await client.query(
          `SELECT 1 FROM bank_accounts WHERE chart_account_id = $1`,
          [found.rows[0].id]
        );
        if (linked.rowCount === 0) {
          chartAccountId = found.rows[0].id;
          break;
        }
      }
    }
  }

  if (!chartAccountId) {
    const accountCode = await nextCodeInRange(
      client,
      tenantId,
      meta.codeStart,
      meta.codeEnd,
      reusePreferred ? meta.preferredCodes : []
    );
    const existing = await client.query(
      `SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2 LIMIT 1`,
      [tenantId, accountCode]
    );
    if (existing.rowCount) {
      const linked = await client.query(
        `SELECT 1 FROM bank_accounts WHERE chart_account_id = $1`,
        [existing.rows[0].id]
      );
      if (linked.rowCount === 0) chartAccountId = existing.rows[0].id;
    }
    if (!chartAccountId) {
      chartAccountId = await createChartAccount(client, tenantId, {
        accountCode,
        accountType: meta.accountType,
        nameAr,
        nameEn: nameEn || meta.en(),
        nameHe: nameHe || meta.he(),
      });
    }
  }

  const result = await client.query(
    `INSERT INTO bank_accounts
       (tenant_id, bank_id, account_kind, name, name_en, name_he, account_number, currency_id, chart_account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      tenantId,
      bankId || null,
      accountKind,
      nameAr,
      nameEn || null,
      nameHe || null,
      accountNumber || null,
      currencyId || null,
      chartAccountId,
    ]
  );
  return result.rows[0].id;
}

/** يربط حساب 1100 كجاري أساسي إن وُجد ولم يُربط بعد */
async function ensureDefaultCurrentAccount(client, tenantId) {
  const existing = await client.query(
    `SELECT 1 FROM bank_accounts WHERE tenant_id = $1 AND account_kind = 'CURRENT' LIMIT 1`,
    [tenantId]
  );
  if (existing.rowCount > 0) return null;

  const baseCurrency = await client.query(
    `SELECT id FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
    [tenantId]
  );

  return createBankAccount(client, tenantId, {
    accountKind: 'CURRENT',
    name: 'الحساب الجاري الرئيسي',
    nameEn: 'Main current account',
    nameHe: 'חשבון עובר ושב ראשי',
    currencyId: baseCurrency.rows[0]?.id || null,
    reusePreferred: true,
  });
}

module.exports = {
  KIND_META,
  createBankAccount,
  ensureDefaultCurrentAccount,
  nextCodeInRange,
};
