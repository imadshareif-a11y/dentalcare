// db/ensureAppointments.js — عمود end_slot لنطاق المواعيد

const { pool } = require('./pool');

let ensured = false;

const ENSURE_SQL = `
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_slot VARCHAR(5);
UPDATE appointments SET end_slot = slot WHERE end_slot IS NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_plan_item ON appointments(plan_item_id);
`;

async function ensureAppointmentsSchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);
  ensured = true;
}

module.exports = { ensureAppointmentsSchema };
