// whatsapp/client.js — إرسال عبر Meta أو بوابة متوافقة
const { whatsappPhoneCandidates } = require('./phone');

async function sendViaMeta(config, { to, text, templateName, templateParams = [] }) {
  const url = `${config.baseUrl}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  let body;
  if (templateName) {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'ar' },
        components: templateParams.length
          ? [{
            type: 'body',
            parameters: templateParams.map((p) => ({ type: 'text', text: String(p) })),
          }]
          : undefined,
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `WhatsApp Meta error (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return {
    providerRef: data?.messages?.[0]?.id || null,
    raw: data,
  };
}

/**
 * بوابة متوافقة (Ultramsg-style):
 * POST {baseUrl}/messages/chat  JSON: { token, to, body }
 * أو POST {baseUrl} مع نفس الحقول.
 */
async function sendViaCompatible(config, { to, text }) {
  const endpoint = /\/messages(\/chat)?$/i.test(config.baseUrl)
    ? config.baseUrl
    : `${config.baseUrl}/messages/chat`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: config.token,
      to: `+${to}`,
      body: text,
      message: text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || `WhatsApp gateway error (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.statusCode = 502;
    throw err;
  }
  return {
    providerRef: data?.id || data?.message_id || data?.sent || null,
    raw: data,
  };
}

async function sendWhatsappMessage(config, {
  phone,
  text,
  templateName = null,
  templateParams = [],
}) {
  if (!config?.available) {
    let message = 'واتساب غير مهيأ — فعّل الخدمة من الإعدادات';
    if (config?.reason === 'missing_token') message = 'يلزم رمز API لواتساب';
    if (config?.reason === 'missing_base_url') message = 'يلزم عنوان Base URL للبوابة';
    if (config?.reason === 'missing_phone_number_id') message = 'يلزم Phone Number ID من Meta';
    const err = new Error(message);
    err.statusCode = 503;
    throw err;
  }

  const candidates = whatsappPhoneCandidates(phone, config.defaultCountry);
  if (candidates.length === 0) {
    const err = new Error('رقم هاتف المريض غير صالح لواتساب');
    err.statusCode = 400;
    throw err;
  }

  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const to = candidates[i];
    try {
      if (config.provider === 'meta') {
        const result = await sendViaMeta(config, {
          to,
          text,
          templateName: templateName || null,
          templateParams,
        });
        return { ...result, toPhone: to };
      }
      const result = await sendViaCompatible(config, { to, text });
      return { ...result, toPhone: to };
    } catch (err) {
      lastError = err;
      // جرّب الصيغة البديلة (970 ↔ 972) مرة واحدة فقط عند فشل الإرسال
      if (i < candidates.length - 1) continue;
      throw err;
    }
  }
  throw lastError || new Error('تعذّر إرسال واتساب');
}

async function testWhatsappConnection(config) {
  if (!config?.available) {
    const err = new Error('واتساب غير جاهز للاختبار — أكمل الإعدادات وفعّل الخدمة');
    err.statusCode = 400;
    throw err;
  }
  if (config.provider === 'meta') {
    const url = `${config.baseUrl}/${encodeURIComponent(config.phoneNumberId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `فشل اختبار Meta (${res.status})`;
      const err = new Error(msg);
      err.statusCode = 502;
      throw err;
    }
    return { ok: true, provider: 'meta', displayPhone: data?.display_phone_number || null };
  }

  // بوابة: طلب خفيف على الجذر أو /instance أو نعتبر الإعدادات كافية
  const probeUrl = config.baseUrl;
  try {
    const res = await fetch(probeUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    // بعض البوابات ترفض GET — نقبل 401/404 كدليل أن العنوان حي
    if (res.status >= 500) {
      const err = new Error(`البوابة رجعت ${res.status}`);
      err.statusCode = 502;
      throw err;
    }
  } catch (err) {
    if (err.statusCode) throw err;
    // شبكة — نبلّغ لكن لا نفشل إن كان DNS فقط؛ نُظهر التحذير
    const e = new Error(`تعذّر الوصول للبوابة: ${err.message}`);
    e.statusCode = 502;
    throw e;
  }
  return { ok: true, provider: 'compatible' };
}

module.exports = {
  sendWhatsappMessage,
  testWhatsappConnection,
};
