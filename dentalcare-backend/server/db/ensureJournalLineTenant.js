const { pool } = require('./pool');

let ensured = false;

const ENSURE_SQL = `
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE journal_entry_lines l
SET tenant_id = e.tenant_id
FROM journal_entries e
WHERE l.journal_entry_id = e.id
  AND l.tenant_id IS NULL;
`;

async function ensureJournalLineTenantSchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);
  const nullable = await pool.query(`
    SELECT 1 FROM journal_entry_lines WHERE tenant_id IS NULL LIMIT 1
  `);
  if (nullable.rowCount === 0) {
    await pool.query(`ALTER TABLE journal_entry_lines ALTER COLUMN tenant_id SET NOT NULL`);
  }
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant
      ON journal_entry_lines (tenant_id)
  `);
  ensured = true;
}

module.exports = { ensureJournalLineTenantSchema };
