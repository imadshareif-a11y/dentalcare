import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { getLastRatesConfirmInfo, markRatesConfirmedToday } from '../lib/currencyDailyConfirm';
import { dedupeByCode } from '../lib/dedupeList';
import { useSettings } from '../context/SettingsContext';

function formatDateTime(value, lang) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-GB' : 'ar-EG';
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

export default function CurrencyDailyConfirm({ user, onConfirmed }) {
  const { t, i18n } = useTranslation();
  const { date } = useSettings();
  const [rows, setRows] = useState([]);
  const [rates, setRates] = useState({});
  const [marketMeta, setMarketMeta] = useState(null);
  const [clinicConfirmedAt, setClinicConfirmedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [marketWarning, setMarketWarning] = useState(null);

  const base = useMemo(() => rows.find((r) => r.is_base) || null, [rows]);
  const lastLocalConfirm = useMemo(() => getLastRatesConfirmInfo(user?.id), [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setMarketWarning(null);
      try {
        const [list, status] = await Promise.all([
          api.get('/currencies'),
          api.get('/currencies/rates-status').catch(() => ({ confirmedAt: null })),
        ]);
        if (cancelled) return;
        setClinicConfirmedAt(status?.confirmedAt || null);

        const active = dedupeByCode(Array.isArray(list) ? list : [], 'code', 'id')
          .filter((c) => c.is_active !== false);
        setRows(active);

        const next = {};
        active.forEach((c) => {
          next[c.id] = c.is_base ? '1' : String(c.rate_to_base ?? '');
        });

        try {
          const market = await api.get('/currencies/market-rates');
          if (cancelled) return;
          setMarketMeta(market);
          (market.items || []).forEach((item) => {
            if (item.isBase) {
              next[item.currencyId] = '1';
              return;
            }
            if (item.marketRate != null) {
              next[item.currencyId] = String(item.marketRate);
            }
          });
          if (market.missing?.length) {
            setMarketWarning(t('currency_daily_market_missing', { codes: market.missing.join(', ') }));
          }
        } catch (marketErr) {
          if (!cancelled) {
            setMarketWarning(
              marketErr instanceof ApiError
                ? (marketErr.body?.error || t('currency_daily_market_failed'))
                : t('currency_daily_market_failed')
            );
          }
        }

        setRates(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  function displayName(row) {
    const lang = i18n.language;
    if (lang === 'en' && row.name_en) return row.name_en;
    if (lang === 'he' && row.name_he) return row.name_he;
    return row.name;
  }

  function setRate(id, value) {
    setRates((prev) => ({ ...prev, [id]: value }));
  }

  async function reloadMarket() {
    setMarketWarning(null);
    try {
      const market = await api.get('/currencies/market-rates');
      setMarketMeta(market);
      setRates((prev) => {
        const next = { ...prev };
        (market.items || []).forEach((item) => {
          if (item.isBase) next[item.currencyId] = '1';
          else if (item.marketRate != null) next[item.currencyId] = String(item.marketRate);
        });
        return next;
      });
      if (market.missing?.length) {
        setMarketWarning(t('currency_daily_market_missing', { codes: market.missing.join(', ') }));
      }
    } catch (err) {
      setMarketWarning(
        err instanceof ApiError
          ? (err.body?.error || t('currency_daily_market_failed'))
          : t('currency_daily_market_failed')
      );
    }
  }

  async function handleConfirm() {
    setError(null);
    const payload = [];
    for (const row of rows) {
      if (row.is_base) continue;
      const rate = Number(rates[row.id]);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError(t('currency_daily_rate_invalid', { code: row.code }));
        return;
      }
      payload.push({ currencyId: row.id, rateToBase: rate });
    }

    setSaving(true);
    try {
      const result = await api.post('/currencies/daily-confirm', { rates: payload });
      markRatesConfirmedToday(user.id, {
        rates: Object.fromEntries(
          rows.map((r) => [r.code, r.is_base ? 1 : Number(rates[r.id])])
        ),
        source: marketMeta?.provider || null,
      });
      setClinicConfirmedAt(result?.confirmedAt || new Date().toISOString());
      onConfirmed?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSaving(false);
    }
  }

  const lastClinicLabel = clinicConfirmedAt
    ? formatDateTime(clinicConfirmedAt, i18n.language)
    : null;
  const lastLocalLabel = lastLocalConfirm?.at
    ? formatDateTime(lastLocalConfirm.at, i18n.language)
    : (lastLocalConfirm?.date ? date(lastLocalConfirm.date) : null);

  return (
    <div className="dc-modal-backdrop" role="presentation">
      <div
        className="dc-modal dc-currency-daily-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="currency-daily-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="currency-daily-title">{t('currency_daily_title')}</h3>
        <p className="dc-muted text-sm">{t('currency_daily_hint_auto')}</p>
        {base && (
          <p className="text-sm">
            {t('currency_daily_base', { code: base.code, symbol: base.symbol })}
          </p>
        )}

        <div className="dc-currency-daily-meta text-sm" style={{ marginTop: 8 }}>
          {lastClinicLabel && (
            <p className="dc-muted">
              {t('currency_daily_last_clinic_update', { at: lastClinicLabel })}
            </p>
          )}
          {lastLocalLabel && (
            <p className="dc-muted">
              {t('currency_daily_last_user_confirm', { at: lastLocalLabel })}
            </p>
          )}
          {!lastClinicLabel && !lastLocalLabel && (
            <p className="dc-muted">{t('currency_daily_never_confirmed')}</p>
          )}
        </div>

        {marketMeta && (
          <p className="dc-muted text-sm" style={{ marginTop: 8 }}>
            {t('currency_daily_market_source', {
              provider: marketMeta.provider,
              updatedAt: marketMeta.updatedAt
                ? formatDateTime(marketMeta.updatedAt, i18n.language)
                : '—',
            })}
            {' · '}
            <a href={marketMeta.attributionUrl || 'https://www.exchangerate-api.com'} target="_blank" rel="noreferrer">
              ExchangeRate-API
            </a>
          </p>
        )}

        {loading && <div>{t('ledger_loading')}</div>}
        {!loading && rows.length === 0 && <div className="dc-error">{t('currency_none_yet')}</div>}
        {marketWarning && <div className="dc-muted text-sm" style={{ color: '#b45309' }}>{marketWarning}</div>}

        {!loading && rows.length > 0 && (
          <table className="w-full text-sm" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>{t('currency_code')}</th>
                <th>{t('currency_name')}</th>
                <th>{t('currency_symbol')}</th>
                <th>{t('currency_rate_column')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.code}</strong>
                    {row.is_base && (
                      <span className="dc-badge dc-badge-emerald" style={{ marginInlineStart: 6 }}>
                        {t('currency_base_badge')}
                      </span>
                    )}
                  </td>
                  <td>{displayName(row)}</td>
                  <td>{row.symbol}</td>
                  <td>
                    {row.is_base ? (
                      <span>1</span>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={rates[row.id] ?? ''}
                        onChange={(e) => setRate(row.id, e.target.value)}
                        style={{ width: 120 }}
                        aria-label={`${row.code} rate`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && <div className="dc-error" style={{ marginTop: 10 }}>{error}</div>}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="dc-ghost-light" disabled={loading || saving} onClick={reloadMarket}>
            {t('currency_daily_reload_market')}
          </button>
          <button
            type="button"
            className="dc-success"
            disabled={loading || saving || rows.length === 0}
            onClick={handleConfirm}
          >
            {saving ? t('party_saving') : t('currency_daily_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
