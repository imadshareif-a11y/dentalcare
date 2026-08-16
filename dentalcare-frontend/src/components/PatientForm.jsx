// components/PatientForm.jsx
// -----------------------------------------------------------
// عند النجاح، السيرفر بيكون أنشأ حساب ذمة تلقائيًا بنفس
// الـ transaction (شوف routes/patients.js). الواجهة هون بس
// بتعرض النتيجة — ما فيها أي منطق "ربط" يدوي بين المريض والحساب.
// -----------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

export default function PatientForm({ onRegistered }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('patient_name_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/patients', { name: name.trim(), phone });
      setName('');
      setPhone('');
      onRegistered?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('patient_register')}</h3>
      <input
        type="text" placeholder={t('patient_name')}
        value={name} onChange={(e) => setName(e.target.value)} required
      />
      <input
        type="text" placeholder={t('patient_phone')}
        value={phone} onChange={(e) => setPhone(e.target.value)}
      />
      {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('patient_registering') : t('patient_register')}
      </button>
    </form>
  );
}
