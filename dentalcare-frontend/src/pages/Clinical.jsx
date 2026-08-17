// pages/Clinical.jsx
// -----------------------------------------------------------
// توحيد المريض/الذمة هون مش منطق بالواجهة — هي بس بترسل patientId
// وقائمة العلاجات، والسيرفر (routes/clinical.js) هو يلي بيلاقي
// حساب ذمة المريض ويرحّل القيد. الواجهة ما بتعرف ولا بتحتاج تعرف
// أي حساب محاسبي مرتبط بالمريض.
// -----------------------------------------------------------

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';

const UPPER_TEETH = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
const LOWER_TEETH = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];

export default function Clinical({ accounts, onAccountsChanged }) {
  const { t } = useTranslation();
  const revenueAccounts = accounts.filter((a) => a.account_type === 'REVENUE');

  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [revenueAccountId, setRevenueAccountId] = useState('');
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentCost, setTreatmentCost] = useState('');
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    api.get('/patients').then(setPatients).catch(() => setPatients([]));
    api.get('/doctors').then(setDoctors).catch(() => setDoctors([]));
  }, []);

  // اختيار حساب الإيرادات تلقائي لو فيه حساب إيرادات واحد بس —
  // أغلب العيادات الصغيرة هيك وضعها، فما داعي تختاره كل مرة يدوي
  useEffect(() => {
    if (revenueAccounts.length === 1 && !revenueAccountId) {
      setRevenueAccountId(revenueAccounts[0].id);
    }
  }, [revenueAccounts, revenueAccountId]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, patientSearch]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const cartTotal = cart.reduce((sum, c) => sum + Number(c.cost), 0);

  function addToCart() {
    if (!selectedTooth) {
      setError(t('clinical_select_tooth_first'));
      return;
    }
    const cost = Number(treatmentCost);
    if (!treatmentName.trim() || !cost || cost <= 0) {
      setError(t('clinical_treatment_required'));
      return;
    }
    setError(null);
    setCart((prev) => [...prev, { tooth: selectedTooth, name: treatmentName.trim(), cost }]);
    setTreatmentName('');
    setTreatmentCost('');
  }

  function removeFromCart(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function commitSession() {
    setError(null);
    if (!selectedPatientId) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (cart.length === 0) {
      setError(t('clinical_cart_required'));
      return;
    }
    if (!revenueAccountId) {
      setError(t('accounts_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/clinical/commit-session', {
        patientId: selectedPatientId,
        revenueAccountId,
        treatments: cart,
        doctorId: selectedDoctorId || undefined,
        idempotencyKey,
      });

      // بعد النجاح: نفضّي السلة، ونحدّث رصيد المريض (بجلب قائمة
      // المرضى من جديد) وحسابات الإيرادات (لو محتاجة تحديث)
      setCart([]);
      setSelectedTooth(null);
      setIdempotencyKey(newIdempotencyKey());
      const refreshed = await api.get('/patients').catch(() => patients);
      setPatients(refreshed);
      onAccountsChanged?.();
      alert(t('clinical_session_success'));
      void result;
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderTooth(num) {
    const isSelected = selectedTooth === num;
    return (
      <div
        key={num}
        onClick={() => setSelectedTooth(num)}
        style={{
          width: 32, height: 40, border: '1px solid #94a3b8', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
          background: isSelected ? '#e0f2fe' : '#fff',
          borderColor: isSelected ? '#0284c7' : '#94a3b8',
        }}
      >
        {num}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
      {/* عمود المريض */}
      <div className="space-y-3">
        <h3>{t('clinical_select_patient')}</h3>
        <input
          type="text" placeholder={t('clinical_search_patient')}
          value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)}
        />
        <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
          {filteredPatients.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPatientId(p.id)}
              style={{
                padding: 8, cursor: 'pointer',
                background: selectedPatientId === p.id ? '#e0f2fe' : 'transparent',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div>{p.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{Number(p.balance).toFixed(2)}</div>
            </div>
          ))}
        </div>

        {selectedPatient && (
          <div style={{ padding: 8, background: '#f8fafc', borderRadius: 6 }}>
            <div style={{ fontWeight: 'bold' }}>{selectedPatient.name}</div>
            <div>{t('patient_balance')}: {Number(selectedPatient.balance).toFixed(2)}</div>
          </div>
        )}

        <div>
          <label>{t('clinical_revenue_account')}</label>
          <select value={revenueAccountId} onChange={(e) => setRevenueAccountId(e.target.value)}>
            <option value="">{t('voucher_choose_account')}</option>
            {revenueAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label>{t('clinical_select_doctor')}</label>
          <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
            <option value="">{t('clinical_doctor_optional')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* عمود مخطط الأسنان والسلة */}
      <div className="space-y-3">
        <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ marginBottom: 8 }}>
            {t('clinical_selected_tooth')}: <strong>{selectedTooth || t('clinical_none_selected')}</strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
            {UPPER_TEETH.map(renderTooth)}
          </div>
          <div style={{ borderTop: '1px dashed #cbd5e1', margin: '8px 0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
            {LOWER_TEETH.map(renderTooth)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text" placeholder={t('clinical_treatment_name')}
            value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)}
          />
          <input
            type="number" min="0" step="0.01" placeholder={t('clinical_treatment_cost')}
            value={treatmentCost} onChange={(e) => setTreatmentCost(e.target.value)}
          />
          <button type="button" onClick={addToCart}>{t('clinical_add_to_cart')}</button>
        </div>

        <div style={{ padding: 8, background: '#f0f9ff', borderRadius: 6 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{t('clinical_cart_title')}</div>
          {cart.length === 0 && <div>{t('clinical_cart_empty')}</div>}
          {cart.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>#{c.tooth} — {c.name}</span>
              <span>
                {c.cost.toFixed(2)}
                <button type="button" onClick={() => removeFromCart(i)} style={{ marginInlineStart: 8 }}>×</button>
              </span>
            </div>
          ))}
          {cart.length > 0 && (
            <div style={{ fontWeight: 'bold', borderTop: '1px solid #bae6fd', marginTop: 4, paddingTop: 4 }}>
              {t('clinical_cart_total')}: {cartTotal.toFixed(2)}
            </div>
          )}
        </div>

        {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}

        <button type="button" onClick={commitSession} disabled={submitting}>
          {submitting ? t('clinical_committing') : t('clinical_commit_session')}
        </button>
      </div>
    </div>
  );
}
