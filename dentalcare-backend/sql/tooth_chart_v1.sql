-- tooth_chart_v1.sql — حالة السن الحالية + خطة العلاج (المرحلة 1)

CREATE TABLE IF NOT EXISTS tooth_chart_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    tooth_fdi       VARCHAR(10) NOT NULL,
    condition_code  VARCHAR(32) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    source          VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tooth_chart_patient ON tooth_chart_entries(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_tooth_chart_tooth ON tooth_chart_entries(tenant_id, patient_id, tooth_fdi);

CREATE TABLE IF NOT EXISTS treatment_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treatment_plans_active_patient
    ON treatment_plans(tenant_id, patient_id)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS treatment_plan_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    tooth_fdi       VARCHAR(10) NOT NULL,
    condition_code  VARCHAR(32) NOT NULL,
    catalog_id      UUID REFERENCES treatment_catalog(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
    sort_order      INT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan ON treatment_plan_items(plan_id);

ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS condition_code VARCHAR(32);

ALTER TABLE tooth_chart_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_tooth_chart ON tooth_chart_entries;
CREATE POLICY tenant_isolation_tooth_chart ON tooth_chart_entries
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_treatment_plans ON treatment_plans;
CREATE POLICY tenant_isolation_treatment_plans ON treatment_plans
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

DROP POLICY IF EXISTS tenant_isolation_treatment_plan_items ON treatment_plan_items;
CREATE POLICY tenant_isolation_treatment_plan_items ON treatment_plan_items
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

UPDATE treatment_catalog SET condition_code = 'FILLING' WHERE name IN ('حشوة بيضاء', 'حشوة عادية') AND condition_code IS NULL;
UPDATE treatment_catalog SET condition_code = 'ROOT_CANAL' WHERE name = 'علاج عصب' AND condition_code IS NULL;
UPDATE treatment_catalog SET condition_code = 'EXTRACTION' WHERE name IN ('خلع بسيط', 'خلع جراحي') AND condition_code IS NULL;
UPDATE treatment_catalog SET condition_code = 'CROWN' WHERE name = 'تاج' AND condition_code IS NULL;
UPDATE treatment_catalog SET condition_code = 'IMPLANT' WHERE name = 'زراعة' AND condition_code IS NULL;
