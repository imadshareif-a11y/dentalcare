-- appointments_v5.sql
-- نطاق موعد (من–إلى) لحجز أكثر من 30 دقيقة.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_slot VARCHAR(5);

UPDATE appointments SET end_slot = slot WHERE end_slot IS NULL;

ALTER TABLE appointments ALTER COLUMN end_slot SET DEFAULT NULL;
