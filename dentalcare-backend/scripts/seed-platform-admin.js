// إنشاء مستخدم SUPER_ADMIN للمنصة (بدون عيادة).
// الاستخدام: node scripts/seed-platform-admin.js "platform" "كلمة_مرور_قوية"

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../server/db/pool');

async function seed() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('الاستخدام: node scripts/seed-platform-admin.js "platform" "كلمة_مرور"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('كلمة المرور يجب أن تكون 8 خانات على الأقل');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions)
       VALUES (NULL, 'مدير المنصة', $1, $2, 'SUPER_ADMIN', '{}'::jsonb)`,
      [username, passwordHash]
    );
    console.log('تم إنشاء مدير المنصة');
    console.log(`تسجيل الدخول: اترك رمز العيادة فارغًا، المستخدم: ${username}`);
  } catch (err) {
    if (err.code === '23505') {
      console.error('اسم المستخدم هذا موجود مسبقًا كمدير منصة');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
