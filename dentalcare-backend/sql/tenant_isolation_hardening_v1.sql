-- tenant_isolation_hardening_v1.sql
-- فرض العزل التام بين العيادات: FORCE RLS + سياسات idempotency

ALTER TABLE IF EXISTS users FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS parties FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chart_of_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS journal_entry_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checks FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenant_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clinical_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clinical_session_items FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS doctors FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS currencies FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tooth_conditions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tooth_chart_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS treatment_plan_items FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cash_boxes FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clinical_session_images FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checkbooks FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fiscal_years FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS banks FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bank_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rooms FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_idempotency ON idempotency_keys;
CREATE POLICY tenant_isolation_idempotency ON idempotency_keys
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

-- WITH CHECK على الجداول الأساسية (INSERT/UPDATE)
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_parties ON parties;
CREATE POLICY tenant_isolation_parties ON parties
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_accounts ON chart_of_accounts;
CREATE POLICY tenant_isolation_accounts ON chart_of_accounts
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_journal ON journal_entries;
CREATE POLICY tenant_isolation_journal ON journal_entries
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_checks ON checks;
CREATE POLICY tenant_isolation_checks ON checks
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_currencies ON currencies;
CREATE POLICY tenant_isolation_currencies ON currencies
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);
