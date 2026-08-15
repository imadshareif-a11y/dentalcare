// scripts/seed.js
// -----------------------------------------------------------
// يُشغَّل مرة واحدة يدويًا (npm run seed) لإنشاء أول عيادة
// وأول مستخدم OWNER. هذا الاستثناء الوحيد اللي بيكتب مباشرة
// بدون المرور بأي route — لأنه بالتعريف ما في مستخدم مسجّل
// دخول بعد ليطلب هالعملية عبر الـ API.
//
// لتشغيله: node scripts/seed.js "اسم العيادة" "admin" "كلمة_مرور_قوية"
// -----------------------------------------------------------

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../server/db/pool');

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

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, plan, status) VALUES ($1, 'TRIAL', 'ACTIVE') RETURNING id`,
      [clinicName]
    );
    const tenantId = tenantResult.rows[0].id;

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO users (tenant_id, name, username, password_hash, role)
       VALUES ($1, $2, $3, $4, 'OWNER')`,
      [tenantId, clinicName + ' - المدير', username, passwordHash]
    );

    // شجرة حسابات أساسية — الحد الأدنى للتشغيل، تُوسّع لاحقًا
    // من داخل الواجهة نفسها
    const baseAccounts = [
      ['1000', 'الصندوق الرئيسي (نقد)', 'ASSET'],
      ['1100', 'البنك', 'ASSET'],
      ['3000', 'رأس المال', 'EQUITY'],
      ['4000', 'إيرادات العلاجات السريرية', 'REVENUE'],
      ['5000', 'مصاريف عامة', 'EXPENSE'],
    ];
    for (const [code, name, type] of baseAccounts) {
      await client.query(
        `INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_type)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, code, name, type]
      );
    }

    await client.query('COMMIT');
    console.log('✅ تم إنشاء العيادة والمستخدم بنجاح');
    console.log(`   العيادة: ${clinicName} (${tenantId})`);
    console.log(`   تسجيل الدخول: ${username} / (كلمة المرور اللي أدخلتها)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ فشل التأسيس:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
