const { pool } = require('./pool');

let ensured = false;

const ENSURE_SQL = `
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS entry_number VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_entry_number
  ON journal_entries(tenant_id, entry_number)
  WHERE entry_number IS NOT NULL;
`;

async function ensureJournalEntryNumberSchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);
  ensured = true;
}

module.exports = { ensureJournalEntryNumberSchema };
