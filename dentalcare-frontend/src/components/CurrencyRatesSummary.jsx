import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';

function displayName(row, lang) {
  if (lang === 'en' && row.nameEn) return row.nameEn;
  if (lang === 'he' && row.nameHe) return row.nameHe;
  return row.name || row.code;
}

function formatRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function CurrencyRatesSummary({
  currencies = [],
  baseCurrency,
  confirmedAt,
  onConfirmClick,
  canConfirm = false,
}) {
  const { t, i18n } = useTranslation();
  const { dateTime } = useSettings();

  const { base, foreign } = useMemo(() => {
    const list = Array.isArray(currencies) ? currencies.filter((c) => c.isActive !== false) : [];
    const baseRow = list.find((c) => c.isBase) || baseCurrency || null;
    const others = list.filter((c) => !c.isBase);
    return { base: baseRow, foreign: others };
  }, [currencies, baseCurrency]);

  const baseCode = base?.code || baseCurrency?.code || '—';
  const baseSymbol = base?.symbol || baseCurrency?.symbol || '';

  if (!base && foreign.length === 0) {
    return (
      <section className="dc-admin-panel dc-admin-currency-panel dc-live-panel">
        <div className="dc-admin-panel-head">
          <h3><i className="fa-solid fa-coins" /> {t('admin_currency_rates_title')}</h3>
        </div>
        <div className="dc-admin-empty is-compact">{t('currency_none_yet')}</div>
      </section>
    );
  }

  return (
    <section className="dc-admin-panel dc-admin-currency-panel dc-live-panel">
      <div className="dc-admin-panel-head">
        <div>
          <h3><i className="fa-solid fa-coins" /> {t('admin_currency_rates_title')}</h3>
          <p className="dc-muted text-sm dc-admin-currency-hint">{t('admin_currency_rates_hint')}</p>
        </div>
        {canConfirm && onConfirmClick && (
          <button type="button" className="dc-admin-currency-confirm-btn" onClick={onConfirmClick}>
            <i className="fa-solid fa-check-double" />
            {t('admin_currency_rates_confirm_btn')}
          </button>
        )}
      </div>

      <div className="dc-admin-currency-meta">
        {confirmedAt ? (
          <span className="dc-badge dc-badge-emerald">
            <i className="fa-solid fa-clock" />
            {t('admin_currency_rates_confirmed_at', { at: dateTime(confirmedAt) })}
          </span>
        ) : (
          <span className="dc-badge dc-badge-amber">
            <i className="fa-solid fa-triangle-exclamation" />
            {t('admin_currency_rates_never')}
          </span>
        )}
        <span className="dc-muted text-sm">
          {t('currency_daily_base', { code: baseCode, symbol: baseSymbol })}
        </span>
      </div>

      <div className="dc-admin-currency-grid">
        {base && (
          <article className="dc-admin-currency-card is-base">
            <div className="dc-admin-currency-card-head">
              <span className="dc-admin-currency-code">{base.code}</span>
              <span className="dc-badge dc-badge-emerald">{t('currency_base_badge')}</span>
            </div>
            <div className="dc-admin-currency-name">{displayName(base, i18n.language)}</div>
            <div className="dc-admin-currency-symbol">{base.symbol}</div>
            <div className="dc-admin-currency-rate">1</div>
          </article>
        )}

        {foreign.map((row) => (
          <article key={row.id || row.code} className="dc-admin-currency-card">
            <div className="dc-admin-currency-card-head">
              <span className="dc-admin-currency-code">{row.code}</span>
              <span className="dc-admin-currency-symbol-inline">{row.symbol}</span>
            </div>
            <div className="dc-admin-currency-name">{displayName(row, i18n.language)}</div>
            <div className="dc-admin-currency-rate">
              {t('currency_rate_example', {
                foreign: `1 ${row.code}`,
                base: `${formatRate(row.rateToBase)} ${baseCode}`,
              })}
            </div>
            <div className="dc-admin-currency-rate-num">
              {formatRate(row.rateToBase)}
              {' '}
              {baseSymbol}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
