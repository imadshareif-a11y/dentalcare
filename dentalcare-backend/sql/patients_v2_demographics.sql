-- patients_v2_demographics.sql
ALTER TABLE parties ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS gender VARCHAR(10);

ALTER TABLE parties DROP CONSTRAINT IF EXISTS parties_gender_check;
ALTER TABLE parties ADD CONSTRAINT parties_gender_check
  CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE'));

ALTER TABLE parties DROP CONSTRAINT IF EXISTS parties_age_check;
ALTER TABLE parties ADD CONSTRAINT parties_age_check
  CHECK (age IS NULL OR (age >= 0 AND age <= 150));
