import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

const EMPTY = {
  name: '',
  nameEn: '',
  nameHe: '',
  accountCode: '',
  isActive: true,
};

export default function ExpenseAccountForm({ record, onSaved }) {
  const { t } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        name: record.account_name_ar || record.account_name || '',
        nameEn: record.account_name_en || '',
        nameHe: record.account_name_he || '',
        accountCode: record.account_code || '',
        isActive: record.is_active !== false,
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [record]);

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
      if (isEdit) {
        await api.patch(`/expense-accounts/${record.id}`, {
          name: form.name.trim(),
          nameEn: form.nameEn.trim() || null,
          nameHe: form.nameHe.trim() || null,
          isActive: form.isActive,
        });
      } else {
        await api.post('/expense-accounts', {
          name: form.name.trim(),
          nameEn: form.nameEn.trim() || null,
          nameHe: form.nameHe.trim() || null,
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

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('expense_account_name_en')}</label>
          <input type="text" value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} />
        </div>
        <div className="dc-form-field">
          <label>{t('expense_account_name_he')}</label>
          <input type="text" value={form.nameHe} onChange={(e) => setField('nameHe', e.target.value)} />
        </div>
      </div>

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
