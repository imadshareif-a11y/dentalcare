-- cash_boxes_v1.sql
-- صناديق نقدية وصناديق شيكات مرتبطة بعملة + حساب في الدليل.

CREATE TABLE IF NOT EXISTS cash_boxes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    currency_id     UUID NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    box_kind        VARCHAR(20) NOT NULL
                      CHECK (box_kind IN ('CASH', 'CHECKS_IN', 'CHECKS_OUT')),
    name            VARCHAR(160) NOT NULL,
    name_en         VARCHAR(160),
    name_he         VARCHAR(160),
    account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_boxes_tenant_kind
    ON cash_boxes (tenant_id, box_kind, is_active);

CREATE INDEX IF NOT EXISTS idx_cash_boxes_currency
    ON cash_boxes (tenant_id, currency_id, box_kind);

-- صندوق نظام واحد لكل (عملة، نوع) — يسمح بصناديق إضافية يدوية
CREATE UNIQUE INDEX IF NOT EXISTS cash_boxes_one_system_per_currency_kind
    ON cash_boxes (tenant_id, currency_id, box_kind)
    WHERE is_system = TRUE;

ALTER TABLE cash_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_cash_boxes ON cash_boxes;
CREATE POLICY tenant_isolation_cash_boxes ON cash_boxes
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
