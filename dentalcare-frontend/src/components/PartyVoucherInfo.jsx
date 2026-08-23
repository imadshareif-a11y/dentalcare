import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';

export default function PartyVoucherInfo({ accountId }) {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accountId) {
      setInfo(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get(`/accounts/${accountId}/voucher-context`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setInfo(null);
          setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accountId, t]);

  if (!accountId) return null;

  const balance = Number(info?.balance) || 0;
  const balanceOk = balance <= 0;

  return (
    <div className="dc-party-voucher-info" aria-live="polite">
      {loading && <div className="dc-muted text-sm">{t('ledger_loading')}</div>}
      {!loading && error && <div className="dc-error text-sm">{error}</div>}
      {!loading && !error && info && (
        <>
          <p className="dc-party-voucher-info-line">
            {t('voucher_party_current_balance')}:{' '}
            <strong className={balanceOk ? 'dc-party-voucher-balance-ok' : 'dc-party-voucher-balance-due'}>
              {money(balance)}
            </strong>
          </p>
          <p className="dc-party-voucher-info-line">
            {t('voucher_party_last_receipt')}:{' '}
            <strong>
              {info.lastReceiptDate ? date(info.lastReceiptDate) : t('voucher_party_no_receipt')}
            </strong>
          </p>
        </>
      )}
    </div>
  );
}
