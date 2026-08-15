-- idempotency.sql
-- -----------------------------------------------------------
-- يمنع ترحيل نفس العملية مرتين لو تكرر الطلب (ريفريش، إعادة
-- محاولة تلقائية من الشبكة، ضغط مزدوج...). الواجهة بتولّد
-- idempotency_key فريد لحظة فتح أي نموذج مالي، وبترسله مع الطلب.
-- -----------------------------------------------------------

CREATE TABLE idempotency_keys (
    key             UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تنظيف دوري اختياري (المفاتيح القديمة ما بنحتاجها بعد فترة)
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);
