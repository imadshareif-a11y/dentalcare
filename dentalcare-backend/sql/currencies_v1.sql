-- currencies_v1.sql
-- عملات العيادة: إضافة/تعديل ديناميكي، عملة أساس واحدة لكل tenant.

CREATE TABLE IF NOT EXISTS currencies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(10) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    name_en         VARCHAR(120),
    name_he         VARCHAR(120),
    symbol          VARCHAR(16) NOT NULL,
    decimal_places  SMALLINT NOT NULL DEFAULT 2,
    rate_to_base    NUMERIC(18, 8) NOT NULL DEFAULT 1,
    is_base         BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (decimal_places >= 0 AND decimal_places <= 6),
    CHECK (rate_to_base > 0),
    CHECK (code = upper(trim(code))),
    UNIQUE (tenant_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base_per_tenant
    ON currencies (tenant_id)
    WHERE is_base = TRUE;

CREATE INDEX IF NOT EXISTS idx_currencies_tenant
    ON currencies (tenant_id, is_active, code);

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_currencies ON currencies;
CREATE POLICY tenant_isolation_currencies ON currencies
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- بذرة عملة أساس لكل عيادة من رمز الإعدادات الحالي (أو ₪)
INSERT INTO currencies (tenant_id, code, name, name_en, name_he, symbol, decimal_places, rate_to_base, is_base, is_active)
SELECT
    t.id,
    'ILS',
    'شيكل إسرائيلي',
    'Israeli Shekel',
    'שקל חדש',
    COALESCE(NULLIF(trim(s.currency_symbol), ''), '₪'),
    2,
    1,
    TRUE,
    TRUE
FROM tenants t
LEFT JOIN tenant_settings s ON s.tenant_id = t.id
ON CONFLICT (tenant_id, code) DO NOTHING;
