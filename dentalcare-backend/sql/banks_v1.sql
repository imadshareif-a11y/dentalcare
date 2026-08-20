-- banks_v1.sql
-- كتالوج البنوك (رقم + اسم) + الحسابات البنكية للعيادة بأنواعها.

CREATE TABLE IF NOT EXISTS banks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bank_number     VARCHAR(20) NOT NULL,
    name            VARCHAR(160) NOT NULL,
    name_en         VARCHAR(160),
    name_he         VARCHAR(160),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, bank_number)
);

CREATE INDEX IF NOT EXISTS idx_banks_tenant
    ON banks (tenant_id, is_active, bank_number);

ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_banks ON banks;
CREATE POLICY tenant_isolation_banks ON banks
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bank_id             UUID REFERENCES banks(id) ON DELETE SET NULL,
    account_kind        VARCHAR(20) NOT NULL
                          CHECK (account_kind IN ('CURRENT', 'COLLECTION', 'PAYMENT', 'SAVINGS')),
    name                VARCHAR(160) NOT NULL,
    name_en             VARCHAR(160),
    name_he             VARCHAR(160),
    account_number      VARCHAR(60),
    currency_id         UUID REFERENCES currencies(id) ON DELETE SET NULL,
    chart_account_id    UUID NOT NULL REFERENCES chart_of_accounts(id),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, chart_account_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant_kind
    ON bank_accounts (tenant_id, account_kind, is_active);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bank_accounts ON bank_accounts;
CREATE POLICY tenant_isolation_bank_accounts ON bank_accounts
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- رقم البنك على الشيكات (للاعتماد على كتالوج البنوك)
ALTER TABLE checks
    ADD COLUMN IF NOT EXISTS bank_number VARCHAR(20);
