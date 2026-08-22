// db/ensureAppointments.js — end_slot + ربط اختياري ببند خطة علاج

const { pool } = require('./pool');

let ensured = false;

async function ensureAppointmentsSchema() {
  if (ensured) return;

  await pool.query(`
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_slot VARCHAR(5);
  `);
  await pool.query(`
    UPDATE appointments SET end_slot = slot WHERE end_slot IS NULL;
  `);

  // عمود بدون FK أولاً حتى لا يفشل الإقلاع إن لم تُنشأ جداول الخطة بعد
  await pool.query(`
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS plan_item_id UUID;
  `);

  const hasPlanItems = await pool.query(
    `SELECT to_regclass('public.treatment_plan_items') AS t`
  );
  if (hasPlanItems.rows[0]?.t) {
    const fk = await pool.query(`
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'appointments_plan_item_id_fkey'
      LIMIT 1
    `);
    if (fk.rowCount === 0) {
      try {
        await pool.query(`
          ALTER TABLE appointments
            ADD CONSTRAINT appointments_plan_item_id_fkey
            FOREIGN KEY (plan_item_id)
            REFERENCES treatment_plan_items(id)
            ON DELETE SET NULL
        `);
      } catch (err) {
        // عمود موجود بالفعل أو قيود متضاربة — لا نمنع المواعيد
        console.warn('appointments plan_item FK skipped:', err.message);
      }
    }
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_plan_item ON appointments(plan_item_id);
    `);
  }

  ensured = true;
}

module.exports = { ensureAppointmentsSchema };
