import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { localizedEditValue, localizedPayload } from '../lib/localizedName';

const EMPTY = {
  name: '',
  accountCode: '',
  isActive: true,
};

export default function ExpenseAccountForm({ record, onSaved }) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        name: localizedEditValue(record, i18n.language, {
          ar: ['account_name_ar', 'account_name', 'name'],
          en: ['account_name_en', 'name_en'],
          he: ['account_name_he', 'name_he'],
        }),
        accountCode: record.account_code || '',
        isActive: record.is_active !== false,
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [record, i18n.language]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('expense_account_name_required'));
      return;
    }
    setSubmitting(true);
    try {
      const namePayload = localizedPayload(form.name, i18n.language);
      if (isEdit) {
        await api.patch(`/expense-accounts/${record.id}`, {
          ...namePayload,
          isActive: form.isActive,
        });
      } else {
        await api.post('/expense-accounts', {
          ...namePayload,
          accountCode: form.accountCode.trim() || null,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!isEdit && (
        <div>
          <label className="dc-muted text-sm">{t('expense_account_code')}</label>
          <input
            type="text"
            value={form.accountCode}
            onChange={(e) => setField('accountCode', e.target.value.replace(/\D/g, ''))}
            placeholder={t('expense_account_code_auto')}
          />
        </div>
      )}

      {isEdit && (
        <p className="dc-muted text-sm">{t('expense_account_code')}: {record.account_code}</p>
      )}

      <div>
        <label className="dc-muted text-sm">{t('expense_account_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>

      {isEdit && (
        <label className="dc-check-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          {t('cash_box_is_active')}
        </label>
      )}

      {error && <div className="dc-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('expense_account_add'))}
      </button>
    </form>
  );
}
