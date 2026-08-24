// components/PatientForm.jsx
import { useEffect, useMemo, useState } from 'react';
import FormattedDateInput from './FormattedDateInput';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { ageFromBirthDate, todayIso } from '../lib/patientAge';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

export default function PatientForm({
  record,
  onSaved,
  onDeleted,
  onRegistered,
  defaultBillingParty = null,
  guardianOptions = [],
}) {
  const { t } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [linkToGuardian, setLinkToGuardian] = useState(Boolean(defaultBillingParty?.id));
  const [billingPartyId, setBillingPartyId] = useState(defaultBillingParty?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const computedAge = useMemo(() => ageFromBirthDate(birthDate), [birthDate]);

  const selectableGuardians = useMemo(() => {
    const list = Array.isArray(guardianOptions) ? guardianOptions : [];
    return list.filter((p) => p?.id && !p.is_dependent && !p.billing_party_id);
  }, [guardianOptions]);

  useEffect(() => {
    if (record) {
      setName(record.name || '');
      setPhone(record.phone || '');
      setBirthDate(record.birth_date ? String(record.birth_date).slice(0, 10) : '');
      setGender(record.gender || '');
      setAddress(record.address || '');
      setMedicalNotes(record.medical_notes || '');
      setLinkToGuardian(Boolean(record.billing_party_id));
      setBillingPartyId(record.billing_party_id || '');
    } else {
      setName('');
      setPhone('');
      setBirthDate('');
      setGender('');
      setAddress('');
      setMedicalNotes('');
      setCurrencyId(baseCurrency?.id || '');
      setLinkToGuardian(Boolean(defaultBillingParty?.id));
      setBillingPartyId(defaultBillingParty?.id || '');
    }
    setError(null);
  }, [record, baseCurrency?.id, defaultBillingParty?.id]);

  useEffect(() => {
    if (!isEdit && !currencyId && baseCurrency?.id) {
      setCurrencyId(baseCurrency.id);
    }
  }, [baseCurrency, currencyId, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t('patient_name_required'));
      return;
    }
    if (birthDate && birthDate > todayIso()) {
      setError(t('patient_birth_date_invalid'));
      return;
    }
    if (linkToGuardian && !billingPartyId) {
      setError(t('patient_guardian_required'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone,
        birthDate: birthDate || null,
        gender: gender || null,
        address: address.trim() || null,
        medicalNotes: medicalNotes.trim() || null,
        billingPartyId: linkToGuardian ? (billingPartyId || null) : null,
        ...(isEdit ? {} : { currencyId: currencyId || null }),
      };
      const result = isEdit
        ? await api.patch(`/patients/${record.id}`, payload)
        : await api.post('/patients', payload);
      onSaved?.(result);
      onRegistered?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const canDelete = isEdit
    && !record?.has_movements
    && !(Number(record?.dependents_count) > 0);

  async function handleDelete() {
    if (!canDelete || !record?.id) return;
    if (!window.confirm(t('party_confirm_delete', { name: record.name || '' }))) return;
    setError(null);
    setDeleting(true);
    try {
      await api.delete(`/patients/${record.id}`);
      onDeleted?.();
      onSaved?.({ deleted: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setDeleting(false);
    }
  }

  const lockedGuardian = Boolean(defaultBillingParty?.id) && !isEdit;
  const guardiansForSelect = selectableGuardians.filter((g) => g.id !== record?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" className="dc-field-name" placeholder={t('patient_name')} value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="text" className="dc-field-phone" placeholder={t('patient_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="dc-form-row">
        <div className="dc-form-field dc-field-date">
          <label>{t('patient_birth_date')}</label>
          <FormattedDateInput value={birthDate} onChange={setBirthDate} max={todayIso()} />
        </div>
        <div className="dc-form-field dc-field-select-sm">
          <label>{t('patient_gender')}</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t('patient_gender')}</option>
            <option value="MALE">{t('patient_gender_male')}</option>
            <option value="FEMALE">{t('patient_gender_female')}</option>
          </select>
        </div>
      </div>
      {computedAge != null && (
        <div className="dc-muted text-sm">{t('patient_age_auto', { age: computedAge })}</div>
      )}
      <input type="text" className="dc-field-grow" placeholder={t('patient_address')} value={address} onChange={(e) => setAddress(e.target.value)} />
      <textarea
        className="dc-field-memo"
        placeholder={t('patient_medical_notes')}
        value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)}
        rows={2}
      />
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

      {(Number(record?.dependents_count) || 0) > 0 ? (
        <div className="dc-muted text-sm">{t('patient_guardian_has_dependents')}</div>
      ) : (
        <>
          <label className="dc-check-row">
            <input
              type="checkbox"
              checked={linkToGuardian}
              disabled={lockedGuardian}
              onChange={(e) => {
                setLinkToGuardian(e.target.checked);
                if (!e.target.checked) setBillingPartyId('');
              }}
            />
            <span>{t('patient_link_guardian')}</span>
          </label>
          {linkToGuardian && (
            <div className="dc-form-field">
              <label>{t('patient_guardian')}</label>
              {lockedGuardian ? (
                <input type="text" value={defaultBillingParty.name || ''} disabled readOnly />
              ) : (
                <select
                  value={billingPartyId}
                  onChange={(e) => setBillingPartyId(e.target.value)}
                  required
                >
                  <option value="">{t('patient_guardian_select')}</option>
                  {guardiansForSelect.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              <p className="dc-muted text-sm">
                {isEdit ? t('patient_guardian_edit_hint') : t('patient_guardian_hint')}
              </p>
            </div>
          )}
        </>
      )}
      {error && <div className="dc-error">{error}</div>}
      {isEdit && record?.has_movements && (
        <p className="dc-muted text-sm">{t('party_delete_blocked_movements')}</p>
      )}
      {isEdit && !record?.has_movements && Number(record?.dependents_count) > 0 && (
        <p className="dc-muted text-sm">{t('party_delete_blocked_dependents')}</p>
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
          {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('patient_register'))}
        </button>
      </div>
    </form>
  );
}
