-- checkbooks_v1.sql — دفاتر الشيكات لكل حساب بنكي

CREATE TABLE IF NOT EXISTS checkbooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  serial_from     VARCHAR(50) NOT NULL,
  serial_to       VARCHAR(50) NOT NULL,
  next_serial     VARCHAR(50) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkbooks_tenant_account_idx
  ON checkbooks (tenant_id, bank_account_id);

ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS checkbook_id UUID REFERENCES checkbooks(id);

CREATE INDEX IF NOT EXISTS checks_tenant_bank_account_number_idx
  ON checks (tenant_id, bank_account_id, check_number)
  WHERE check_type = 'ISSUED' AND bank_account_id IS NOT NULL;

ALTER TABLE checkbooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_checkbooks ON checkbooks;
CREATE POLICY tenant_isolation_checkbooks ON checkbooks
    USING (tenant_id = current_setting('app.current_tenant')::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);
