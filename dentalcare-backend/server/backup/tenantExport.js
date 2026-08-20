// backup/tenantExport.js — تصدير عيادة إلى ZIP
const AdmZip = require('adm-zip');
const { withSystemClient } = require('../db/pool');

const MANIFEST_VERSION = 1;

const TABLE_QUERIES = [
  { key: 'users', sql: `SELECT * FROM users WHERE tenant_id = $1 AND username NOT ILIKE 'support.%'` },
  { key: 'currencies', sql: `SELECT * FROM currencies WHERE tenant_id = $1` },
  { key: 'chart_of_accounts', sql: `SELECT * FROM chart_of_accounts WHERE tenant_id = $1` },
  { key: 'parties', sql: `SELECT * FROM parties WHERE tenant_id = $1` },
  { key: 'banks', sql: `SELECT * FROM banks WHERE tenant_id = $1` },
  { key: 'bank_accounts', sql: `SELECT * FROM bank_accounts WHERE tenant_id = $1` },
  { key: 'cash_boxes', sql: `SELECT * FROM cash_boxes WHERE tenant_id = $1` },
  { key: 'doctors', sql: `SELECT * FROM doctors WHERE tenant_id = $1` },
  { key: 'treatment_catalog', sql: `SELECT * FROM treatment_catalog WHERE tenant_id = $1` },
  { key: 'tenant_settings', sql: `SELECT * FROM tenant_settings WHERE tenant_id = $1` },
  { key: 'journal_entries', sql: `SELECT * FROM journal_entries WHERE tenant_id = $1` },
  { key: 'checks', sql: `SELECT * FROM checks WHERE tenant_id = $1` },
  { key: 'clinical_sessions', sql: `SELECT * FROM clinical_sessions WHERE tenant_id = $1` },
  { key: 'clinical_session_items', sql: `SELECT * FROM clinical_session_items WHERE tenant_id = $1` },
  { key: 'clinical_session_images', sql: `SELECT * FROM clinical_session_images WHERE tenant_id = $1` },
  { key: 'appointments', sql: `SELECT * FROM appointments WHERE tenant_id = $1` },
  { key: 'whatsapp_messages', sql: `SELECT * FROM whatsapp_messages WHERE tenant_id = $1` },
  { key: 'fiscal_years', sql: `SELECT * FROM fiscal_years WHERE tenant_id = $1` },
];

function serializeValue(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return { __blob: true, data: v.toString('base64') };
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v.constructor && v.constructor.name === 'Date') return new Date(v).toISOString();
  return v;
}

function serializeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = serializeValue(v);
  }
  return out;
}

async function collectTenantData(tenantId) {
  return withSystemClient(async (client) => {
    const tenant = await client.query(
      `SELECT id, name, slug, plan, status, active_from, active_until, max_users, created_at
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (tenant.rowCount === 0) {
      const err = new Error('العيادة غير موجودة');
      err.statusCode = 404;
      throw err;
    }

    const tables = {};
    for (const spec of TABLE_QUERIES) {
      try {
        const result = await client.query(spec.sql, [tenantId]);
        tables[spec.key] = result.rows.map(serializeRow);
      } catch (err) {
        if (err.code === '42P01') {
          tables[spec.key] = [];
          continue;
        }
        throw err;
      }
    }

    const journalIds = (tables.journal_entries || []).map((r) => r.id);
    let lines = [];
    if (journalIds.length > 0) {
      const result = await client.query(
        `SELECT * FROM journal_entry_lines WHERE journal_entry_id = ANY($1::uuid[])`,
        [journalIds]
      );
      lines = result.rows.map(serializeRow);
    }
    tables.journal_entry_lines = lines;

    return {
      manifest: {
        version: MANIFEST_VERSION,
        type: 'tenant-backup',
        tenantId,
        tenant: tenant.rows[0],
        exportedAt: new Date().toISOString(),
      },
      tables,
    };
  });
}

/**
 * يبني Buffer ZIP للنسخة.
 */
async function buildTenantZipBuffer(tenantId) {
  const payload = await collectTenantData(tenantId);
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(payload.manifest, null, 2), 'utf8'));

  for (const [key, rows] of Object.entries(payload.tables)) {
    const lean = rows.map((row) => {
      const copy = { ...row };
      for (const [col, val] of Object.entries(copy)) {
        if (val && typeof val === 'object' && val.__blob) {
          const blobPath = `blobs/${key}/${row.id || col}_${col}.bin`;
          zip.addFile(blobPath, Buffer.from(val.data, 'base64'));
          copy[col] = { __blobRef: blobPath };
        }
      }
      return copy;
    });
    zip.addFile(`tables/${key}.json`, Buffer.from(JSON.stringify(lean), 'utf8'));
  }

  return zip.toBuffer();
}

module.exports = {
  MANIFEST_VERSION,
  collectTenantData,
  buildTenantZipBuffer,
};
