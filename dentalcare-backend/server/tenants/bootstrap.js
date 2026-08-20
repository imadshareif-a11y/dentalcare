// tenants/bootstrap.js
// إنشاء عيادة جديدة: tenant + OWNER + شجرة حسابات أساسية.
// يُستدعى من seed.js ومن مسار SUPER_ADMIN — نفس المنطق بمكان واحد.

const bcrypt = require('bcryptjs');
const { defaultActiveUntil, parseDateInput, todayUTC } = require('./access');

const OWNER_PERMISSIONS = {
  clinical: 'edit',
  appointments: 'edit',
  receipts: 'edit',
  payments: 'edit',
  journal: 'edit',
  openingBalance: 'edit',
  patients: 'edit',
  doctors: 'edit',
  employees: 'edit',
  checks: 'edit',
  reports: 'view',
  accounts: 'edit',
  users: 'edit',
};

const BASE_ACCOUNTS = [
  ['1000', 'الصندوق الرئيسي (نقد)', 'Main Cash', 'קופה ראשית (מזומן)', 'ASSET'],
  ['1100', 'البنك', 'Bank', 'בנק', 'ASSET'],
  ['1200', 'حافظة الشيكات الواردة', 'Checks Holding (Received)', 'תיק שיקים שהתקבלו', 'ASSET'],
  ['2200', 'حافظة الشيكات الصادرة', 'Checks Payable (Issued)', 'תיק שיקים שהונפקו', 'LIABILITY'],
  ['3000', 'رأس المال', 'Equity', 'הון עצמי', 'EQUITY'],
  ['3100', 'رصيد مدور', 'Brought Forward', 'יתרה מועברת', 'EQUITY'],
  ['4000', 'إيرادات العلاجات السريرية', 'Clinical Revenue', 'הכנסות מטיפולים', 'REVENUE'],
  ['4200', 'الخصم المكتسب', 'Purchase discounts earned', 'הנחה שהושגה', 'REVENUE'],
  ['5000', 'مصاريف عامة', 'General Expenses', 'הוצאות כלליות', 'EXPENSE'],
  ['5100', 'عمولات الأطباء', 'Doctor Commissions', 'עמלות רופאים', 'EXPENSE'],
  ['5200', 'المشتريات', 'Purchases', 'רכש', 'EXPENSE'],
  ['5300', 'الخصم المسموح به', 'Sales discounts allowed', 'הנחה מותרת', 'EXPENSE'],
];

function slugifyClinicName(name) {
  const latin = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return latin || `clinic-${Date.now().toString(36)}`;
}

async function ensureUniqueSlug(client, desired) {
  let slug = desired;
  let n = 2;
  while (true) {
    const existing = await client.query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
    if (existing.rowCount === 0) return slug;
    slug = `${desired.slice(0, 36)}-${n}`;
    n += 1;
  }
}

async function assertUsernameAvailable(client, username, excludeUserId) {
  const result = await client.query(
    `SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
    [username, excludeUserId || null]
  );
  if (result.rowCount > 0) {
    const err = new Error('اسم المستخدم هذا مستخدم مسبقًا');
    err.code = '23505';
    throw err;
  }
}

/**
 * يفترض إن caller فاتح transaction على client.
 */
async function bootstrapClinic(client, {
  clinicName, slug, ownerName, ownerUsername, ownerPassword, activeFrom, activeUntil, maxUsers,
}) {
  await assertUsernameAvailable(client, ownerUsername);
  const passwordHash = await bcrypt.hash(ownerPassword, 10);
  const uniqueSlug = await ensureUniqueSlug(client, slug || slugifyClinicName(clinicName));
  const parsedFrom = parseDateInput(activeFrom);
  const parsedUntil = parseDateInput(activeUntil);
  if (parsedFrom === undefined || parsedUntil === undefined) {
    throw new Error('تاريخ التفعيل غير صالح');
  }
  const from = parsedFrom ?? todayUTC();
  const until = parsedUntil ?? defaultActiveUntil(from);
  if (until < from) {
    throw new Error('تاريخ نهاية التفعيل يجب أن يكون بعد تاريخ البداية');
  }
  const maxUsersNum = Number(maxUsers);
  const maxUsersValue = Number.isFinite(maxUsersNum) && maxUsersNum >= 1
    ? Math.min(Math.floor(maxUsersNum), 500)
    : 10;

  const tenantResult = await client.query(
    `INSERT INTO tenants (name, slug, plan, status, active_from, active_until, max_users)
     VALUES ($1, $2, 'TRIAL', 'ACTIVE', $3, $4, $5)
     RETURNING id, slug, active_from, active_until, max_users`,
    [clinicName, uniqueSlug, from, until, maxUsersValue]
  );
  const tenantId = tenantResult.rows[0].id;

  await client.query(
    `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions)
     VALUES ($1, $2, $3, $4, 'OWNER', $5)`,
    [
      tenantId,
      ownerName || `${clinicName} - المدير`,
      ownerUsername,
      passwordHash,
      JSON.stringify(OWNER_PERMISSIONS),
    ]
  );

  for (const [code, nameAr, nameEn, nameHe, type] of BASE_ACCOUNTS) {
    await client.query(
      `INSERT INTO chart_of_accounts
         (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
       VALUES ($1, $2, $3, $3, $4, $5, $6)`,
      [tenantId, code, nameAr, nameEn, nameHe, type]
    );
  }

  const { seedClinicExtras } = require('../settings/defaults');
  await seedClinicExtras(client, tenantId);

  return { tenantId, slug: tenantResult.rows[0].slug };
}

module.exports = { bootstrapClinic, slugifyClinicName, OWNER_PERMISSIONS, assertUsernameAvailable };
