-- appointments_v6.sql — ربط اختياري ببند خطة علاج

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_plan_item ON appointments(plan_item_id);
