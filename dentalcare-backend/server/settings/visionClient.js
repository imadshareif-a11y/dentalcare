// settings/visionClient.js — استدعاءات Vision مع مهلة زمنية
const { resolveAiConfig, AI_PROVIDERS, normalizeProvider } = require('./aiConfig');

const VISION_TIMEOUT_MS = Number(process.env.AI_VISION_TIMEOUT_MS) || 60000;

function analyzePrompt(locale) {
  const lang = locale === 'en' ? 'English' : locale === 'he' ? 'Hebrew' : 'Arabic';
  return [
    'You are an assistive dental radiology helper for licensed dentists.',
    'Describe only what is visually plausible on this dental radiograph.',
    'Structure the report with short sections: Overview, Notable findings, Areas to review clinically, Suggested follow-up.',
    'Do NOT claim a definitive diagnosis. Do NOT invent patient identity. Be cautious and hedging.',
    'End with a one-line disclaimer that this is decision support only and the treating dentist decides.',
    `Write the entire report in ${lang}.`,
  ].join(' ');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = VISION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
      const timeoutErr = new Error('انتهت مهلة الاتصال بمزوّد التحليل');
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatibleVision({ mime, bytes, locale, config }) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = config.model || 'gpt-4o-mini';
  const b64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analyzePrompt(locale) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Vision API failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    const err = new Error('لم يُرجع نموذج التحليل تقريرًا');
    err.statusCode = 502;
    throw err;
  }
  return { report: String(text).trim(), model };
}

async function callGeminiVision({ mime, bytes, locale, config }) {
  const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = config.model || 'gemini-2.0-flash';
  const b64 = Buffer.from(bytes).toString('base64');
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: analyzePrompt(locale) },
          { inline_data: { mime_type: mime, data: b64 } },
        ],
      }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini API failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
  if (!text) {
    const err = new Error('لم يُرجع نموذج التحليل تقريرًا');
    err.statusCode = 502;
    throw err;
  }
  return { report: text, model };
}

async function callVisionApi({ mime, bytes, locale, config }) {
  if (!config?.available || !config.apiKey) {
    let message = 'خدمة تحليل الصور غير مهيأة — فعّل الخدمة وأضف مفتاح API من الإعدادات';
    if (config?.reason === 'disabled') {
      message = 'تحليل الذكاء الاصطناعي غير مفعّل من إعدادات العيادة';
    } else if (config?.reason === 'missing_base_url') {
      message = 'يلزم عنوان API للمزوّد المتوافق';
    } else if (config?.reason === 'missing_key') {
      message = 'يلزم مفتاح API من إعدادات العيادة';
    }
    const err = new Error(message);
    err.statusCode = 503;
    throw err;
  }

  if (config.apiStyle === 'gemini') {
    return callGeminiVision({ mime, bytes, locale, config });
  }
  return callOpenAiCompatibleVision({ mime, bytes, locale, config });
}

/** اختبار اتصال نصي بسيط بدون إرسال صور مرضى */
async function pingAiConnection(config) {
  if (!config?.available || !config.apiKey) {
    const err = new Error(
      config?.reason === 'missing_base_url'
        ? 'يلزم عنوان API للمزوّد المتوافق'
        : 'يلزم تفعيل الخدمة ومفتاح API قبل الاختبار'
    );
    err.statusCode = 400;
    throw err;
  }

  const model = config.model || AI_PROVIDERS[config.provider]?.defaultModel || 'gpt-4o-mini';

  if (config.apiStyle === 'gemini') {
    const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      }),
    }, 30000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini test failed (${res.status})`;
      const err = new Error(msg);
      err.statusCode = 502;
      throw err;
    }
    return { provider: config.provider, model, ok: true };
  }

  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
  }, 30000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `API test failed (${res.status})`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return { provider: config.provider, model, ok: true };
}

/**
 * يبني إعدادات اختبار من صف العيادة مع إمكانية تجاوز مؤقت من النموذج (قبل الحفظ).
 */
function resolveTestConfig(row, draft = {}) {
  const provider = normalizeProvider(draft.aiProvider ?? row?.ai_provider);
  const meta = AI_PROVIDERS[provider];
  const draftKey = typeof draft.aiApiKey === 'string' && draft.aiApiKey.trim()
    ? draft.aiApiKey.trim()
    : null;
  const merged = {
    ai_enabled: true,
    ai_provider: provider,
    ai_api_key: draftKey || row?.ai_api_key || null,
    ai_base_url: draft.aiBaseUrl != null
      ? (String(draft.aiBaseUrl).trim() || null)
      : (row?.ai_base_url || null),
    ai_vision_model: (draft.aiVisionModel && String(draft.aiVisionModel).trim())
      || row?.ai_vision_model
      || meta.defaultModel,
  };
  return resolveAiConfig(merged);
}

module.exports = {
  VISION_TIMEOUT_MS,
  callVisionApi,
  pingAiConnection,
  resolveTestConfig,
  analyzePrompt,
};
