// db/ensureTenantIsolation.js — FORCE RLS + سياسات تسمح بتجاوز النظام الآمن

const { pool } = require('./pool');

let ensured = false;

/** تجاوز نظامي أو تطابق tenant الحالي (بدون رمي خطأ إذا الإعداد غير مضبوط) */
const TENANT_MATCH = `(
  current_setting('app.bypass_rls', true) = '1'
  OR (
    NULLIF(current_setting('app.current_tenant', true), '') IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
)`;

const LINE_MATCH = `(
  current_setting('app.bypass_rls', true) = '1'
  OR journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE NULLIF(current_setting('app.current_tenant', true), '') IS NOT NULL
      AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
)`;

const TABLES = [
  ['users', 'tenant_isolation_users'],
  ['parties', 'tenant_isolation_parties'],
  ['chart_of_accounts', 'tenant_isolation_accounts'],
  ['journal_entries', 'tenant_isolation_journal'],
  ['journal_entry_lines', 'tenant_isolation_lines', LINE_MATCH],
  ['checks', 'tenant_isolation_checks'],
  ['tenant_settings', 'tenant_isolation_settings'],
  ['treatment_catalog', 'tenant_isolation_treatments'],
  ['clinical_sessions', 'tenant_isolation_sessions'],
  ['clinical_session_items', 'tenant_isolation_session_items'],
  ['appointments', 'tenant_isolation_appointments'],
  ['doctors', 'tenant_isolation_doctors'],
  ['currencies', 'tenant_isolation_currencies'],
  ['tooth_conditions', 'tenant_isolation_tooth_conditions'],
  ['tooth_chart_entries', 'tenant_isolation_tooth_chart'],
  ['treatment_plans', 'tenant_isolation_treatment_plans'],
  ['treatment_plan_items', 'tenant_isolation_treatment_plan_items'],
  ['whatsapp_messages', 'tenant_isolation_whatsapp_messages'],
  ['cash_boxes', 'tenant_isolation_cash_boxes'],
  ['clinical_session_images', 'tenant_isolation_session_images'],
  ['checkbooks', 'tenant_isolation_checkbooks'],
  ['fiscal_years', 'tenant_isolation_fiscal_years'],
  ['banks', 'tenant_isolation_banks'],
  ['bank_accounts', 'tenant_isolation_bank_accounts'],
  ['rooms', 'tenant_isolation_rooms'],
  ['idempotency_keys', 'tenant_isolation_idempotency'],
  ['treatment_catalog_stages', 'tenant_isolation_catalog_stages'],
  ['treatment_plan_stages', 'tenant_isolation_plan_stages'],
];

async function applyTablePolicy(client, table, policyName, usingExpr = TENANT_MATCH) {
  const exists = await client.query(`SELECT to_regclass('public.${table}') AS t`);
  if (!exists.rows[0]?.t) return;

  await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
  await client.query(`DROP POLICY IF EXISTS ${policyName} ON ${table}`);
  await client.query(`
    CREATE POLICY ${policyName} ON ${table}
      USING ${usingExpr}
      WITH CHECK ${usingExpr}
  `);
}

async function ensureTenantIsolation() {
  if (ensured) return;
  const client = await pool.connect();
  try {
    for (const [table, policyName, expr] of TABLES) {
      await applyTablePolicy(client, table, policyName, expr || TENANT_MATCH);
    }
    ensured = true;
  } finally {
    client.release();
  }
}

module.exports = { ensureTenantIsolation };
