-- مراحل اختيارية للعلاجات: قوالب على الكتالوج + مراحل على بنود الخطة

CREATE TABLE IF NOT EXISTS treatment_catalog_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  catalog_id  UUID NOT NULL REFERENCES treatment_catalog(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_stages_catalog
  ON treatment_catalog_stages(catalog_id, sort_order);

CREATE TABLE IF NOT EXISTS treatment_plan_stages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_item_id UUID NOT NULL REFERENCES treatment_plan_items(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order   INT NOT NULL DEFAULT 0,
  is_optional  BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_stages_item
  ON treatment_plan_stages(plan_item_id, sort_order);

ALTER TABLE clinical_session_items
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES treatment_plan_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_session_items_stage
  ON clinical_session_items(stage_id);
