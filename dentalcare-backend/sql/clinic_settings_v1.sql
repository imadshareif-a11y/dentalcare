-- clinic_settings_v1.sql
-- إعدادات العيادة، كتالوج العلاجات، وتسجيل الجلسات للتقارير الطبية.

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    date_format          VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
    currency_symbol      VARCHAR(8) NOT NULL DEFAULT '₪',
    decimal_places       SMALLINT NOT NULL DEFAULT 2,
    thousands_separator  VARCHAR(2) NOT NULL DEFAULT ',',
    decimal_separator    VARCHAR(2) NOT NULL DEFAULT '.',
    print_header_text    TEXT NOT NULL DEFAULT '',
    letterhead_mime      VARCHAR(100),
    letterhead_bytes     BYTEA,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treatment_catalog (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treatment_catalog_tenant ON treatment_catalog(tenant_id);

CREATE TABLE IF NOT EXISTS clinical_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id        UUID NOT NULL REFERENCES parties(id),
    doctor_id         UUID REFERENCES parties(id),
    journal_entry_id  UUID REFERENCES journal_entries(id),
    total             NUMERIC(12,2) NOT NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinical_sessions_tenant ON clinical_sessions(tenant_id);

CREATE TABLE IF NOT EXISTS clinical_session_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES clinical_sessions(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tooth       VARCHAR(10),
    name        VARCHAR(255) NOT NULL,
    cost        NUMERIC(12,2) NOT NULL
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_settings ON tenant_settings;
CREATE POLICY tenant_isolation_settings ON tenant_settings
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_treatments ON treatment_catalog;
CREATE POLICY tenant_isolation_treatments ON treatment_catalog
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_sessions ON clinical_sessions;
CREATE POLICY tenant_isolation_sessions ON clinical_sessions
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_session_items ON clinical_session_items;
CREATE POLICY tenant_isolation_session_items ON clinical_session_items
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

INSERT INTO tenant_settings (tenant_id)
SELECT t.id FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM tenant_settings s WHERE s.tenant_id = t.id);

INSERT INTO treatment_catalog (tenant_id, name, price, sort_order)
SELECT t.id, d.name, d.price, d.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('كشف', 50, 1),
    ('تنظيف أسنان', 150, 2),
    ('حشوة بيضاء', 250, 3),
    ('حشوة عادية', 180, 4),
    ('علاج عصب', 600, 5),
    ('خلع بسيط', 200, 6),
    ('خلع جراحي', 450, 7),
    ('تاج', 1200, 8),
    ('زراعة', 3500, 9),
    ('أشعة', 80, 10)
) AS d(name, price, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_catalog c WHERE c.tenant_id = t.id
);
