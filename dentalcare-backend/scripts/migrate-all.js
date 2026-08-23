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
  'sql/permissions_v4_admin.sql',
  'sql/employees_v1.sql',
  'sql/tenants_v1_slug.sql',
  'sql/tenants_v2_subscription.sql',
  'sql/tenants_v3_max_users.sql',
  'sql/clinic_settings_v1.sql',
  'sql/numbering_v1.sql',
  'sql/number_digits_v1.sql',
  'sql/time_format_v1.sql',
  'sql/letterhead_layout_v1.sql',
  'sql/tenant_isolation_hardening_v1.sql',
  'sql/user_avatar_v1.sql',
  'sql/appointments_v1.sql',
  'sql/appointments_v2.sql',
  'sql/appointments_v3.sql',
  'sql/rooms_v1.sql',
  'sql/appointments_v4.sql',
  'sql/appointments_v5.sql',
  'sql/appointments_v6.sql',
  'sql/purchase_docs_v1.sql',
  'sql/patients_v2_demographics.sql',
  'sql/patients_v3_birth_date.sql',
  'sql/currencies_v1.sql',
  'sql/journal_currency_v1.sql',
  'sql/journal_line_currency_v1.sql',
  'sql/chart_account_currency_v1.sql',
  'sql/cash_boxes_v1.sql',
  'sql/banks_v1.sql',
  'sql/checkbooks_v1.sql',
  'sql/currency_rates_meta_v1.sql',
  'sql/checks_v2.sql',
  'sql/checks_v3_location.sql',
  'sql/checks_v4_images.sql',
  'sql/chart_tree_v1.sql',
  'sql/user_preferences_v1.sql',
  'sql/clinical_session_notes_v1.sql',
  'sql/clinical_session_images_v1.sql',
  'sql/clinical_sessions_appointment_v1.sql',
  'sql/tooth_chart_v1.sql',
  'sql/treatment_plan_doctor_v1.sql',
  'sql/plan_item_session_progress_v1.sql',
  'sql/tooth_conditions_v1.sql',
  'sql/document_numbering_v1.sql',
  'sql/tenant_ai_settings_v1.sql',
  'sql/tenant_ai_provider_v1.sql',
  'sql/tenant_whatsapp_v1.sql',
  'sql/tenant_role_permission_defaults_v1.sql',
  'sql/journal_attachment_v1.sql',
  'sql/fiscal_years_v1.sql',
  'sql/doctors_v1.sql',
  'sql/idempotency.sql',
  'sql/tenant_delete_fk_v1.sql',
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
  const stmts = [
    [`max_users`, `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10`],
    [`slug`, `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(50)`],
    [`active_from`, `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_from DATE`],
    [`active_until`, `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_until DATE`],
    [`users_locale`, `ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'ar'`],
    [`coa_ar`, `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_ar VARCHAR(255)`],
    [`coa_en`, `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_en VARCHAR(255)`],
    [`coa_he`, `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_he VARCHAR(255)`],
    [`coa_ar_fill`, `UPDATE chart_of_accounts SET account_name_ar = account_name WHERE account_name_ar IS NULL`],
    [`tenant_settings`, `
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
    `],
    [`treatment_catalog`, `
      CREATE TABLE IF NOT EXISTS treatment_catalog (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        price       NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `],
    [`currencies`, `
      CREATE TABLE IF NOT EXISTS currencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code VARCHAR(10) NOT NULL,
        name VARCHAR(120) NOT NULL,
        name_en VARCHAR(120),
        name_he VARCHAR(120),
        symbol VARCHAR(16) NOT NULL,
        decimal_places SMALLINT NOT NULL DEFAULT 2,
        rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1,
        is_base BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, code)
      )
    `],
    [`currencies_uq`, `
      CREATE UNIQUE INDEX IF NOT EXISTS currencies_tenant_code_uq
        ON currencies (tenant_id, code)
    `],
    [`currencies_base_uq`, `
      CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base_per_tenant
        ON currencies (tenant_id) WHERE is_base = TRUE
    `],
    [`cash_boxes_sys_uq`, `
      CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_one_system_per_currency_kind
        ON cash_boxes (tenant_id, currency_id, box_kind) WHERE is_system = TRUE
    `],
    [`chart_accounts_uq`, `
      CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_tenant_code_uq
        ON chart_of_accounts (tenant_id, account_code)
    `],
  ];
  for (const [label, sql] of stmts) {
    await runStatement(label, sql);
  }
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

  const { ensureTenantSettingsSchema } = require('../server/db/ensureTenantSettings');
  await ensureTenantSettingsSchema();

  await pool.end();
  console.log('migrate:all completed.');
}

main().catch((err) => {
  console.error('migrate:all failed:', err.message);
  pool.end().catch(() => {});
  process.exit(1);
});
