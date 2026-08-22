const { resolveAiConfig } = require('../settings/aiConfig');

const LOCALES = ['ar', 'en', 'he'];
const TRANSLATE_TIMEOUT_MS = 15000;

function normalizeLocale(locale) {
  const l = String(locale || 'ar').slice(0, 2).toLowerCase();
  return LOCALES.includes(l) ? l : 'ar';
}

function fallbackLocalizedNames(text, locale) {
  const trimmed = String(text || '').trim();
  const loc = normalizeLocale(locale);
  const out = { name: trimmed, name_en: trimmed, name_he: trimmed };
  if (loc === 'en') out.name_en = trimmed;
  else if (loc === 'he') out.name_he = trimmed;
  else out.name = trimmed;
  return out;
}

async function fetchJson(url, options, timeoutMs = TRANSLATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Translation API failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseTranslationJson(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const parsed = JSON.parse(candidate);
  return {
    name: String(parsed.ar || parsed.name || '').trim(),
    name_en: String(parsed.en || parsed.name_en || '').trim(),
    name_he: String(parsed.he || parsed.name_he || '').trim(),
  };
}

async function translateWithAi(text, sourceLocale, config) {
  const src = normalizeLocale(sourceLocale);
  const prompt = [
    'Translate this short clinic label into Arabic (ar), English (en), and Hebrew (he).',
    `Source locale: ${src}`,
    `Source text: ${JSON.stringify(text)}`,
    'Reply with JSON only: {"ar":"...","en":"...","he":"..."}',
    'Keep numbers and codes unchanged. Be concise.',
  ].join('\n');

  if (config.apiStyle === 'gemini') {
    const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`;
    const data = await fetchJson(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
    });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const reply = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
    return parseTranslationJson(reply);
  }

  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const data = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const reply = data?.choices?.[0]?.message?.content;
  return parseTranslationJson(reply);
}

async function loadTenantAiConfig(client, tenantId) {
  const result = await client.query(
    `SELECT ai_enabled, ai_provider, ai_api_key, ai_base_url, ai_vision_model
     FROM tenant_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  return resolveAiConfig(result.rows[0] || {});
}

/**
 * يحوّل نصًا بلغة واحدة إلى name / name_en / name_he.
 * يترجم بالذكاء الاصطناعي إن وُجد، وإلا ينسخ للحقول الأخرى.
 */
async function resolveLocalizedNames(client, tenantId, { text, locale }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { name: null, name_en: null, name_he: null };
  }

  const loc = normalizeLocale(locale);
  try {
    const aiConfig = await loadTenantAiConfig(client, tenantId);
    if (aiConfig.available) {
      const translated = await translateWithAi(trimmed, loc, aiConfig);
      const fallback = fallbackLocalizedNames(trimmed, loc);
      return {
        name: translated.name || fallback.name,
        name_en: translated.name_en || fallback.name_en,
        name_he: translated.name_he || fallback.name_he,
      };
    }
  } catch (err) {
    console.warn('Auto-translation failed, using fallback:', err.message);
  }
  return fallbackLocalizedNames(trimmed, loc);
}

/**
 * يقرأ body من الواجهة: { name, locale } أو الحقول القديمة.
 */
async function namesFromBody(client, tenantId, body, { partial = false } = {}) {
  const hasLegacy = body.nameEn !== undefined || body.nameHe !== undefined;
  const hasSingle = body.name !== undefined || body.label !== undefined;

  if (hasSingle && !hasLegacy) {
    const text = body.name ?? body.label;
    if (partial && (text === undefined || text === null || String(text).trim() === '')) {
      return null;
    }
    return resolveLocalizedNames(client, tenantId, {
      text,
      locale: body.locale || body.lang,
    });
  }

  if (hasLegacy || hasSingle) {
    const names = await resolveLocalizedNames(client, tenantId, {
      text: body.name ?? body.label ?? '',
      locale: body.locale || body.lang || 'ar',
    });
    if (body.nameEn !== undefined && body.nameEn !== null) {
      names.name_en = String(body.nameEn).trim() || null;
    }
    if (body.nameHe !== undefined && body.nameHe !== null) {
      names.name_he = String(body.nameHe).trim() || null;
    }
    if (body.name !== undefined && body.name !== null && String(body.name).trim()) {
      const primary = await resolveLocalizedNames(client, tenantId, {
        text: body.name,
        locale: body.locale || body.lang || 'ar',
      });
      Object.assign(names, primary);
    }
    return names;
  }

  return null;
}

function toChartAccountFields(localized) {
  const name = localized.name || localized.name_en || localized.name_he || '';
  return {
    account_name: name,
    account_name_ar: localized.name || name,
    account_name_en: localized.name_en || null,
    account_name_he: localized.name_he || null,
  };
}

module.exports = {
  normalizeLocale,
  resolveLocalizedNames,
  namesFromBody,
  toChartAccountFields,
  fallbackLocalizedNames,
};
