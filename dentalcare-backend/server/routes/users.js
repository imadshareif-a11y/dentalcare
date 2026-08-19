// routes/users.js
// -----------------------------------------------------------
// *** كل route هون requireRole(['OWNER']) صراحة، مش
// requirePermission() ***. هاد قرار أمان متعمّد: لو سمحنا لصلاحية
// قابلة للتخصيص تتحكم بـ"مين يقدر يعدّل صلاحيات مين"، ممكن مستخدم
// غير-مدير يوصله صلاحية "users" بالغلط (أو بقرار إداري) ويعطي
// نفسه صلاحيات أعلى منه — تصعيد صلاحيات. هاي القاعدة الوحيدة يلي
// بتضل مقفولة بالكود دايمًا، مش قابلة للتخصيص من أي واجهة.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

const VALID_ROLES = ['OWNER', 'ACCOUNTANT', 'DOCTOR', 'RECEPTIONIST'];
const PERMISSION_KEYS = [
  'clinical', 'receipts', 'payments', 'journal', 'openingBalance',
  'patients', 'doctors', 'checks', 'reports', 'users',
];
const VALID_LEVELS = ['none', 'view', 'edit'];

// الصلاحيات الافتراضية حسب الدور — نقطة انطلاق وقت إنشاء مستخدم
// جديد، وبعدها المدير يقدر يعدّلها فرديًا أي وقت. لاحظ الـ
// RECEPTIONIST هون: عندها صلاحية "سند قبض" كاملة (edit) — سيناريو
// حقيقي طلبته عيادات فعلية — بس باقي المحاسبة (صرف، قيد) مخفية
// عنها تمامًا، ومرضى/شيكات/تقارير مشاهدة بس
const DEFAULT_PERMISSIONS = {
  OWNER: {
    clinical: 'edit', receipts: 'edit', payments: 'edit', journal: 'edit', openingBalance: 'edit',
    patients: 'edit', doctors: 'edit', checks: 'edit', reports: 'view', users: 'edit',
  },
  ACCOUNTANT: {
    clinical: 'none', receipts: 'edit', payments: 'edit', journal: 'edit', openingBalance: 'none',
    patients: 'edit', doctors: 'view', checks: 'edit', reports: 'view', users: 'none',
  },
  DOCTOR: {
    clinical: 'edit', receipts: 'none', payments: 'none', journal: 'none', openingBalance: 'none',
    patients: 'view', doctors: 'none', checks: 'none', reports: 'view', users: 'none',
  },
  RECEPTIONIST: {
    clinical: 'none', receipts: 'edit', payments: 'none', journal: 'none', openingBalance: 'none',
    patients: 'edit', doctors: 'none', checks: 'view', reports: 'view', users: 'none',
  },
};

function sanitizePermissionsOverride(overrides) {
  if (!overrides || typeof overrides !== 'object') return {};
  const clean = {};
  for (const key of PERMISSION_KEYS) {
    if (VALID_LEVELS.includes(overrides[key])) clean[key] = overrides[key];
  }
  return clean;
}

// يرجّع القوائم والافتراضيات — الواجهة بتستخدمها عشان تبني
// checkboxes ديناميكيًا بدون ما تكرر نفس القائمة يدويًا بالفرونت
router.get('/permission-defaults', requireAuth, requireRole(['OWNER']), (req, res) => {
  res.json({ keys: PERMISSION_KEYS, levels: VALID_LEVELS, defaults: DEFAULT_PERMISSIONS });
});

router.post(
  '/users',
  requireAuth,
  requireRole(['OWNER']),
  async (req, res) => {
    const { name, username, password, role, permissions } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'دور غير صالح' });
    }

    // نبلش من الصلاحيات الافتراضية لهذا الدور، وبعدها نطبّق أي
    // تخصيص أرسله المدير فوقها (لو حدد)
    const finalPermissions = {
      ...DEFAULT_PERMISSIONS[role],
      ...sanitizePermissionsOverride(permissions),
    };

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [req.user.tenantId, name.trim(), username.trim(), passwordHash, role, JSON.stringify(finalPermissions)]
        );
        return result.rows[0].id;
      });

      res.status(201).json({ success: true, userId, permissions: finalPermissions });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'اسم المستخدم هذا مستخدم مسبقًا' });
      }
      console.error('User creation failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء المستخدم' });
    }
  }
);

router.get(
  '/users',
  requireAuth,
  requireRole(['OWNER']),
  async (req, res) => {
    try {
      const users = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, name, username, role, is_active, permissions
           FROM users ORDER BY name ASC`
        );
        return result.rows;
      });
      res.json(users);
    } catch (err) {
      console.error('Fetching users failed:', err);
      res.status(500).json({ error: 'تعذّر جلب قائمة المستخدمين' });
    }
  }
);

// تعديل صلاحيات مستخدم موجود — دمج جزئي (مش استبدال كامل)، أي
// مفتاح ما تم إرساله بيضل على قيمته الحالية بدون تغيير
router.patch(
  '/users/:id/permissions',
  requireAuth,
  requireRole(['OWNER']),
  async (req, res) => {
    const { id } = req.params;
    const clean = sanitizePermissionsOverride(req.body.permissions);

    if (Object.keys(clean).length === 0) {
      return res.status(400).json({ error: 'لم يتم إرسال أي صلاحية صالحة للتعديل' });
    }

    try {
      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE users SET permissions = permissions || $1::jsonb
           WHERE id = $2
           RETURNING id, permissions`,
          [JSON.stringify(clean), id]
        );
        return result.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'المستخدم غير موجود' });
      res.json({ success: true, permissions: updated.permissions });
    } catch (err) {
      console.error('Permission update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث الصلاحيات' });
    }
  }
);

module.exports = router;
