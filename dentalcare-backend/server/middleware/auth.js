// middleware/auth.js
// -----------------------------------------------------------
// تحقق حقيقي من هوية المستخدم — بدون أي "قبول أي باسورد" زي
// اللي كان بآخر نسخة من مشروعك مع Gemini. هاد أول باب دخول
// لأي طلب، وبيفشل بوضوح لو التوكن غير صالح.
// -----------------------------------------------------------

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // ما منسمح للسيرفر يشتغل بدون secret حقيقي — هاي غلطة أمنية
  // شائعة (الاعتماد على قيمة افتراضية مكتوبة بالكود).
  throw new Error('JWT_SECRET environment variable is required.');
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل دخول' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload المتوقع: { userId, tenantId, role }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية' });
  }
}

/**
 * middleware إضافي: يتحقق إنه دور المستخدم من ضمن الأدوار
 * المسموحة للـ route. مثال استخدام:
 *   router.post('/vouchers', requireAuth, requireRole(['OWNER','ACCOUNTANT']), handler)
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
    }
    next();
  };
}

/**
 * التحقق الفعلي من مستوى صلاحية فردي مخزّن بعمود
 * users.permissions (JSONB) — كل قسم إله مستوى مستقل من
 * ثلاثة: 'none' (مخفي) / 'view' (مشاهدة بس) / 'edit' (كامل).
 * بيُقرأ من قاعدة البيانات مباشرة بكل طلب — قصدًا، مش من
 * التوكن — عشان أي تعديل صلاحيات من المدير يصير نافذ فورًا.
 *
 * مثال استخدام:
 *   requirePermission('receipts', 'edit')   // لازم صلاحية كاملة
 *   requirePermission('patients', 'view')   // مشاهدة تكفي (edit كمان بتحقق الشرط)
 */
const PERMISSION_LEVEL_RANK = { none: 0, view: 1, edit: 2 };

function requirePermission(key, minLevel = 'edit') {
  return async (req, res, next) => {
    try {
      const { withTenantClient } = require('../db/pool');
      const level = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query('SELECT permissions FROM users WHERE id = $1', [req.user.userId]);
        return result.rows[0]?.permissions?.[key] || 'none';
      });
      const hasEnough = (PERMISSION_LEVEL_RANK[level] || 0) >= (PERMISSION_LEVEL_RANK[minLevel] || 0);
      if (!hasEnough) {
        return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
      }
      next();
    } catch (err) {
      console.error('Permission check failed:', err);
      res.status(500).json({ error: 'تعذّر التحقق من الصلاحيات' });
    }
  };
}

module.exports = { requireAuth, requireRole, requirePermission };
