// db/ensureCheckbooks.js — يضمن وجود جدول دفاتر الشيكات (Railway / نشر بدون migrate يدوي)

const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

let ensured = false;

async function ensureCheckbooksSchema() {
  if (ensured) return;
  const reg = await pool.query(`SELECT to_regclass('public.checkbooks') AS t`);
  if (reg.rows[0]?.t) {
    ensured = true;
    return;
  }
  const sqlPath = path.join(__dirname, '..', '..', 'sql', 'checkbooks_v1.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  ensured = true;
  console.log('Applied checkbooks_v1.sql (startup ensure)');
}

module.exports = { ensureCheckbooksSchema };
