-- tenant_delete_fk_v1.sql
-- يسمح بحذف العيادة (CASCADE) دون تعارض ترتيب journal_entries ↔ clinical_sessions

ALTER TABLE clinical_sessions
  DROP CONSTRAINT IF EXISTS clinical_sessions_journal_entry_id_fkey;

ALTER TABLE clinical_sessions
  ADD CONSTRAINT clinical_sessions_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

ALTER TABLE idempotency_keys
  DROP CONSTRAINT IF EXISTS idempotency_keys_journal_entry_id_fkey;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reversed_by_fkey;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_reversed_by_fkey
  FOREIGN KEY (reversed_by) REFERENCES journal_entries(id) ON DELETE SET NULL;

ALTER TABLE fiscal_years
  DROP CONSTRAINT IF EXISTS fiscal_years_closed_by_fkey;

ALTER TABLE fiscal_years
  ADD CONSTRAINT fiscal_years_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE parties
  DROP CONSTRAINT IF EXISTS fk_parties_account;

ALTER TABLE parties
  ADD CONSTRAINT fk_parties_account
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE checks
  DROP CONSTRAINT IF EXISTS checks_holding_account_id_fkey;

ALTER TABLE checks
  ADD CONSTRAINT checks_holding_account_id_fkey
  FOREIGN KEY (holding_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE checks
  DROP CONSTRAINT IF EXISTS checks_location_account_id_fkey;

ALTER TABLE checks
  ADD CONSTRAINT checks_location_account_id_fkey
  FOREIGN KEY (location_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
