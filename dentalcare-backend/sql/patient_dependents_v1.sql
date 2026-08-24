-- patient_dependents_v1.sql
-- مريض تابع: ملف طبي منفصل + حساب ذمة فرعي تحت ولي الأمر
-- billing_party_id يشير لولي الأمر (الذمة المالية الأساسية)

ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS billing_party_id UUID REFERENCES parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_parties_billing_party
  ON parties (tenant_id, billing_party_id)
  WHERE billing_party_id IS NOT NULL;

-- لا يكون الطرف وليًا لنفسه
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parties_billing_not_self'
  ) THEN
    ALTER TABLE parties
      ADD CONSTRAINT parties_billing_not_self
      CHECK (billing_party_id IS NULL OR billing_party_id <> id);
  END IF;
END $$;

-- ولي الأمر يجب أن يكون مريضًا في نفس العيادة وغير تابع لطرف آخر
CREATE OR REPLACE FUNCTION enforce_patient_billing_party()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  guardian parties%ROWTYPE;
BEGIN
  IF NEW.billing_party_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.party_type IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'ربط الذمة الفرعية متاح لمرضى فقط';
  END IF;

  SELECT * INTO guardian
  FROM parties
  WHERE id = NEW.billing_party_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ولي الأمر غير موجود';
  END IF;

  IF guardian.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'ولي الأمر يجب أن يكون في نفس العيادة';
  END IF;

  IF guardian.party_type IS DISTINCT FROM 'PATIENT' THEN
    RAISE EXCEPTION 'ولي الأمر يجب أن يكون مريضًا';
  END IF;

  IF guardian.billing_party_id IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن ربط مريض بولي هو نفسه تابع (مستوى واحد فقط)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_patient_billing_party ON parties;
CREATE TRIGGER trg_enforce_patient_billing_party
  BEFORE INSERT OR UPDATE OF billing_party_id, party_type, tenant_id
  ON parties
  FOR EACH ROW
  EXECUTE FUNCTION enforce_patient_billing_party();
