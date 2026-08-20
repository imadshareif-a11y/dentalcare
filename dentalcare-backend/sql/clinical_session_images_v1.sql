-- صور الأشعة / الصور الطبية المرتبطة بالجلسة السريرية
CREATE TABLE IF NOT EXISTS clinical_session_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES clinical_sessions(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind            VARCHAR(40) NOT NULL DEFAULT 'XRAY',
    label           VARCHAR(255),
    mime            VARCHAR(100) NOT NULL,
    bytes           BYTEA NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    ai_report       TEXT,
    ai_analyzed_at  TIMESTAMPTZ,
    ai_model        VARCHAR(120),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_session_images_session
  ON clinical_session_images(session_id);

CREATE INDEX IF NOT EXISTS idx_clinical_session_images_tenant
  ON clinical_session_images(tenant_id);

ALTER TABLE clinical_session_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_session_images ON clinical_session_images;
CREATE POLICY tenant_isolation_session_images ON clinical_session_images
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
