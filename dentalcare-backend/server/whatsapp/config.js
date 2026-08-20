// whatsapp/config.js — إعدادات واتساب العامة للعيادة
const { normalizeDefaultCountry } = require('./phone');

const WA_PROVIDERS = {
  meta: { id: 'meta', requiresPhoneNumberId: true, requiresBaseUrl: false },
  compatible: { id: 'compatible', requiresPhoneNumberId: false, requiresBaseUrl: true },
};

function normalizeWaProvider(value) {
  const id = String(value || 'compatible').toLowerCase();
  return WA_PROVIDERS[id] ? id : 'compatible';
}

function maskToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  if (raw.length <= 8) return '••••';
  return `••••${raw.slice(-4)}`;
}

function publicWhatsappSettings(row) {
  const provider = normalizeWaProvider(row?.wa_provider);
  const hasToken = Boolean(row?.wa_api_token && String(row.wa_api_token).trim());
  return {
    waEnabled: Boolean(row?.wa_enabled),
    waProvider: provider,
    hasWaApiToken: hasToken,
    waApiTokenHint: hasToken ? maskToken(row.wa_api_token) : null,
    waPhoneNumberId: row?.wa_phone_number_id || '',
    waBaseUrl: row?.wa_base_url || '',
    waDefaultCountry: normalizeDefaultCountry(row?.wa_default_country),
    waTemplateAppointment: row?.wa_template_appointment || '',
    waTemplateReminder: row?.wa_template_reminder || '',
    waTemplatePayment: row?.wa_template_payment || '',
    waTemplateBalance: row?.wa_template_balance || '',
    waAutoAppointment: Boolean(row?.wa_auto_appointment),
    waAutoReminder: Boolean(row?.wa_auto_reminder),
    waAutoPayment: Boolean(row?.wa_auto_payment),
  };
}

function resolveWhatsappConfig(row) {
  if (!row?.wa_enabled) {
    return { available: false, reason: 'disabled' };
  }
  const provider = normalizeWaProvider(row.wa_provider);
  const token = row.wa_api_token && String(row.wa_api_token).trim();
  if (!token) {
    return { available: false, reason: 'missing_token', provider };
  }
  const phoneNumberId = (row.wa_phone_number_id || '').trim();
  let baseUrl = (row.wa_base_url || '').trim().replace(/\/$/, '');
  if (provider === 'meta') {
    if (!phoneNumberId) {
      return { available: false, reason: 'missing_phone_number_id', provider };
    }
    if (!baseUrl) baseUrl = 'https://graph.facebook.com/v21.0';
  } else if (!baseUrl) {
    return { available: false, reason: 'missing_base_url', provider };
  }

  return {
    available: true,
    provider,
    token,
    phoneNumberId,
    baseUrl,
    defaultCountry: normalizeDefaultCountry(row.wa_default_country),
    templates: {
      appointment: row.wa_template_appointment || null,
      reminder: row.wa_template_reminder || null,
      payment: row.wa_template_payment || null,
      balance: row.wa_template_balance || null,
    },
    autoAppointment: Boolean(row.wa_auto_appointment),
    autoReminder: Boolean(row.wa_auto_reminder),
    autoPayment: Boolean(row.wa_auto_payment),
  };
}

module.exports = {
  WA_PROVIDERS,
  normalizeWaProvider,
  publicWhatsappSettings,
  resolveWhatsappConfig,
  maskToken,
};
