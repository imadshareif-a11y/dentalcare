-- clinical_sessions_appointment_v1.sql — ربط جلسة سريرية بموعد (اختياري)

ALTER TABLE clinical_sessions
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_sessions_appointment
  ON clinical_sessions(tenant_id, appointment_id);
