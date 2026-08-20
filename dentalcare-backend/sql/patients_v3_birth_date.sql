-- patients_v3_birth_date.sql
ALTER TABLE parties ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE parties DROP CONSTRAINT IF EXISTS parties_age_check;
ALTER TABLE parties DROP COLUMN IF EXISTS age;
