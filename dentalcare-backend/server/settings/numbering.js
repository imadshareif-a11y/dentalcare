const { ensureChartAccount } = require('../accounting/chartAccounts');

const SERIES = {
  patients: { prefix: 'patients_prefix', width: 'patients_width', next: 'patients_next' },
  suppliers: { prefix: 'suppliers_prefix', width: 'suppliers_width', next: 'suppliers_next' },
  doctors: { prefix: 'doctors_prefix', width: 'doctors_width', next: 'doctors_next' },
  employees: { prefix: 'employees_prefix', width: 'employees_width', next: 'employees_next' },
};

function formatCode(prefix, width, n) {
  const pad = Math.min(8, Math.max(1, Number(width) || 5));
  return `${prefix || ''}${String(n).padStart(pad, '0')}`;
}

async function nextAccountCode(client, tenantId, seriesKey) {
  const series = SERIES[seriesKey];
  if (!series) throw new Error('سلسلة ترقيم غير معروفة');

  await client.query(
    `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  const locked = await client.query(
    `SELECT ${series.prefix} AS prefix, ${series.width} AS width, ${series.next} AS next
     FROM tenant_settings WHERE tenant_id = $1 FOR UPDATE`,
    [tenantId]
  );
  if (!locked.rows[0]) throw new Error('تعذّر قراءة إعدادات الترقيم');

  let n = Number(locked.rows[0].next) || 1;
  const prefix = locked.rows[0].prefix || '';
  const width = locked.rows[0].width;
  let code = null;

  for (let i = 0; i < 5000; i += 1) {
    const candidate = formatCode(prefix, width, n);
    const exists = await client.query(
      `SELECT 1 FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2`,
      [tenantId, candidate]
    );
    n += 1;
    if (exists.rowCount === 0) {
      code = candidate;
      break;
    }
  }

  if (!code) throw new Error('تعذّر توليد رقم حساب بدون تكرار');

  await client.query(
    `UPDATE tenant_settings SET ${series.next} = $2, updated_at = now() WHERE tenant_id = $1`,
    [tenantId, n]
  );
  return code;
}

async function ensureBroughtForwardAccount(client, tenantId) {
  return ensureChartAccount(client, tenantId, {
    accountCode: '3100',
    accountName: 'رصيد مدور',
    accountNameAr: 'رصيد مدور',
    accountNameEn: 'Brought Forward',
    accountNameHe: 'יתרה מועברת',
    accountType: 'EQUITY',
  });
}

module.exports = { nextAccountCode, formatCode, ensureBroughtForwardAccount, SERIES };
