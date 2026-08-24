// backup/tenantImport.js — استعادة عيادة من ZIP (مسح ثم استيراد)
const AdmZip = require('adm-zip');
const { withSystemClient } = require('../db/pool');
const { MANIFEST_VERSION } = require('./tenantExport');

const DELETE_ORDER = [
  'clinical_session_images',
  'clinical_session_items',
  'clinical_sessions',
  'treatment_plan_items',
  'treatment_plans',
  'tooth_chart_entries',
  'whatsapp_messages',
  'appointments',
  'rooms',
  'checks',
  'idempotency_keys',
  'journal_entry_lines', // via journals — handled specially
  'journal_entries',
  'cash_boxes',
  'bank_accounts',
  'banks',
  'doctors',
  'treatment_catalog',
  'fiscal_years',
  'parties',
  'chart_of_accounts',
  'currencies',
  'tenant_settings',
  'users',
];

const INSERT_ORDER = [
  'users',
  'currencies',
  'chart_of_accounts',
  'parties',
  'banks',
  'bank_accounts',
  'cash_boxes',
  'doctors',
  'treatment_catalog',
  'rooms',
  'tenant_settings',
  'journal_entries',
  'journal_entry_lines',
  'checks',
  'clinical_sessions',
  'clinical_session_items',
  'clinical_session_images',
  'treatment_plans',
  'treatment_plan_items',
  'tooth_chart_entries',
  'appointments',
  'whatsapp_messages',
  'fiscal_years',
];

function hydrateRow(row, zip) {
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === 'object' && v.__blobRef) {
      const entry = zip.getEntry(v.__blobRef);
      if (!entry) {
        const err = new Error(`ملف مرفق ناقص في النسخة: ${v.__blobRef}`);
        err.statusCode = 400;
        throw err;
      }
      out[k] = entry.getData();
    }
  }
  return out;
}

function parseZip(buffer) {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    const err = new Error('ملف النسخة لا يحتوي manifest.json');
    err.statusCode = 400;
    throw err;
  }
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  if (manifest.version !== MANIFEST_VERSION || manifest.type !== 'tenant-backup') {
    const err = new Error('إصدار أو نوع ملف النسخة غير مدعوم');
    err.statusCode = 400;
    throw err;
  }
  const tables = {};
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith('tables/') || !entry.entryName.endsWith('.json')) continue;
    const key = entry.entryName.replace(/^tables\//, '').replace(/\.json$/, '');
    tables[key] = JSON.parse(entry.getData().toString('utf8')).map((row) => hydrateRow(row, zip));
  }
  return { manifest, tables, zip };
}

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return r.rowCount > 0;
}

async function wipeTenantData(client, tenantId) {
  // فك دورة parties ↔ chart
  if (await tableExists(client, 'parties')) {
    await client.query(`UPDATE parties SET account_id = NULL WHERE tenant_id = $1`, [tenantId]);
  }
  if (await tableExists(client, 'chart_of_accounts')) {
    await client.query(`UPDATE chart_of_accounts SET party_id = NULL WHERE tenant_id = $1`, [tenantId]);
  }
  if (await tableExists(client, 'journal_entries')) {
    await client.query(`UPDATE journal_entries SET reversed_by = NULL WHERE tenant_id = $1`, [tenantId]);
  }

  for (const table of DELETE_ORDER) {
    if (!(await tableExists(client, table))) continue;
    if (table === 'journal_entry_lines') {
      await client.query(
        `DELETE FROM journal_entry_lines
         WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)`,
        [tenantId]
      );
      continue;
    }
    await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
}

async function insertRows(client, table, rows) {
  if (!rows?.length) return;
  if (!(await tableExists(client, table))) return;

  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      vals
    );
  }
}

/**
 * يستبدل بيانات العيادة الحالية بمحتوى النسخة.
 * يجب أن يطابق manifest.tenantId العيادة الحالية.
 */
async function restoreTenantFromZipBuffer(tenantId, buffer, { confirmTenantId } = {}) {
  const { manifest, tables } = parseZip(buffer);
  if (manifest.tenantId !== tenantId) {
    const err = new Error('ملف النسخة لا يخص هذه العيادة');
    err.statusCode = 400;
    throw err;
  }
  if (confirmTenantId && confirmTenantId !== tenantId) {
    const err = new Error('تأكيد العيادة غير مطابق');
    err.statusCode = 400;
    throw err;
  }

  await withSystemClient(async (client) => {
    await wipeTenantData(client, tenantId);

    // chart بدون party_id أولًا، ثم parties، ثم تحديث party_id على الحسابات
    const charts = (tables.chart_of_accounts || []).map((r) => ({ ...r, party_id: null }));
    const parties = tables.parties || [];
    await insertRows(client, 'users', tables.users || []);
    await insertRows(client, 'currencies', tables.currencies || []);
    await insertRows(client, 'chart_of_accounts', charts);
    await insertRows(client, 'parties', parties);

    for (const row of (tables.chart_of_accounts || [])) {
      if (row.party_id) {
        await client.query(
          `UPDATE chart_of_accounts SET party_id = $2 WHERE id = $1 AND tenant_id = $3`,
          [row.id, row.party_id, tenantId]
        );
      }
    }

    for (const key of INSERT_ORDER) {
      if (['users', 'currencies', 'chart_of_accounts', 'parties'].includes(key)) continue;
      if (key === 'journal_entry_lines') {
        await insertRows(client, 'journal_entry_lines', tables.journal_entry_lines || []);
        continue;
      }
      await insertRows(client, key, tables[key] || []);
    }
  });

  return { success: true, tenantId, restoredAt: new Date().toISOString() };
}

module.exports = {
  parseZip,
  restoreTenantFromZipBuffer,
};
