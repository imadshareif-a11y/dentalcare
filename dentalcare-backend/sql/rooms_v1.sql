-- rooms_v1.sql
-- غرف العيادة لجدول المواعيد.

CREATE TABLE IF NOT EXISTS rooms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    name_en     VARCHAR(120),
    name_he     VARCHAR(120),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_rooms ON rooms;
CREATE POLICY tenant_isolation_rooms ON rooms
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
