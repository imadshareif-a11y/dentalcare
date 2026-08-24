// scripts/test-tenant-isolation.js
// فحوصات ثابتة + اختبار حي لعزل العيادات (إن وُجدت قاعدة بيانات).

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROUTES_DIR = path.join(__dirname, '../server/routes');

function readRoute(name) {
  return fs.readFileSync(path.join(ROUTES_DIR, name), 'utf8');
}

function assertRouteIsSafe(name) {
  const src = readRoute(name);
  assert.doesNotMatch(src, /\bpool\.query\b/, `${name} must not call pool.query directly`);
  const usesWrapper = /withTenantClient|withSystemClient/.test(src);
  const delegatesSafely = /postJournalEntry|reverseJournalEntry|sendPatientWhatsapp|sendTomorrowReminders/.test(src);
  assert.ok(usesWrapper || delegatesSafely, `${name} must use tenant DB wrapper or safe service layer`);
}

// --- Static checks (existing + extended) ---

const journalSrc = readRoute('journal.js');
const listStart = journalSrc.indexOf("router.get('/journal-entries'");
const listEnd = journalSrc.indexOf("router.get('/journal-entries/:id'");
assert.ok(listStart >= 0 && listEnd > listStart, 'journal list route missing');
const listSql = journalSrc.slice(listStart, listEnd);
assert.match(listSql, /je\.tenant_id = \$1/, 'posted documents list must filter je.tenant_id');

const engineSrc = fs.readFileSync(path.join(__dirname, '../server/accounting/engine.js'), 'utf8');
assert.match(engineSrc, /INSERT INTO journal_entry_lines[\s\S]*tenant_id/, 'journal lines insert tenant_id');

const chartSrc = readRoute('chartTree.js');
assert.match(chartSrc, /WHERE a\.tenant_id = \$1/, 'chart tree list must filter tenant_id');
assert.match(chartSrc, /UPDATE chart_of_accounts SET is_group = TRUE WHERE id = \$1 AND tenant_id = \$2/, 'chart parent group update must filter tenant_id');

const adminSrc = readRoute('adminDashboard.js');
assert.match(adminSrc, /l\.tenant_id = (cb|p)\.tenant_id/, 'admin dashboard journal joins must filter tenant_id');

const checksSrc = readRoute('checks.js');
assert.match(checksSrc, /UPDATE checks SET[\s\S]*WHERE id = \$3 AND tenant_id = \$4/, 'check clear update must filter tenant_id');
assert.match(checksSrc, /FROM bank_accounts WHERE id = \$1 AND tenant_id = \$2/, 'bank account lookup must filter tenant_id');

const clinicalSrc = readRoute('clinical.js');
assert.match(clinicalSrc, /WHERE s\.patient_id = \$1 AND s\.tenant_id = \$2/, 'patient file must filter tenant_id');

const waSrc = fs.readFileSync(path.join(__dirname, '../server/whatsapp/service.js'), 'utf8');
assert.match(waSrc, /WHERE a\.tenant_id = \$2/, 'whatsapp reminders must filter tenant_id');

const routeFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'));
for (const file of routeFiles) {
  assertRouteIsSafe(file);
}

console.log('tenant isolation source checks passed (%d route files)', routeFiles.length);

// --- Live DB test (optional) ---

async function liveIsolationTest() {
  const { pool, withTenantClient } = require('../server/db/pool');
  const { ensureTenantIsolation } = require('../server/db/ensureTenantIsolation');

  await ensureTenantIsolation();

  const tenants = await pool.query(
    `SELECT id FROM tenants ORDER BY created_at ASC NULLS LAST LIMIT 2`
  );
  if (tenants.rowCount < 2) {
    console.log('live test skipped: need at least 2 tenants in DB');
    await pool.end();
    return;
  }

  const [tenantA, tenantB] = tenants.rows.map((r) => r.id);

  const patientA = await withTenantClient(tenantA, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT' LIMIT 1`,
      [tenantA]
    );
    return r.rows[0]?.id || null;
  });

  const patientB = await withTenantClient(tenantB, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE tenant_id = $1 AND party_type = 'PATIENT' LIMIT 1`,
      [tenantB]
    );
    return r.rows[0]?.id || null;
  });

  if (!patientA || !patientB) {
    console.log('live test skipped: need at least one patient per tenant');
    await pool.end();
    return;
  }

  // Clinic A must not see clinic B patient when querying with tenant A context
  const leak = await withTenantClient(tenantA, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
      [patientB]
    );
    return r.rowCount;
  });
  assert.strictEqual(leak, 0, 'tenant A must not read tenant B patient by UUID');

  // Explicit tenant_id filter also blocks cross-tenant reads
  const explicit = await withTenantClient(tenantA, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE id = $1 AND tenant_id = $2 AND party_type = 'PATIENT'`,
      [patientB, tenantA]
    );
    return r.rowCount;
  });
  assert.strictEqual(explicit, 0, 'explicit tenant_id filter must block cross-tenant read');

  // Clinic A can read its own patient
  const own = await withTenantClient(tenantA, async (client) => {
    const r = await client.query(
      `SELECT id FROM parties WHERE id = $1 AND tenant_id = $2`,
      [patientA, tenantA]
    );
    return r.rowCount;
  });
  assert.strictEqual(own, 1, 'tenant A must read its own patient');

  console.log('live tenant isolation test passed (tenants %s / %s)', tenantA, tenantB);
  await pool.end();
}

liveIsolationTest().catch((err) => {
  if (err.code === 'ECONNREFUSED' || err.message?.includes('connect')) {
    console.log('live test skipped: database not available (%s)', err.message);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
