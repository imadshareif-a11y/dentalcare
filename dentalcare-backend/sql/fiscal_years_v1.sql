-- fiscal_years_v1.sql — سنوات مالية مبسّطة (قفل ترحيل بدون ملف منفصل)
CREATE TABLE IF NOT EXISTS fiscal_years (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year_label   INT NOT NULL,
  starts_on    DATE NOT NULL,
  ends_on      DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'OPEN'
               CHECK (status IN ('OPEN', 'CLOSED')),
  closed_at    TIMESTAMPTZ,
  closed_by    UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year_label)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_tenant
  ON fiscal_years(tenant_id);

ALTER TABLE fiscal_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_fiscal_years ON fiscal_years;
CREATE POLICY tenant_isolation_fiscal_years ON fiscal_years
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
