// accounting/cashBoxes.js
// إنشاء وربط صناديق النقد/الشيكات بحسابات الدليل لكل عملة.

const KIND_META = {
  CASH: {
    accountType: 'ASSET',
    codeStart: 1000,
    codeEnd: 1099,
    preferredCodes: ['1000'],
    ar: (code, symbol) => `صندوق نقدي — ${code}`,
    en: (code) => `Cash box — ${code}`,
    he: (code) => `קופת מזומן — ${code}`,
  },
  CHECKS_IN: {
    accountType: 'ASSET',
    codeStart: 1200,
    codeEnd: 1299,
    preferredCodes: ['1200'],
    ar: (code) => `حافظة شيكات واردة — ${code}`,
    en: (code) => `Received checks — ${code}`,
    he: (code) => `תיק שיקים נכנסים — ${code}`,
  },
  CHECKS_OUT: {
    accountType: 'LIABILITY',
    codeStart: 2200,
    codeEnd: 2299,
    preferredCodes: ['2200'],
    ar: (code) => `حافظة شيكات صادرة — ${code}`,
    en: (code) => `Issued checks — ${code}`,
    he: (code) => `תיק שיקים יוצאים — ${code}`,
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

const { ensureChartAccount, findAccountByCode } = require('./chartAccounts');
const { syncChartAccountCurrency } = require('./accountCurrency');

async function insertBox(client, tenantId, {
  currencyId, boxKind, name, nameEn, nameHe, accountId, isSystem,
}) {
  const result = await client.query(
    `INSERT INTO cash_boxes
       (tenant_id, currency_id, box_kind, name, name_en, name_he, account_id, is_system, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
     RETURNING id`,
    [tenantId, currencyId, boxKind, name, nameEn || null, nameHe || null, accountId, Boolean(isSystem)]
  );
  return result.rows[0].id;
}

/**
 * يضمن وجود صناديق النظام الثلاثة للعملة (نقد + شيكات واردة + شيكات صادرة).
 * يعيد استخدام الحسابات الافتراضية 1000/1200/2200 لعملة الأساس إن وُجدت.
 */
async function ensureSystemBoxesForCurrency(client, tenantId, currency) {
  const currencyId = currency.id;
  const code = currency.code;
  const isBase = Boolean(currency.is_base);
  const created = [];

  for (const boxKind of Object.keys(KIND_META)) {
    const existing = await client.query(
      `SELECT id FROM cash_boxes
       WHERE tenant_id = $1 AND currency_id = $2 AND box_kind = $3
       LIMIT 1`,
      [tenantId, currencyId, boxKind]
    );
    if (existing.rowCount > 0) continue;

    const meta = KIND_META[boxKind];
    let accountId = null;

    if (isBase) {
      for (const preferred of meta.preferredCodes) {
        const found = await findAccountByCode(client, tenantId, preferred);
        if (found) {
          accountId = found.id;
          break;
        }
      }
    }

    if (accountId) {
      const accountUsed = await client.query(
        `SELECT id, currency_id FROM cash_boxes
         WHERE tenant_id = $1 AND account_id = $2
         LIMIT 1`,
        [tenantId, accountId]
      );
      if (accountUsed.rowCount > 0 && accountUsed.rows[0].currency_id !== currencyId) {
        accountId = null;
      }
    }

    const nameAr = meta.ar(code);
    const nameEn = meta.en(code);
    const nameHe = meta.he(code);

    if (!accountId) {
      const accountCode = await nextCodeInRange(
        client,
        tenantId,
        meta.codeStart,
        meta.codeEnd,
        isBase ? meta.preferredCodes : []
      );
      // إن وُجد الحساب المفضّل لعملة الأساس ولم يُربط بعد — استخدمه أعلاه.
      // وإلا أنشئ حسابًا جديدًا.
      const already = await findAccountByCode(client, tenantId, accountCode);
      accountId = already
        ? already.id
        : await ensureChartAccount(client, tenantId, {
          accountCode,
          accountName: nameAr,
          accountNameAr: nameAr,
          accountNameEn: nameEn,
          accountNameHe: nameHe,
          accountType: meta.accountType,
          currencyId,
        });
    } else {
      // حدّث اسم الحساب الافتراضي ليعكس العملة إن كان الاسم عامًا
      await client.query(
        `UPDATE chart_of_accounts
         SET account_name = COALESCE(NULLIF(account_name, ''), $2),
             account_name_ar = COALESCE(account_name_ar, $2),
             account_name_en = COALESCE(account_name_en, $3),
             account_name_he = COALESCE(account_name_he, $4)
         WHERE id = $1`,
        [accountId, nameAr, nameEn, nameHe]
      );
    }

    await syncChartAccountCurrency(client, accountId, currencyId);

    const boxId = await insertBox(client, tenantId, {
      currencyId,
      boxKind,
      name: nameAr,
      nameEn,
      nameHe,
      accountId,
      isSystem: true,
    });
    created.push({ id: boxId, boxKind, accountId });
  }

  return created;
}

async function ensureBoxesForAllCurrencies(client, tenantId) {
  const currencies = await client.query(
    `SELECT id, code, is_base FROM currencies WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId]
  );
  for (const row of currencies.rows) {
    await ensureSystemBoxesForCurrency(client, tenantId, row);
  }
  const { repairLinkedAccountCurrencies } = require('../db/ensureChartAccountCurrency');
  await repairLinkedAccountCurrencies(client);
}

async function createManualBox(client, tenantId, {
  currencyId, boxKind, name, nameEn, nameHe,
}) {
  const meta = KIND_META[boxKind];
  if (!meta) {
    throw Object.assign(new Error('نوع الصندوق غير صالح'), { statusCode: 400 });
  }

  const currency = await client.query(
    `SELECT id, code, is_base FROM currencies WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [currencyId, tenantId]
  );
  if (currency.rowCount === 0) {
    throw Object.assign(new Error('العملة غير موجودة أو غير نشطة'), { statusCode: 400 });
  }

  const nameAr = (name || '').trim() || meta.ar(currency.rows[0].code);
  const accountCode = await nextCodeInRange(client, tenantId, meta.codeStart, meta.codeEnd);
  const accountId = await ensureChartAccount(client, tenantId, {
    accountCode,
    accountName: nameAr,
    accountNameAr: nameAr,
    accountNameEn: nameEn || meta.en(currency.rows[0].code),
    accountNameHe: nameHe || meta.he(currency.rows[0].code),
    accountType: meta.accountType,
    currencyId,
  });

  await syncChartAccountCurrency(client, accountId, currencyId);

  return insertBox(client, tenantId, {
    currencyId,
    boxKind,
    name: nameAr,
    nameEn: nameEn || null,
    nameHe: nameHe || null,
    accountId,
    isSystem: false,
  });
}

module.exports = {
  KIND_META,
  ensureSystemBoxesForCurrency,
  ensureBoxesForAllCurrencies,
  createManualBox,
  nextCodeInRange,
};
