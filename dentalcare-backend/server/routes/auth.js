// routes/auth.js
// -----------------------------------------------------------
// الدخول باسم المستخدم + كلمة المرور فقط. النظام يطابق الحساب
// على مستوى المنصة كلها (اسم المستخدم فريد عالميًا)، فيعرف
// لأي عيادة ينتمي بدون ما نطلب رمز عيادة من العميل.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { withSystemClient } = require('../db/pool');
const { clinicAccessDeniedReason } = require('../tenants/access');
const { requireAuth } = require('../middleware/auth');

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    const candidates = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT u.id, u.tenant_id, u.name, u.username, u.password_hash, u.role, u.locale, u.permissions,
                COALESCE(u.preferences, '{}'::jsonb) AS preferences,
                t.status AS tenant_status, t.active_from, t.active_until
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE LOWER(u.username) = LOWER($1) AND u.is_active = TRUE`,
        [username.trim()]
      );
      return result.rows;
    });

    const matches = [];
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(password, candidate.password_hash);
      if (valid) matches.push(candidate);
    }

    if (matches.length === 0) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (matches.length > 1) {
      return res.status(409).json({ error: 'اسم المستخدم هذا مرتبط بأكثر من حساب. تواصل مع إدارة المنصة' });
    }

    const user = matches[0];

    if (user.role !== 'SUPER_ADMIN') {
      const denied = clinicAccessDeniedReason({
        status: user.tenant_status,
        active_from: user.active_from,
        active_until: user.active_until,
      });
      if (denied) return res.status(403).json({ error: denied });
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id || null, role: user.role, locale: user.locale },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id, name: user.name, username: user.username, role: user.role,
        locale: user.locale, permissions: user.permissions || {},
        preferences: user.preferences || {},
      },
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'تعذّر تسجيل الدخول، حاول مرة أخرى' });
  }
});

// يحدّث صلاحيات الجلسة من قاعدة البيانات (بعد تعديل المدير أو migration)
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { withSystemClient } = require('../db/pool');
    const row = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT u.id, u.name, u.username, u.role, u.locale, u.permissions, u.is_active,
                COALESCE(u.preferences, '{}'::jsonb) AS preferences,
                t.status AS tenant_status, t.active_from, t.active_until
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = $1`,
        [req.user.userId]
      );
      return result.rows[0] || null;
    });

    if (!row || !row.is_active) {
      return res.status(401).json({ error: 'الحساب غير موجود أو غير نشط' });
    }

    if (row.role !== 'SUPER_ADMIN' && !req.user.supportMode) {
      const denied = clinicAccessDeniedReason({
        status: row.tenant_status,
        active_from: row.active_from,
        active_until: row.active_until,
      });
      if (denied) return res.status(403).json({ error: denied });
    }

    res.json({
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      locale: row.locale,
      permissions: row.permissions || {},
      preferences: row.preferences || {},
      supportMode: Boolean(req.user.supportMode),
      clinicName: req.user.clinicName || null,
    });
  } catch (err) {
    console.error('auth/me failed:', err);
    res.status(500).json({ error: 'تعذّر جلب بيانات الجلسة' });
  }
});

const ALLOWED_QUICK = new Set([
  'receipt', 'payment', 'purchase', 'newPatient', 'newSupplier',
  'bankEntry', 'voucher', 'checks', 'ledger', 'clinical', 'patients',
  'creditNote', 'debitNote',
]);

router.patch('/auth/preferences', requireAuth, async (req, res) => {
  try {
    const { withSystemClient } = require('../db/pool');
    const quickActions = Array.isArray(req.body.quickActions)
      ? [...new Set(req.body.quickActions.map(String).filter((id) => ALLOWED_QUICK.has(id)))]
      : null;

    if (!quickActions) {
      return res.status(400).json({ error: 'قائمة أزرار المفضل غير صالحة' });
    }
    if (quickActions.length === 0) {
      return res.status(400).json({ error: 'اختر زر وصول سريع واحدًا على الأقل' });
    }

    const preferences = await withSystemClient(async (client) => {
      const result = await client.query(
        `UPDATE users
         SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('quickActions', $1::jsonb)
         WHERE id = $2 AND is_active = TRUE
         RETURNING preferences`,
        [JSON.stringify(quickActions), req.user.userId]
      );
      if (result.rowCount === 0) {
        throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });
      }
      return result.rows[0].preferences || {};
    });

    res.json({ success: true, preferences });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error('Updating preferences failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ التفضيلات' });
  }
});

module.exports = router;
