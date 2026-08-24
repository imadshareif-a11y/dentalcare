// db/ensureTenantIsolation.js — FORCE RLS على كل جدول فيه tenant_id
// ملاحظة: مستخدم Postgres superuser (شائع على Railway) يتجاوز RLS.
// لذلك الاستعلامات لازم تضع tenant_id صراحة — RLS طبقة إضافية فقط.

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

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function dropAllPolicies(client, table) {
  const policies = await client.query(
    `SELECT pol.polname
     FROM pg_policy pol
     JOIN pg_class c ON c.oid = pol.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1`,
    [table]
  );
  for (const row of policies.rows) {
    await client.query(`DROP POLICY IF EXISTS ${quoteIdent(row.polname)} ON ${quoteIdent(table)}`);
  }
}

async function applyTablePolicy(client, table, policyName, usingExpr = TENANT_MATCH) {
  const exists = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  if (!exists.rows[0]?.t) return;

  await client.query(`ALTER TABLE ${quoteIdent(table)} ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE ${quoteIdent(table)} FORCE ROW LEVEL SECURITY`);
  await dropAllPolicies(client, table);
  await client.query(`
    CREATE POLICY ${quoteIdent(policyName)} ON ${quoteIdent(table)}
      USING ${usingExpr}
      WITH CHECK ${usingExpr}
  `);
}

async function listTenantTables(client) {
  const result = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  return result.rows.map((row) => row.table_name);
}

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rowCount > 0;
}

async function ensureTenantIsolation() {
  if (ensured) return;
  const client = await pool.connect();
  try {
    const tables = await listTenantTables(client);
    for (const table of tables) {
      await applyTablePolicy(client, table, `tenant_isolation_${table}`, TENANT_MATCH);
    }

    if (await columnExists(client, 'journal_entry_lines', 'tenant_id')) {
      await applyTablePolicy(client, 'journal_entry_lines', 'tenant_isolation_journal_entry_lines', TENANT_MATCH);
    } else {
      await applyTablePolicy(client, 'journal_entry_lines', 'tenant_isolation_journal_entry_lines', LINE_MATCH);
    }

    ensured = true;
  } finally {
    client.release();
  }
}

module.exports = { ensureTenantIsolation };
