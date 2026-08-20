-- appointments_v1.sql
CREATE TABLE IF NOT EXISTS appointments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id   UUID NOT NULL REFERENCES parties(id),
    doctor_id    UUID REFERENCES parties(id),
    starts_at    TIMESTAMPTZ NOT NULL,
    notes        TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status IN ('SCHEDULED', 'DONE', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_starts
    ON appointments (tenant_id, starts_at);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_appointments ON appointments;
CREATE POLICY tenant_isolation_appointments ON appointments
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
