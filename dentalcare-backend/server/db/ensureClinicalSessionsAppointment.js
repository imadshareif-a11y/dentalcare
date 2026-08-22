// db/ensureClinicalSessionsAppointment.js — عمود appointment_id على الجلسات

const { pool } = require('./pool');

let ensured = false;

async function ensureClinicalSessionsAppointment() {
  if (ensured) return;

  await pool.query(`
    ALTER TABLE clinical_sessions
      ADD COLUMN IF NOT EXISTS appointment_id UUID;
  `);

  const hasAppointments = await pool.query(
    `SELECT to_regclass('public.appointments') AS t`
  );
  if (hasAppointments.rows[0]?.t) {
    const fk = await pool.query(`
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'clinical_sessions_appointment_id_fkey'
      LIMIT 1
    `);
    if (fk.rowCount === 0) {
      try {
        await pool.query(`
          ALTER TABLE clinical_sessions
            ADD CONSTRAINT clinical_sessions_appointment_id_fkey
            FOREIGN KEY (appointment_id)
            REFERENCES appointments(id)
            ON DELETE SET NULL
        `);
      } catch (err) {
        console.warn('clinical_sessions appointment FK skipped:', err.message);
      }
    }
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_clinical_sessions_appointment
        ON clinical_sessions(tenant_id, appointment_id);
    `);
  }

  ensured = true;
}

module.exports = { ensureClinicalSessionsAppointment };
