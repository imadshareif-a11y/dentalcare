-- document_drafts_v1.sql — مستندات معلقة (غير مرحّلة) قابلة للتعديل

CREATE TABLE IF NOT EXISTS document_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type     VARCHAR(32) NOT NULL,
    summary         TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_drafts_tenant_type
    ON document_drafts (tenant_id, source_type, updated_at DESC);
