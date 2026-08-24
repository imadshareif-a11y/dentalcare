import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

export default function SupplierForm({ record, onSaved, onDeleted }) {
  const { t } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setName(record.name || '');
      setPhone(record.phone || '');
    } else {
      setName('');
      setPhone('');
      setCurrencyId(baseCurrency?.id || '');
    }
    setError(null);
  }, [record, baseCurrency?.id]);

  useEffect(() => {
    if (!isEdit && !currencyId && baseCurrency?.id) {
      setCurrencyId(baseCurrency.id);
    }
  }, [baseCurrency, currencyId, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t('supplier_name_required'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone,
        ...(isEdit ? {} : { currencyId: currencyId || null }),
      };
      const result = isEdit
        ? await api.patch(`/suppliers/${record.id}`, payload)
        : await api.post('/suppliers', payload);
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const canDelete = isEdit && !record?.has_movements;

  async function handleDelete() {
    if (!canDelete || !record?.id) return;
    if (!window.confirm(t('party_confirm_delete', { name: record.name || '' }))) return;
    setError(null);
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${record.id}`);
      onDeleted?.();
      onSaved?.({ deleted: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" className="dc-field-name" placeholder={t('supplier_name')} value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="text" className="dc-field-phone" placeholder={t('patient_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      {!isEdit && (
        <>
          <CurrencySelect
            label={t('account_currency')}
            value={currencyId}
            onChange={setCurrencyId}
            currencies={currencies}
          />
          <p className="dc-muted text-sm">{t('account_currency_default_hint')}</p>
        </>
      )}
      {error && <div className="dc-error">{error}</div>}
      {isEdit && record?.has_movements && (
        <p className="dc-muted text-sm">{t('party_delete_blocked_movements')}</p>
      )}
      <div className="dc-form-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {canDelete ? (
          <button
            type="button"
            className="dc-danger"
            disabled={submitting || deleting}
            onClick={handleDelete}
          >
            {deleting ? t('party_deleting') : t('party_delete')}
          </button>
        ) : <span />}
        <button type="submit" disabled={submitting || deleting}>
          {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('supplier_register'))}
        </button>
      </div>
    </form>
  );
}
