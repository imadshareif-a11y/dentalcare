import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

const EMPTY = {
  name: '',
  nameEn: '',
  nameHe: '',
  accountCode: '',
  accountType: 'ASSET',
  parentId: null,
  isGroup: false,
  isActive: true,
};

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function ChartAccountForm({
  record,
  parentHint,
  defaultType,
  onSaved,
  onCancel,
}) {
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
        accountType: record.account_type || 'ASSET',
        parentId: record.parent_id || null,
        isGroup: Boolean(record.is_group),
        isActive: record.is_active !== false,
      });
    } else {
      setForm({
        ...EMPTY,
        accountType: parentHint?.account_type || defaultType || 'ASSET',
        parentId: parentHint?.id || null,
        isGroup: false,
      });
    }
    setError(null);
  }, [record, parentHint, defaultType]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('chart_name_required'));
      return;
    }
    if (!form.accountCode.trim()) {
      setError(t('chart_code_required'));
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.patch(`/chart-tree/${record.id}`, {
          name: form.name.trim(),
          nameEn: form.nameEn.trim() || null,
          nameHe: form.nameHe.trim() || null,
          accountCode: form.accountCode.trim(),
          isGroup: form.isGroup,
          isActive: form.isActive,
          parentId: form.parentId,
          accountType: form.parentId ? undefined : form.accountType,
        });
      } else {
        await api.post('/chart-tree', {
          name: form.name.trim(),
          nameEn: form.nameEn.trim() || null,
          nameHe: form.nameHe.trim() || null,
          accountCode: form.accountCode.trim(),
          accountType: form.accountType,
          parentId: form.parentId,
          isGroup: form.isGroup,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const lockedType = Boolean(form.parentId || parentHint?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {parentHint && !isEdit && (
        <p className="dc-muted text-sm">
          {t('chart_under')}: <strong>{parentHint.account_code} — {parentHint.account_name_ar || parentHint.account_name}</strong>
        </p>
      )}

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('chart_code')}</label>
          <input
            type="text"
            value={form.accountCode}
            onChange={(e) => setField('accountCode', e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        {!lockedType && (
          <div className="dc-form-field">
            <label>{t('chart_type')}</label>
            <select
              value={form.accountType}
              onChange={(e) => setField('accountType', e.target.value)}
              disabled={isEdit && Boolean(record?.parent_id)}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{t(`chart_type_${type.toLowerCase()}`)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="dc-muted text-sm">{t('chart_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('chart_name_en')}</label>
          <input type="text" value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} />
        </div>
        <div className="dc-form-field">
          <label>{t('chart_name_he')}</label>
          <input type="text" value={form.nameHe} onChange={(e) => setField('nameHe', e.target.value)} />
        </div>
      </div>

      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={form.isGroup}
          onChange={(e) => setField('isGroup', e.target.checked)}
        />
        {t('chart_is_group')}
      </label>

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

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting}>
          {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('chart_add'))}
        </button>
        {onCancel && (
          <button type="button" className="dc-ghost" onClick={onCancel}>{t('btn_cancel')}</button>
        )}
      </div>
    </form>
  );
}
