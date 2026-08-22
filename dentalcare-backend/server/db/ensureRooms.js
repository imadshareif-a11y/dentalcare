// db/ensureRooms.js — يضمن وجود جدول الغرف (نشر بدون migrate يدوي)

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

let ensured = false;

async function ensureRoomsSchema() {
  if (ensured) return;
  const reg = await pool.query(`SELECT to_regclass('public.rooms') AS t`);
  if (reg.rows[0]?.t) {
    ensured = true;
    return;
  }
  const sqlPath = path.join(__dirname, '..', '..', 'sql', 'rooms_v1.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  ensured = true;
  console.log('Applied rooms_v1.sql (startup ensure)');
}

module.exports = { ensureRoomsSchema };
