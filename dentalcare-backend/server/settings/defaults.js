const { publicAiSettings } = require('./aiConfig');
const { publicWhatsappSettings } = require('../whatsapp/config');

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
  const sample = (prefix, width, next) => `${prefix || ''}${String(next || 1).padStart(Math.min(8, Math.max(1, width || 5)), '0')}`;
  if (!row) {
    return {
      dateFormat: 'DD/MM/YYYY',
      currencySymbol: '₪',
      decimalPlaces: 2,
      thousandsSeparator: ',',
      decimalSeparator: '.',
      printHeaderText: '',
      hasLetterhead: false,
      ...publicAiSettings(null),
      ...publicWhatsappSettings(null),
      ...numbering,
      patientsSample: sample('C', 5, 1),
      suppliersSample: sample('S', 5, 1),
      doctorsSample: sample('D', 5, 1),
      employeesSample: sample('E', 5, 1),
    };
  }
  return {
    dateFormat: row.date_format,
    currencySymbol: row.currency_symbol,
    decimalPlaces: Number(row.decimal_places),
    thousandsSeparator: row.thousands_separator,
    decimalSeparator: row.decimal_separator,
    printHeaderText: row.print_header_text || '',
    hasLetterhead: Boolean(row.has_letterhead || row.letterhead_bytes),
    letterheadMime: row.letterhead_mime || null,
    ...publicAiSettings(row),
    ...publicWhatsappSettings(row),
    ...numbering,
    patientsSample: sample(numbering.patientsPrefix, numbering.patientsWidth, numbering.patientsNext),
    suppliersSample: sample(numbering.suppliersPrefix, numbering.suppliersWidth, numbering.suppliersNext),
    doctorsSample: sample(numbering.doctorsPrefix, numbering.doctorsWidth, numbering.doctorsNext),
    employeesSample: sample(numbering.employeesPrefix, numbering.employeesWidth, numbering.employeesNext),
  };
}

async function seedClinicExtras(client, tenantId) {
  await client.query(
    `INSERT INTO tenant_settings (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
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

  await client.query(
    `INSERT INTO currencies
       (tenant_id, code, name, name_en, name_he, symbol, decimal_places, rate_to_base, is_base, is_active)
     SELECT
       $1, 'ILS', 'شيكل إسرائيلي', 'Israeli Shekel', 'שקל חדש',
       COALESCE(NULLIF(trim(s.currency_symbol), ''), '₪'), 2, 1, TRUE, TRUE
     FROM tenant_settings s
     WHERE s.tenant_id = $1
       AND NOT EXISTS (SELECT 1 FROM currencies c WHERE c.tenant_id = $1)`,
    [tenantId]
  );

  try {
    const { ensureBoxesForAllCurrencies } = require('../accounting/cashBoxes');
    await ensureBoxesForAllCurrencies(client, tenantId);
  } catch (err) {
    // الجدول قد لا يكون مُرحَّلًا بعد على بيئات قديمة
    if (err.code !== '42P01') throw err;
  }

  try {
    const { seedStandardBanks } = require('../accounting/bankCatalog');
    await seedStandardBanks(client, tenantId);
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }
}

module.exports = { DEFAULT_TREATMENTS, DATE_FORMATS, publicSettings, seedClinicExtras };
