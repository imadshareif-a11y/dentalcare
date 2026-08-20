// settings/aiConfig.js — مزوّدو Vision لكل عيادة

const AI_PROVIDERS = {
  openai: {
    id: 'openai',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresBaseUrl: false,
    apiStyle: 'openai',
  },
  gemini: {
    id: 'gemini',
    defaultModel: 'gemini-2.0-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresBaseUrl: false,
    apiStyle: 'gemini',
  },
  compatible: {
    id: 'compatible',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: '',
    requiresBaseUrl: true,
    apiStyle: 'openai',
  },
};

function normalizeProvider(value) {
  const id = String(value || 'openai').toLowerCase();
  return AI_PROVIDERS[id] ? id : 'openai';
}

function maskApiKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return null;
  if (raw.length <= 8) return '••••';
  return `••••${raw.slice(-4)}`;
}

function publicAiSettings(row) {
  const provider = normalizeProvider(row?.ai_provider);
  const meta = AI_PROVIDERS[provider];
  const enabled = Boolean(row?.ai_enabled);
  const hasKey = Boolean(row?.ai_api_key && String(row.ai_api_key).trim());
  return {
    aiEnabled: enabled,
    aiProvider: provider,
    hasAiApiKey: hasKey,
    aiApiKeyHint: hasKey ? maskApiKey(row.ai_api_key) : null,
    aiBaseUrl: row?.ai_base_url || '',
    aiVisionModel: row?.ai_vision_model || meta.defaultModel,
    aiProviders: Object.keys(AI_PROVIDERS),
  };
}

/**
 * يحل إعدادات التحليل للعيادة.
 * يتطلب تفعيل العيادة + مفتاح (من الإعدادات أو البيئة كاحتياطي لنفس المزوّد).
 */
function resolveAiConfig(row) {
  const tenantEnabled = Boolean(row?.ai_enabled);
  if (!tenantEnabled) {
    return { available: false, source: null, reason: 'disabled', provider: normalizeProvider(row?.ai_provider) };
  }

  const provider = normalizeProvider(row?.ai_provider);
  const meta = AI_PROVIDERS[provider];
  const tenantKey = row?.ai_api_key && String(row.ai_api_key).trim();
  const envKey = provider === 'gemini'
    ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY)
    : process.env.OPENAI_API_KEY;
  const apiKey = tenantKey || (envKey && String(envKey).trim()) || null;

  if (!apiKey) {
    return { available: false, source: null, reason: 'missing_key', provider };
  }

  let baseUrl = (row?.ai_base_url || '').trim();
  if (!baseUrl) baseUrl = meta.defaultBaseUrl;
  if (meta.requiresBaseUrl && !baseUrl) {
    return { available: false, source: null, reason: 'missing_base_url', provider };
  }

  return {
    available: true,
    source: tenantKey ? 'tenant' : 'env',
    provider,
    apiStyle: meta.apiStyle,
    apiKey,
    baseUrl: String(baseUrl).replace(/\/$/, ''),
    model: (row?.ai_vision_model && String(row.ai_vision_model).trim())
      || meta.defaultModel,
  };
}

module.exports = {
  AI_PROVIDERS,
  normalizeProvider,
  publicAiSettings,
  resolveAiConfig,
  maskApiKey,
};
