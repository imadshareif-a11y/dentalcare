// routes/auth.js
// -----------------------------------------------------------
// نقطة الدخول الوحيدة اللي "ما بتعرف" لأي عيادة تنتمي بعد —
// فهي الاستثناء الوحيد المسموح له يبحث عبر كل العيادات (عن طريق
// withSystemClient، بدون tenant context). بعد ما يتحقق من كلمة
// المرور، الـ JWT الناتج بيثبّت tenantId، وكل طلب بعدها بيلتزم
// فيه حصرًا.
//
// *** لا يوجد هون أي "قبول أي كلمة مرور" — bcrypt.compare حقيقي
// 100%، عكس آخر نسخة من مشروع Gemini تمامًا. ***
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { withSystemClient } = require('../db/pool');

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    const user = await withSystemClient(async (client) => {
      // ملاحظة: username فريد ضمن نفس العيادة بس (schema)، فهون
      // منرجع أول تطابق. لنظام إنتاجي فعلي بعدد كبير من العيادات،
      // الأفضل إضافة عمود email فريد عالميًا بدل هالبحث المفتوح.
      const result = await client.query(
        `SELECT id, tenant_id, name, username, password_hash, role, locale
         FROM users WHERE username = $1 AND is_active = TRUE LIMIT 1`,
        [username]
      );
      return result.rows[0] || null;
    });

    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, locale: user.locale },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role, locale: user.locale },
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'تعذّر تسجيل الدخول، حاول مرة أخرى' });
  }
});

module.exports = router;
