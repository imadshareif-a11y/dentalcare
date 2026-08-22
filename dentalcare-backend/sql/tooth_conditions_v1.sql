-- Tenant-editable tooth condition catalog

CREATE TABLE IF NOT EXISTS tooth_conditions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(32) NOT NULL,
    name         VARCHAR(120) NOT NULL,
    name_en      VARCHAR(120),
    name_he      VARCHAR(120),
    category     VARCHAR(32) NOT NULL DEFAULT 'custom',
    color        VARCHAR(16),
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tooth_conditions_tenant
  ON tooth_conditions(tenant_id, sort_order);

ALTER TABLE tooth_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tooth_conditions ON tooth_conditions;
CREATE POLICY tenant_isolation_tooth_conditions ON tooth_conditions
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);
