require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

/**
 * ترتيب: schema أساسي ثم migrations تراكمية (معظمها idempotent).
 * على قاعدة فيها بيانات سابقة: schema يُتخطّى إن وُجد جدول tenants.
 */
const MIGRATION_FILES = [
  'sql/permissions_v0_add_column.sql',
  'sql/permissions_v1.sql',
  'sql/permissions_v2_appointments.sql',
  'sql/permissions_v3_accounts.sql',
  'sql/employees_v1.sql',
  'sql/tenants_v1_slug.sql',
  'sql/tenants_v2_subscription.sql',
  'sql/tenants_v3_max_users.sql',
  'sql/clinic_settings_v1.sql',
  'sql/numbering_v1.sql',
  'sql/appointments_v1.sql',
  'sql/appointments_v2.sql',
  'sql/purchase_docs_v1.sql',
  'sql/patients_v2_demographics.sql',
  'sql/patients_v3_birth_date.sql',
  'sql/currencies_v1.sql',
  'sql/journal_currency_v1.sql',
  'sql/cash_boxes_v1.sql',
  'sql/banks_v1.sql',
  'sql/checks_v2.sql',
  'sql/checks_v3_location.sql',
  'sql/checks_v4_images.sql',
  'sql/chart_tree_v1.sql',
  'sql/user_preferences_v1.sql',
  'sql/clinical_session_notes_v1.sql',
  'sql/clinical_session_images_v1.sql',
  'sql/tenant_ai_settings_v1.sql',
  'sql/tenant_ai_provider_v1.sql',
  'sql/tenant_whatsapp_v1.sql',
  'sql/tenant_role_permission_defaults_v1.sql',
  'sql/journal_attachment_v1.sql',
  'sql/fiscal_years_v1.sql',
  'sql/doctors_v1.sql',
  'sql/idempotency.sql',
  'sql/trigger_balance_check.sql',
  'sql/fix_account_name_nullable.sql',
  'sql/multilang.sql',
];

async function runSqlText(label, sql) {
  console.log(`Running ${label}...`);
  await pool.query(sql);
  console.log(`Done: ${label}`);
}

async function runSqlFile(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skip missing: ${relativePath}`);
    return;
  }
  const sql = fs.readFileSync(filePath, 'utf8');
  await runSqlText(relativePath, sql);
}

async function main() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const existing = await pool.query(`SELECT to_regclass('public.tenants') AS t`);
  if (!existing.rows[0]?.t) {
    const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('schema.sql not found at repo root — cannot bootstrap empty database');
    }
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await runSqlText('schema.sql (core)', schemaSql);
  } else {
    console.log('Core schema already present (tenants) — skipping schema.sql');
  }

  for (const file of MIGRATION_FILES) {
    try {
      await runSqlFile(file);
    } catch (err) {
      // بعض الملفات القديمة قد تفشل على مخطط أحدث — نعرض ونكمل إن أمكن
      const msg = String(err.message || err);
      if (/already exists|duplicate_column|duplicate_object/i.test(msg)) {
        console.warn(`Continue after: ${file} — ${msg}`);
        continue;
      }
      throw err;
    }
  }

  await pool.end();
  console.log('migrate:all completed.');
}

main().catch((err) => {
  console.error('migrate:all failed:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
