/**
 * جلب أسعار السوق وتحويلها إلى rate_to_base:
 * كم وحدة من العملة الرئيسية = 1 وحدة من العملة الأجنبية.
 *
 * open.er-api.com يرجع: 1 BASE = rates[CODE] من العملة الأجنبية
 * إذن rate_to_base = 1 / rates[CODE]
 */

async function fetchOpenErApi(baseCode) {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCode)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`FX provider HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.result !== 'success' || !data.rates) {
    throw new Error(data['error-type'] || 'FX provider returned an error');
  }
  return {
    provider: data.provider || 'https://www.exchangerate-api.com',
    baseCode: data.base_code || baseCode,
    updatedAt: data.time_last_update_utc || null,
    ratesFromBase: data.rates,
  };
}

function toRateToBase(ratesFromBase, foreignCode, places = 6) {
  const fromBase = Number(ratesFromBase[foreignCode]);
  if (!Number.isFinite(fromBase) || fromBase <= 0) return null;
  const rate = 1 / fromBase;
  const factor = 10 ** places;
  return Math.round(rate * factor) / factor;
}

/**
 * @param {string} baseCode
 * @param {string[]} foreignCodes
 */
async function getMarketRatesToBase(baseCode, foreignCodes = []) {
  const base = String(baseCode || 'ILS').toUpperCase();
  const market = await fetchOpenErApi(base);
  const suggestions = {};
  const missing = [];

  for (const code of foreignCodes) {
    const upper = String(code).toUpperCase();
    if (upper === base) {
      suggestions[upper] = 1;
      continue;
    }
    const rate = toRateToBase(market.ratesFromBase, upper);
    if (rate == null) missing.push(upper);
    else suggestions[upper] = rate;
  }

  return {
    baseCode: market.baseCode,
    provider: market.provider,
    providerName: 'ExchangeRate-API',
    attributionUrl: 'https://www.exchangerate-api.com',
    updatedAt: market.updatedAt,
    rates: suggestions,
    missing,
  };
}

module.exports = { getMarketRatesToBase, toRateToBase };
