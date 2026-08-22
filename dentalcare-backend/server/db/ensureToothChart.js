const { pool } = require('./pool');

let ensured = false;

const ENSURE_SQL = `
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
CREATE TABLE IF NOT EXISTS treatment_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS condition_code VARCHAR(32);
ALTER TABLE treatment_plan_items ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES parties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_doctor ON treatment_plan_items(doctor_id);
`;

async function ensureToothChartSchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);

  const hasSessionItems = await pool.query(
    `SELECT to_regclass('public.clinical_session_items') AS t`
  );
  if (hasSessionItems.rows[0]?.t) {
    await pool.query(`
      ALTER TABLE clinical_session_items
        ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_clinical_session_items_plan_item
        ON clinical_session_items(plan_item_id);
    `);
  }

  ensured = true;
}

module.exports = { ensureToothChartSchema };
