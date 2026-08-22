-- appointments_v3.sql
-- المواعيد لكل طبيب على حدة (نفس الوقت متاح لأطباء مختلفين).

DROP INDEX IF EXISTS appointments_unique_open_slot;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_doctor_slot
    ON appointments (tenant_id, appointment_date, slot, doctor_id)
    WHERE status = 'SCHEDULED' AND doctor_id IS NOT NULL;
