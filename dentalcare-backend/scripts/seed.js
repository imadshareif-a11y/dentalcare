require('dotenv').config();
const { pool } = require('../server/db/pool');
const { bootstrapClinic } = require('../server/tenants/bootstrap');

async function seed() {
  const [, , clinicName, username, password] = process.argv;
  if (!clinicName || !username || !password) {
    console.error('الاستخدام: node scripts/seed.js "اسم العيادة" "admin" "كلمة_مرور"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('كلمة المرور يجب أن تكون 8 خانات على الأقل');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await bootstrapClinic(client, {
      clinicName,
      ownerUsername: username,
      ownerPassword: password,
    });
    await client.query('COMMIT');
    console.log('تم إنشاء العيادة والمستخدم بنجاح');
    console.log(`   العيادة: ${clinicName}`);
    console.log(`   رمز العيادة (slug): ${created.slug}`);
    console.log(`   تسجيل الدخول: ${username} + رمز العيادة أعلاه`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('فشل التأسيس:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
