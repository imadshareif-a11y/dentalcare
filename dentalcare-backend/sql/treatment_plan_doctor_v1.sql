-- treatment_plan_doctor_v1.sql — طبيب بند خطة العلاج
ALTER TABLE treatment_plan_items
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_doctor
  ON treatment_plan_items(doctor_id);
