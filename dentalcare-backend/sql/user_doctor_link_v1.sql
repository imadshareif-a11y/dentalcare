-- ربط حساب المستخدم (users) بسجل الطبيب (parties / doctors)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS doctor_party_id UUID REFERENCES parties(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_doctor_party_per_tenant
  ON users (tenant_id, doctor_party_id)
  WHERE doctor_party_id IS NOT NULL;
