// routes/auth.js
// -----------------------------------------------------------
// الدخول باسم المستخدم + كلمة المرور فقط. النظام يطابق الحساب
// على مستوى المنصة كلها (اسم المستخدم فريد عالميًا)، فيعرف
// لأي عيادة ينتمي بدون ما نطلب رمز عيادة من العميل.
// -----------------------------------------------------------

const express = require('express');
const multer = require('multer');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { withSystemClient } = require('../db/pool');
const { clinicAccessDeniedReason } = require('../tenants/access');
const { requireAuth } = require('../middleware/auth');
const { ensureUsersAvatarSchema } = require('../db/ensureUsersAvatar');
const { ensureUserDoctorLinkSchema } = require('../db/ensureUserDoctorLink');
const { ensureUserPreferencesSchema } = require('../db/ensureUserPreferences');
const {
  startLoginSession,
  recordFailedLogin,
  endSession,
} = require('../services/userSessions');

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

/** يجب أن يطابق معرفات QUICK_ACTION_CATALOG في الواجهة */
const ALLOWED_QUICK = new Set([
  'receipt',
  'payment',
  'purchase',
  'currencyRates',
  'newPatient',
  'newSupplier',
  'bankEntry',
  'voucher',
  'checks',
  'ledger',
  'clinical',
  'admin',
  'patients',
  'creditNote',
  'debitNote',
]);

function publicUser(row, extras = {}) {
  return {
    id: row.id,
    tenantId: row.tenant_id || null,
    name: row.name,
    username: row.username,
    role: row.role,
    locale: row.locale,
    permissions: row.permissions || {},
    preferences: row.preferences || {},
    hasAvatar: Boolean(row.has_avatar),
    doctorPartyId: row.doctor_party_id || null,
    doctorName: row.doctor_party_name || null,
    ...extras,
  };
}

const USER_PUBLIC_SELECT = `
  u.id, u.tenant_id, u.name, u.username, u.role, u.locale, u.permissions,
  COALESCE(u.preferences, '{}'::jsonb) AS preferences,
  (u.avatar_bytes IS NOT NULL) AS has_avatar,
  u.doctor_party_id,
  dp.name AS doctor_party_name
`;

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    await ensureUsersAvatarSchema();
    await ensureUserDoctorLinkSchema();
    await ensureUserPreferencesSchema();
    const candidates = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT ${USER_PUBLIC_SELECT}, u.password_hash,
                t.status AS tenant_status, t.active_from, t.active_until
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN parties dp ON dp.id = u.doctor_party_id
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
      await withSystemClient(async (client) => {
        await recordFailedLogin(client, { username: username.trim(), req });
      });
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

    const sessionId = await withSystemClient(async (client) => {
      return startLoginSession(client, {
        user,
        req,
        expiresInMs: 12 * 60 * 60 * 1000,
        sessionKind: 'NORMAL',
      });
    });

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id || null, role: user.role, locale: user.locale, sessionId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'تعذّر تسجيل الدخول، حاول مرة أخرى' });
  }
});

router.post('/auth/logout', requireAuth, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await withSystemClient(async (client) => {
        await endSession(client, {
          sessionId: req.user.sessionId,
          userId: req.user.userId,
          tenantId: req.user.tenantId || null,
          req,
        });
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Logout failed:', err);
    res.status(500).json({ error: 'تعذّر تسجيل الخروج' });
  }
});

// يحدّث صلاحيات الجلسة من قاعدة البيانات (بعد تعديل المدير أو migration)
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    await ensureUsersAvatarSchema();
    await ensureUserDoctorLinkSchema();
    await ensureUserPreferencesSchema();
    const row = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT ${USER_PUBLIC_SELECT}, u.is_active,
                t.status AS tenant_status, t.active_from, t.active_until
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         LEFT JOIN parties dp ON dp.id = u.doctor_party_id
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

    res.json(publicUser(row, {
      supportMode: Boolean(req.user.supportMode),
      clinicName: req.user.clinicName || null,
    }));
  } catch (err) {
    console.error('auth/me failed:', err);
    res.status(500).json({ error: 'تعذّر جلب بيانات الجلسة' });
  }
});

router.patch('/auth/preferences', requireAuth, async (req, res) => {
  try {
    await ensureUserPreferencesSchema();
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
         SET preferences = COALESCE(preferences, '{}'::jsonb)
           || jsonb_build_object('quickActions', to_jsonb($1::text[]))
         WHERE id = $2 AND is_active = TRUE
         RETURNING preferences`,
        [quickActions, req.user.userId]
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

router.get('/auth/avatar', requireAuth, async (req, res) => {
  try {
    await ensureUsersAvatarSchema();
    const file = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT avatar_mime, avatar_bytes FROM users WHERE id = $1 AND is_active = TRUE`,
        [req.user.userId]
      );
      return result.rows[0] || null;
    });
    if (!file?.avatar_bytes) return res.status(404).json({ error: 'لا توجد صورة حساب' });
    res.setHeader('Content-Type', file.avatar_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.avatar_bytes);
  } catch (err) {
    console.error('Fetching avatar failed:', err);
    res.status(500).json({ error: 'تعذّر جلب صورة الحساب' });
  }
});

router.post('/auth/avatar', requireAuth, avatarUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'يجب اختيار صورة' });
  if (!AVATAR_MIME.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'الصورة يجب أن تكون PNG أو JPG أو WEBP' });
  }
  try {
    await ensureUsersAvatarSchema();
    await withSystemClient(async (client) => {
      const result = await client.query(
        `UPDATE users
         SET avatar_mime = $2, avatar_bytes = $3
         WHERE id = $1 AND is_active = TRUE`,
        [req.user.userId, req.file.mimetype, req.file.buffer]
      );
      if (result.rowCount === 0) {
        throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });
      }
    });
    res.json({ success: true, mime: req.file.mimetype, hasAvatar: true });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error('Uploading avatar failed:', err);
    res.status(500).json({ error: 'تعذّر رفع صورة الحساب' });
  }
});

router.delete('/auth/avatar', requireAuth, async (req, res) => {
  try {
    await ensureUsersAvatarSchema();
    await withSystemClient(async (client) => {
      const result = await client.query(
        `UPDATE users
         SET avatar_mime = NULL, avatar_bytes = NULL
         WHERE id = $1 AND is_active = TRUE`,
        [req.user.userId]
      );
      if (result.rowCount === 0) {
        throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });
      }
    });
    res.json({ success: true, hasAvatar: false });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error('Deleting avatar failed:', err);
    res.status(500).json({ error: 'تعذّر حذف صورة الحساب' });
  }
});

module.exports = router;
