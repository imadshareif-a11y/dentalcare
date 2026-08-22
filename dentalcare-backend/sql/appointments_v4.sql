-- appointments_v4.sql
-- ربط الموعد بالغرفة + منع التعارض على مستوى الغرفة.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id);

CREATE INDEX IF NOT EXISTS idx_appointments_room_date
    ON appointments (tenant_id, room_id, appointment_date, slot);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_room_slot
    ON appointments (tenant_id, appointment_date, slot, room_id)
    WHERE status = 'SCHEDULED' AND room_id IS NOT NULL;
