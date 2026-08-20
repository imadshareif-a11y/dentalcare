-- appointments_v2.sql
-- Clinic-local date + 30-minute slot so bookings do not depend on timezone conversion.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_date DATE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS slot VARCHAR(5);

UPDATE appointments
SET appointment_date = starts_at::date,
    slot = to_char(starts_at, 'HH24:MI')
WHERE appointment_date IS NULL OR slot IS NULL;

ALTER TABLE appointments ALTER COLUMN appointment_date SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN slot SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_open_slot
    ON appointments (tenant_id, appointment_date, slot)
    WHERE status = 'SCHEDULED';
