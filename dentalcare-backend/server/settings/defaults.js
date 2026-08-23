const { publicAiSettings } = require('./aiConfig');
const { publicWhatsappSettings } = require('../whatsapp/config');
const { letterheadLayoutFromRow } = require('./letterheadLayout');

const DEFAULT_TREATMENTS = [
  ['كشف', 50, 1],
  ['تنظيف أسنان', 150, 2],
  ['حشوة بيضاء', 250, 3],
  ['حشوة عادية', 180, 4],
  ['علاج عصب', 600, 5],
  ['خلع بسيط', 200, 6],
  ['خلع جراحي', 450, 7],
  ['تاج', 1200, 8],
  ['زراعة', 3500, 9],
  ['أشعة', 80, 10],
];

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY'];
const NUMBER_DIGITS = ['western', 'eastern'];
const TIME_FORMATS = ['12h', '24h'];

const DOC_SERIES_PUBLIC = [
  { key: 'receipts', db: 'receipts', defaultPrefix: 'RC' },
  { key: 'payments', db: 'payments', defaultPrefix: 'PY' },
  { key: 'journalDocs', db: 'journal_docs', defaultPrefix: 'JV' },
  { key: 'bankEntries', db: 'bank_entries', defaultPrefix: 'BE' },
  { key: 'purchaseInvoices', db: 'purchase_invoices', defaultPrefix: 'PI' },
  { key: 'creditNotes', db: 'credit_notes', defaultPrefix: 'CN' },
  { key: 'debitNotes', db: 'debit_notes', defaultPrefix: 'DN' },
];

function formatNumberSample(prefix, width, next) {
  const pad = Math.min(8, Math.max(1, Number(width) || 5));
  return `${prefix || ''}${String(Number(next) || 1).padStart(pad, '0')}`;
}

function docNumberingFromRow(row) {
  const out = {};
  for (const s of DOC_SERIES_PUBLIC) {
    const prefix = row?.[`${s.db}_prefix`] || s.defaultPrefix;
    const width = Number(row?.[`${s.db}_width`] || 5);
    const next = Number(row?.[`${s.db}_next`] || 1);
    out[`${s.key}Prefix`] = prefix;
    out[`${s.key}Width`] = width;
    out[`${s.key}Next`] = next;
    out[`${s.key}Sample`] = formatNumberSample(prefix, width, next);
  }
  return out;
}

function publicSettings(row) {
  const numbering = {
    patientsPrefix: row?.patients_prefix || 'C',
    patientsWidth: Number(row?.patients_width || 5),
    patientsNext: Number(row?.patients_next || 1),
    suppliersPrefix: row?.suppliers_prefix || 'S',
    suppliersWidth: Number(row?.suppliers_width || 5),
    suppliersNext: Number(row?.suppliers_next || 1),
    doctorsPrefix: row?.doctors_prefix || 'D',
    doctorsWidth: Number(row?.doctors_width || 5),
    doctorsNext: Number(row?.doctors_next || 1),
    employeesPrefix: row?.employees_prefix || 'E',
    employeesWidth: Number(row?.employees_width || 5),
    employeesNext: Number(row?.employees_next || 1),
  };
  if (!row) {
    return {
      dateFormat: 'DD/MM/YYYY',
      currencySymbol: '₪',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      numberDigits: 'western',
      timeFormat: '12h',
      printHeaderText: '',
      letterheadLayout: letterheadLayoutFromRow(null),
      hasLetterhead: false,
      ...publicAiSettings(null),
      ...publicWhatsappSettings(null),
      ...numbering,
      patientsSample: formatNumberSample('C', 5, 1),
      suppliersSample: formatNumberSample('S', 5, 1),
      doctorsSample: formatNumberSample('D', 5, 1),
      employeesSample: formatNumberSample('E', 5, 1),
      ...docNumberingFromRow(null),
    };
  }
  const digits = NUMBER_DIGITS.includes(row.number_digits) ? row.number_digits : 'western';
  const timeFmt = TIME_FORMATS.includes(row.time_format) ? row.time_format : '12h';
  return {
    dateFormat: row.date_format,
    currencySymbol: (row.currency_symbol && String(row.currency_symbol).trim()) || '₪',
    decimalPlaces: Number(row.decimal_places),
    thousandsSeparator: row.thousands_separator,
    decimalSeparator: row.decimal_separator,
    numberDigits: digits,
    timeFormat: timeFmt,
    printHeaderText: row.print_header_text || '',
    letterheadLayout: letterheadLayoutFromRow(row),
    hasLetterhead: Boolean(row.has_letterhead || row.letterhead_bytes),
    letterheadMime: row.letterhead_mime || null,
    ...publicAiSettings(row),
    ...publicWhatsappSettings(row),
    ...numbering,
    patientsSample: formatNumberSample(numbering.patientsPrefix, numbering.patientsWidth, numbering.patientsNext),
    suppliersSample: formatNumberSample(numbering.suppliersPrefix, numbering.suppliersWidth, numbering.suppliersNext),
    doctorsSample: formatNumberSample(numbering.doctorsPrefix, numbering.doctorsWidth, numbering.doctorsNext),
    employeesSample: formatNumberSample(numbering.employeesPrefix, numbering.employeesWidth, numbering.employeesNext),
    ...docNumberingFromRow(row),
  };
}

function isMissingRelation(err) {
  return err?.code === '42P01' || /does not exist/i.test(String(err?.message || ''));
}

/** داخل معاملة: فشل جدول ناقص لازم SAVEPOINT وإلا الـ transaction بتنهار */
async function withOptionalTable(client, label, fn) {
  const sp = `sp_${label}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 60);
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
    if (!isMissingRelation(err)) throw err;
  }
}

async function seedClinicExtras(client, tenantId) {
  await withOptionalTable(client, 'tenant_settings', async () => {
    await client.query(
      `INSERT INTO tenant_settings (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    );
  });

  await withOptionalTable(client, 'treatment_catalog', async () => {
    const existing = await client.query(
      'SELECT 1 FROM treatment_catalog WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    if (existing.rowCount === 0) {
      for (const [name, price, sortOrder] of DEFAULT_TREATMENTS) {
        await client.query(
          `INSERT INTO treatment_catalog (tenant_id, name, price, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, name, price, sortOrder]
        );
      }
    }
  });

  await withOptionalTable(client, 'currencies', async () => {
    await client.query(
      `INSERT INTO currencies
         (tenant_id, code, name, name_en, name_he, symbol, decimal_places, rate_to_base, is_base, is_active)
       SELECT
         $1, 'ILS', 'شيكل إسرائيلي', 'Israeli Shekel', 'שקל חדש',
         COALESCE(NULLIF(trim(s.currency_symbol), ''), '₪'), 2, 1, TRUE, TRUE
       FROM tenant_settings s
       WHERE s.tenant_id = $1
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId]
    );
  });

  await withOptionalTable(client, 'cash_boxes', async () => {
    const { ensureBoxesForAllCurrencies } = require('../accounting/cashBoxes');
    await ensureBoxesForAllCurrencies(client, tenantId);
  });

  await withOptionalTable(client, 'banks', async () => {
    const { seedStandardBanks } = require('../accounting/bankCatalog');
    await seedStandardBanks(client, tenantId);
  });
}

module.exports = {
  DEFAULT_TREATMENTS,
  DATE_FORMATS,
  NUMBER_DIGITS,
  TIME_FORMATS,
  DOC_SERIES_PUBLIC,
  publicSettings,
  seedClinicExtras,
};
