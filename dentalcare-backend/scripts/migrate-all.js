require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db/pool');

/**
 * ترتيب: schema أساسي ثم migrations تراكمية.
 * كل جملة SQL تُنفَّذ لوحدها حتى لا يُلغى ملف كامل عند فشل سطر واحد.
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

const IGNORABLE = /already exists|duplicate_column|duplicate_object|duplicate key|does not exist|undefined_table|undefined_column|cannot drop/i;

function splitSqlStatements(sql) {
  return String(sql)
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((line) => {
      const t = line.trim();
      return !t || t.startsWith('--');
    }));
}

async function runStatement(label, sql) {
  try {
    await pool.query(sql.endsWith(';') ? sql : `${sql};`);
    return true;
  } catch (err) {
    const msg = String(err.message || err);
    if (IGNORABLE.test(msg)) {
      console.warn(`  skip (${label}): ${msg}`);
      return false;
    }
    throw err;
  }
}

async function runSqlFile(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skip missing: ${relativePath}`);
    return;
  }
  console.log(`Running ${relativePath}...`);
  const sql = fs.readFileSync(filePath, 'utf8');
  const parts = splitSqlStatements(sql);
  for (let i = 0; i < parts.length; i += 1) {
    await runStatement(`${relativePath}#${i + 1}`, parts[i]);
  }
  console.log(`Done: ${relativePath}`);
}

async function ensureEssentials() {
  console.log('Ensuring essential columns/tables...');
  await runStatement('max_users', `
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10
  `);
  await runStatement('slug', `
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS slug VARCHAR(50)
  `);
  await runStatement('active_from', `
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_from DATE
  `);
  await runStatement('active_until', `
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_until DATE
  `);
  await runStatement('tenant_settings', `
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      date_format          VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
      currency_symbol      VARCHAR(8) NOT NULL DEFAULT '₪',
      decimal_places       SMALLINT NOT NULL DEFAULT 2,
      thousands_separator  VARCHAR(2) NOT NULL DEFAULT ',',
      decimal_separator    VARCHAR(2) NOT NULL DEFAULT '.',
      print_header_text    TEXT NOT NULL DEFAULT '',
      letterhead_mime      VARCHAR(100),
      letterhead_bytes     BYTEA,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('Essentials OK.');
}

async function main() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const existing = await pool.query(`SELECT to_regclass('public.tenants') AS t`);
  if (!existing.rows[0]?.t) {
    const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('schema.sql not found at repo root — cannot bootstrap empty database');
    }
    console.log('Running schema.sql (core)...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    for (const part of splitSqlStatements(schemaSql)) {
      await runStatement('schema.sql', part);
    }
    console.log('Done: schema.sql (core)');
  } else {
    console.log('Core schema already present (tenants) — skipping schema.sql');
  }

  await ensureEssentials();

  for (const file of MIGRATION_FILES) {
    try {
      await runSqlFile(file);
    } catch (err) {
      console.warn(`Continue after hard error in ${file}: ${err.message}`);
    }
  }

  await ensureEssentials();
  await pool.end();
  console.log('migrate:all completed.');
}

main().catch((err) => {
  console.error('migrate:all failed:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
