import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader from '../components/PrintHeader';
import PatientForm from '../components/PatientForm';
import DentalChart from '../components/DentalChart';
import FormattedDateInput from '../components/FormattedDateInput';
import PartyModal from '../components/PartyModal';
import ClinicalImagesAttach from '../components/ClinicalImagesAttach';
import ClinicalSessionImages from '../components/ClinicalSessionImages';

const CLINIC_OPEN_HOUR = 8;
const CLINIC_CLOSE_HOUR = 20;

const MEDICAL_ALERT_RE = /حساس|سكر|ضغط|توتر|قلب|حمل|نزيف|ربو|صرع|كلى|كبد|دم|أدوي|allergy|diabet|pregnan|hypertens|heart|blood|asthma|epilep|warfarin|penicillin|aspirin|hiv|hepatitis/i;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daySlots() {
  const slots = [];
  for (let hour = CLINIC_OPEN_HOUR; hour < CLINIC_CLOSE_HOUR; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

function medicalNoteTags(notes) {
  const raw = String(notes || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[\n,،;؛|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const list = parts.length > 0 ? parts : [raw];
  return list.map((text) => ({
    text,
    alert: MEDICAL_ALERT_RE.test(text),
  }));
}

export default function Clinical({
  accounts,
  onAccountsChanged,
  canEditClinical = true,
  canEditAppointments = true,
  canEditPatients = true,
  focusPatientId = null,
  onFocusPatientConsumed,
}) {
  const { t } = useTranslation();
  const { money, date, settings } = useSettings();
  const waEnabled = Boolean(settings?.waEnabled);
  const revenueAccounts = accounts.filter((a) => a.account_type === 'REVENUE');
  const defaultRevenueAccountId = useMemo(() => {
    if (revenueAccounts.length === 0) return '';
    const preferred = revenueAccounts.find((a) => {
      const name = `${a.account_name || ''} ${a.account_name_ar || ''} ${a.account_code || ''}`.toLowerCase();
      if (/خصم|discount|4200/.test(name)) return false;
      return /علاج|clinical|treatment|إيراد/.test(name);
    });
    return (preferred || revenueAccounts[0]).id;
  }, [revenueAccounts]);

  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(focusPatientId || '');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentCost, setTreatmentCost] = useState('');
  const [cart, setCart] = useState([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [pendingXrays, setPendingXrays] = useState([]);
  const [xrayUploadSessionId, setXrayUploadSessionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [catalog, setCatalog] = useState([]);
  const [patientFile, setPatientFile] = useState({ sessions: [], treatedTeeth: [] });
  const [apptDate, setApptDate] = useState(todayIso);
  const [appointments, setAppointments] = useState([]);
  const [waBusy, setWaBusy] = useState(null);
  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [modalPatientId, setModalPatientId] = useState('');
  const [modalSlot, setModalSlot] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [modalPatientSearch, setModalPatientSearch] = useState('');
  const [printJob, setPrintJob] = useState(null);
  const [showAddPatient, setShowAddPatient] = useState(false);

  useEffect(() => {
    api.get('/patients').then(setPatients).catch(() => setPatients([]));
    api.get('/doctors').then(setDoctors).catch(() => setDoctors([]));
    api.get('/treatments').then((rows) => setCatalog(rows.filter((x) => x.is_active))).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!focusPatientId) return;
    setSelectedPatientId(focusPatientId);
    onFocusPatientConsumed?.();
  }, [focusPatientId, onFocusPatientConsumed]);

  useEffect(() => {
    api.get('/appointments', { date: apptDate }).then(setAppointments).catch(() => setAppointments([]));
  }, [apptDate]);

  useEffect(() => {
    if (!waEnabled || !settings?.waAutoReminder) return;
    const key = `wa-reminders-${todayIso()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    api.post('/whatsapp/reminders/run').catch(() => {});
  }, [waEnabled, settings?.waAutoReminder]);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientFile({ sessions: [], treatedTeeth: [] });
      setPendingXrays([]);
      setXrayUploadSessionId(null);
      return;
    }
    api.get(`/clinical/patient-file/${selectedPatientId}`)
      .then(setPatientFile)
      .catch(() => setPatientFile({ sessions: [], treatedTeeth: [] }));
  }, [selectedPatientId]);

  useEffect(() => {
    if (!printJob) return undefined;
    const timer = setTimeout(() => window.print(), 80);
    const done = () => setPrintJob(null);
    window.addEventListener('afterprint', done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printJob]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, patientSearch]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const medicalTags = useMemo(
    () => medicalNoteTags(selectedPatient?.medical_notes),
    [selectedPatient?.medical_notes]
  );
  const toothHistory = useMemo(() => {
    if (selectedTooth == null || selectedTooth === '') return [];
    const tooth = String(selectedTooth);
    const rows = [];
    for (const session of patientFile.sessions || []) {
      for (const item of session.items || []) {
        if (String(item.tooth) !== tooth) continue;
        rows.push({
          name: item.name,
          doctorName: session.doctor_name || null,
          date: session.session_date,
          cost: item.cost,
          sessionId: session.id,
        });
      }
    }
    return rows;
  }, [selectedTooth, patientFile.sessions]);
  const cartTotal = cart.reduce((sum, c) => sum + Number(c.cost), 0);
  const slots = useMemo(() => daySlots(), []);
  const apptBySlot = useMemo(() => {
    const map = {};
    appointments.forEach((row) => {
      if (row.status === 'CANCELLED') return;
      const key = row.slot || String(row.starts_at || '').slice(11, 16);
      if (key) map[key] = row;
    });
    return map;
  }, [appointments]);
  const modalPatients = useMemo(() => {
    const q = modalPatientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(q));
  }, [patients, modalPatientSearch]);

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

  function pickCatalog(item) {
    setTreatmentName(item.name);
    setTreatmentCost(String(item.price));
    if (!selectedTooth) {
      setError(t('clinical_select_tooth_first'));
      return;
    }
    setError(null);
    setCart((prev) => [...prev, { tooth: selectedTooth, name: item.name, cost: Number(item.price) }]);
  }

  function removeFromCart(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function reloadFile() {
    if (!selectedPatientId) return;
    const file = await api.get(`/clinical/patient-file/${selectedPatientId}`).catch(() => null);
    if (file) setPatientFile(file);
  }

  async function uploadPendingXrays(sessionId) {
    const form = new FormData();
    pendingXrays.forEach((item) => form.append('files', item.file));
    form.append(
      'aiReports',
      JSON.stringify(pendingXrays.map((item) => (
        item.aiReport
          ? { report: item.aiReport, model: item.aiModel || null }
          : null
      )))
    );
    await api.uploadForm(`/clinical/sessions/${sessionId}/images`, form);
  }

  async function retryXrayUpload() {
    if (!xrayUploadSessionId || pendingXrays.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await uploadPendingXrays(xrayUploadSessionId);
      setPendingXrays([]);
      setXrayUploadSessionId(null);
      await reloadFile();
      alert(t('clinical_xray_upload_retry_success'));
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body?.error || err.message) : t('error_network');
      setError(t('clinical_xray_upload_failed', { detail: msg }));
    } finally {
      setSubmitting(false);
    }
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
    if (!defaultRevenueAccountId) {
      setError(t('accounts_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/clinical/commit-session', {
        patientId: selectedPatientId,
        revenueAccountId: defaultRevenueAccountId,
        treatments: cart,
        doctorId: selectedDoctorId || undefined,
        notes: sessionNotes.trim() || undefined,
        idempotencyKey,
      });

      setCart([]);
      setSessionNotes('');
      setSelectedTooth(null);
      setIdempotencyKey(newIdempotencyKey());
      const refreshed = await api.get('/patients').catch(() => patients);
      setPatients(refreshed);
      onAccountsChanged?.();

      if (result.sessionId && pendingXrays.length > 0) {
        try {
          await uploadPendingXrays(result.sessionId);
          setPendingXrays([]);
          setXrayUploadSessionId(null);
          await reloadFile();
          alert(t('clinical_session_success'));
        } catch (uploadErr) {
          const detail = uploadErr instanceof ApiError
            ? (uploadErr.body?.error || uploadErr.message)
            : t('error_network');
          setXrayUploadSessionId(result.sessionId);
          setError(t('clinical_xray_upload_failed', { detail }));
          await reloadFile();
          alert(t('clinical_session_success_images_failed'));
        }
      } else {
        setPendingXrays([]);
        setXrayUploadSessionId(null);
        await reloadFile();
        alert(t('clinical_session_success'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  async function printMedical() {
    if (!selectedPatient) {
      setError(t('clinical_patient_required'));
      return;
    }
    try {
      const file = await api.get(`/clinical/patient-file/${selectedPatient.id}`);
      setPrintJob({ type: 'medical', patient: selectedPatient, file });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function printLedger() {
    if (!selectedPatient?.account_id) {
      setError(t('clinical_patient_required'));
      return;
    }
    try {
      const ledger = await api.get('/reports/ledger', {
        accountId: selectedPatient.account_id,
        fromDate: '2000-01-01',
        toDate: todayIso(),
      });
      setPrintJob({ type: 'ledger', patient: selectedPatient, ledger });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  function openApptModal(slot = '') {
    setError(null);
    setModalSlot(slot);
    setModalPatientId(selectedPatientId || '');
    setModalNotes('');
    setModalPatientSearch('');
    setApptModalOpen(true);
  }

  async function saveAppointment(e) {
    e.preventDefault();
    if (!modalPatientId) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (!modalSlot) {
      setError(t('clinical_appointment_slot_required'));
      return;
    }
    setError(null);
    try {
      await api.post('/appointments', {
        patientId: modalPatientId,
        doctorId: selectedDoctorId || undefined,
        date: apptDate,
        slot: modalSlot,
        notes: modalNotes || undefined,
      });
      setApptModalOpen(false);
      setAppointments(await api.get('/appointments', { date: apptDate }));
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function setApptStatus(id, status) {
    try {
      await api.patch(`/appointments/${id}`, { status });
      setAppointments(await api.get('/appointments', { date: apptDate }));
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function sendWhatsapp(kind, payload) {
    setWaBusy(kind === 'reminder' ? `reminder:${payload.appointmentId}` : kind);
    setError(null);
    try {
      const result = await api.post('/whatsapp/send', { kind, skipDedupe: true, ...payload });
      if (result?.skipped) {
        alert(t('wa_send_skipped'));
      } else {
        alert(t('wa_send_ok'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setWaBusy(null);
    }
  }

  return (
    <>
      <div className="dc-clinical dc-clinical-screen">
        <section className="dc-col">
          <div className="dc-col-head">
            <h3 className="dc-col-title"><span className="dc-dot" /> {t('clinical_select_patient')}</h3>
            {canEditPatients && (
              <button type="button" className="dc-add-btn" onClick={() => setShowAddPatient((v) => !v)}>
                + {t('clinical_add_short')}
              </button>
            )}
          </div>
          {canEditPatients && showAddPatient && (
            <PatientForm
              onRegistered={async (result) => {
                const refreshed = await api.get('/patients').catch(() => patients);
                setPatients(refreshed);
                if (result?.patientId) setSelectedPatientId(result.patientId);
                setShowAddPatient(false);
                onAccountsChanged?.();
              }}
            />
          )}

          <button
            type="button"
            className="dc-patient-pick-btn"
            onClick={() => {
              setPatientSearch('');
              setPatientPickerOpen(true);
            }}
          >
            <i className="fa-solid fa-magnifying-glass" />
            {selectedPatient ? t('clinical_change_patient') : t('clinical_pick_patient')}
          </button>

          <div className="dc-patient-list">
            {selectedPatient ? (
              <>
                <h4 className="dc-active-file-label">{t('clinical_active_file')}</h4>
                <div className="dc-patient-card is-active is-selected-only">
                <div className="dc-patient-card-main">
                  <div>
                    <strong>{selectedPatient.name}</strong>
                    <div className="dc-muted">{selectedPatient.phone || '—'}</div>
                  </div>
                  <div className={`dc-balance-chip${Number(selectedPatient.balance) > 0 ? '' : ' is-ok'}`}>
                    {money(selectedPatient.balance)}
                  </div>
                </div>
                <div className="dc-medical-tags">
                  {medicalTags.length === 0 ? (
                    <span className="dc-medical-tag is-empty">{t('clinical_no_medical_notes')}</span>
                  ) : (
                    medicalTags.map((tag) => (
                      <span
                        key={tag.text}
                        className={`dc-medical-tag${tag.alert ? ' is-alert' : ''}`}
                        title={tag.alert ? t('clinical_medical_alert_hint') : undefined}
                      >
                        {tag.alert && <i className="fa-solid fa-triangle-exclamation" />}
                        {tag.text}
                      </span>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  className="dc-ghost-light dc-patient-clear"
                  onClick={() => setSelectedPatientId('')}
                >
                  {t('clinical_clear_patient')}
                </button>
                </div>
              </>
            ) : (
              <div className="dc-patient-empty">{t('clinical_patient_required')}</div>
            )}
          </div>

          {canEditClinical && (
            <div className="dc-print-actions">
              <button type="button" className="dc-ghost-light" onClick={printMedical} disabled={!selectedPatient}>
                <i className="fa-solid fa-notes-medical" /> {t('clinical_print_medical')}
              </button>
              <button type="button" className="dc-ghost-light" onClick={printLedger} disabled={!selectedPatient}>
                <i className="fa-solid fa-file-invoice" /> {t('clinical_print_ledger')}
              </button>
            </div>
          )}
        </section>

        <section className="dc-col">
          <DentalChart
            selectedTooth={selectedTooth}
            treatedTeeth={patientFile.treatedTeeth}
            onSelectTooth={setSelectedTooth}
          />

          {selectedTooth != null && selectedTooth !== '' && (
            <div className="dc-tooth-history">
              <h4 className="dc-tooth-history-title">
                {t('clinical_tooth_history_title', { tooth: selectedTooth })}
              </h4>
              {toothHistory.length === 0 ? (
                <div className="dc-muted text-sm">{t('clinical_tooth_history_empty')}</div>
              ) : (
                <ul className="dc-tooth-history-list">
                  {toothHistory.map((row, i) => (
                    <li key={`${row.sessionId}-${i}`} className="dc-tooth-history-item">
                      <strong className="dc-tooth-history-name">{row.name}</strong>
                      <span className="dc-tooth-history-meta">
                        {row.doctorName || t('clinical_tooth_history_no_doctor')}
                      </span>
                      <span className="dc-tooth-history-meta">{date(row.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canEditClinical && (
            <>
          <h3 className="dc-col-title"><i className="fa-solid fa-plus" style={{ color: '#059669' }} /> {t('clinical_pick_treatment')}</h3>
          {catalog.length > 0 && (
            <div className="dc-treat-grid">
              {catalog.map((item) => (
                <button key={item.id} type="button" className="dc-treat-tile" onClick={() => pickCatalog(item)}>
                  {item.name}
                  <span className="dc-price-tag">{money(item.price)}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text" placeholder={t('clinical_treatment_name')}
              value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)}
            />
            <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
              <option value="">{t('clinical_select_doctor')}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input
              type="number" min="0" step="0.01" placeholder={t('clinical_treatment_cost')}
              value={treatmentCost} onChange={(e) => setTreatmentCost(e.target.value)}
            />
            <button type="button" onClick={addToCart}>{t('clinical_add_to_cart')}</button>
          </div>

          <div className="dc-cart">
            <div className="font-bold" style={{ marginBottom: 4 }}>{t('clinical_cart_title')}</div>
            {cart.length === 0 && <div>{t('clinical_cart_empty')}</div>}
            {cart.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span><span className="dc-tooth-badge">#{c.tooth}</span> {c.name}</span>
                <span className="dc-money">
                  {money(c.cost)}
                  <button type="button" onClick={() => removeFromCart(i)} style={{ marginInlineStart: 8 }}>×</button>
                </span>
              </div>
            ))}
            {cart.length > 0 && (
              <div className="font-bold" style={{ borderTop: '1px solid #bae6fd', marginTop: 4, paddingTop: 4 }}>
                {t('clinical_cart_total')}: <span className="dc-money">{money(cartTotal)}</span>
              </div>
            )}
          </div>
          <label className="dc-session-notes">
            <span className="dc-muted text-sm">{t('clinical_session_notes')}</span>
            <textarea
              rows={3}
              placeholder={t('clinical_session_notes_placeholder')}
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
            />
          </label>
          <ClinicalImagesAttach
            items={pendingXrays}
            onChange={(next) => {
              setPendingXrays(next);
              if (!next.length) setXrayUploadSessionId(null);
            }}
            aiAvailable={Boolean(patientFile.aiAnalysisAvailable)}
          />
          {xrayUploadSessionId && pendingXrays.length > 0 && (
            <div className="dc-clinical-xray-retry">
              <p className="dc-error text-sm">{t('clinical_xray_upload_retry_hint')}</p>
              <button type="button" className="dc-success" onClick={retryXrayUpload} disabled={submitting}>
                {submitting ? t('clinical_committing') : t('clinical_xray_upload_retry')}
              </button>
            </div>
          )}
          {error && <div className="dc-error">{error}</div>}
          <button
            type="button"
            className="dc-success"
            onClick={commitSession}
            disabled={submitting || Boolean(xrayUploadSessionId && pendingXrays.length > 0)}
          >
            {submitting ? t('clinical_committing') : t('clinical_commit_session')}
          </button>
            </>
          )}
          {!canEditClinical && error && <div className="dc-error">{error}</div>}
        </section>

        <section className="dc-col">
          <div className="dc-mini-card">
            <h4>{t('clinical_current_balance')}</h4>
            <div className={`dc-debt-lg${selectedPatient && Number(selectedPatient.balance) <= 0 ? '' : ''}`}>
              {selectedPatient ? money(selectedPatient.balance) : '—'}
            </div>
            {waEnabled && selectedPatient && (
              <button
                type="button"
                className="dc-ghost"
                style={{ marginTop: 8 }}
                disabled={Boolean(waBusy)}
                onClick={() => sendWhatsapp('balance', { patientId: selectedPatient.id })}
              >
                {waBusy === 'balance' ? t('ledger_loading') : t('wa_send_balance')}
              </button>
            )}
          </div>
          <div className="dc-mini-card">
            <div className="dc-appt-head">
              <h4>{t('clinical_appointments')}</h4>
              {canEditAppointments && (
                <button type="button" onClick={() => openApptModal('')}>{t('clinical_appointment_add')}</button>
              )}
            </div>
            <label className="dc-muted text-sm">{t('clinical_appointment_date')}</label>
            <FormattedDateInput value={apptDate} onChange={setApptDate} />
            <div className="dc-schedule" role="list">
              {slots.map((slot) => {
                const row = apptBySlot[slot];
                const taken = Boolean(row);
                return (
                  <div
                    key={slot}
                    role="listitem"
                    className={`dc-schedule-row${taken ? ' is-taken' : ' is-free'}${row && selectedPatientId === row.patient_id ? ' is-active' : ''}`}
                    onClick={() => {
                      if (taken) setSelectedPatientId(row.patient_id);
                      else if (canEditAppointments) openApptModal(slot);
                    }}
                  >
                    <div className="dc-schedule-time">{slot}</div>
                    <div className="dc-schedule-body">
                      {taken ? (
                        <>
                          <div className="font-bold">{row.patient_name}</div>
                          <span className={`dc-badge ${row.status === 'DONE' ? 'dc-badge-emerald' : 'dc-badge-amber'}`}>
                            {t(`clinical_appt_${row.status.toLowerCase()}`)}
                          </span>
                        </>
                      ) : (
                        <span className="dc-muted">{t('clinical_slot_available')}</span>
                      )}
                    </div>
                    {canEditAppointments && row?.status === 'SCHEDULED' && (
                      <div className="dc-schedule-actions" onClick={(e) => e.stopPropagation()}>
                        {waEnabled && (
                          <button
                            type="button"
                            className="dc-ghost"
                            title={t('wa_send_reminder')}
                            disabled={Boolean(waBusy)}
                            onClick={() => sendWhatsapp('reminder', { appointmentId: row.id })}
                          >
                            {waBusy === `reminder:${row.id}` ? '…' : 'WA'}
                          </button>
                        )}
                        <button type="button" className="dc-success" onClick={() => setApptStatus(row.id, 'DONE')}>✓</button>
                        <button type="button" className="dc-danger" onClick={() => setApptStatus(row.id, 'CANCELLED')}>×</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="dc-mini-card">
            <h4>{t('clinical_patient_file')}</h4>
            {(!selectedPatient || patientFile.sessions.length === 0) && (
              <div className="dc-muted">{t('clinical_patient_file_empty')}</div>
            )}
            {patientFile.sessions.map((session) => (
              <div key={session.id} className="dc-file-session">
                <div className="dc-muted text-sm">
                  {date(session.session_date)}
                  {session.doctor_name ? ` — ${session.doctor_name}` : ''}
                </div>
                {session.items.map((item, i) => (
                  <div key={`${session.id}-${i}`}>
                    <span className="dc-tooth-badge">#{item.tooth}</span>
                    {item.name} <span className="dc-money">({money(item.cost)})</span>
                  </div>
                ))}
                {session.notes ? (
                  <div className="dc-session-note-log">
                    <strong>{t('clinical_session_notes')}:</strong> {session.notes}
                  </div>
                ) : null}
                <ClinicalSessionImages
                  sessionId={session.id}
                  images={session.images || []}
                  canEdit={canEditClinical}
                  aiAvailable={Boolean(patientFile.aiAnalysisAvailable)}
                  onChanged={reloadFile}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <PartyModal
        open={patientPickerOpen}
        title={t('clinical_pick_patient')}
        onClose={() => setPatientPickerOpen(false)}
      >
        <div className="dc-patient-picker">
          <input
            type="search"
            autoFocus
            placeholder={t('clinical_search_patient')}
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
          />
          <div className="dc-patient-picker-list">
            {filteredPatients.length === 0 && (
              <div className="dc-muted">{t('clinical_patient_search_empty')}</div>
            )}
            {filteredPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`dc-patient-picker-row${selectedPatientId === p.id ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedPatientId(p.id);
                  setPatientPickerOpen(false);
                  setPatientSearch('');
                }}
              >
                <span>
                  <strong>{p.name}</strong>
                  <span className="dc-muted">{p.phone || '—'}</span>
                </span>
                <span className={`dc-balance-chip${Number(p.balance) > 0 ? '' : ' is-ok'}`}>
                  {money(p.balance)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </PartyModal>

      {apptModalOpen && (
        <div className="dc-modal-backdrop" onClick={() => setApptModalOpen(false)}>
          <div className="dc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dc-appt-head">
              <h3>{t('clinical_appointment_modal_title')}</h3>
              <button type="button" className="dc-danger" onClick={() => setApptModalOpen(false)}>×</button>
            </div>
            <p className="dc-muted text-sm">{t('clinical_appointment_modal_hint')}</p>
            <form onSubmit={saveAppointment} className="space-y-2">
              <label className="dc-muted text-sm">{t('clinical_appointment_date')}</label>
              <FormattedDateInput
                value={apptDate}
                onChange={(next) => {
                  setApptDate(next);
                  setModalSlot('');
                }}
                required
              />
              <label className="dc-muted text-sm">{t('clinical_search_patient')}</label>
              <input
                type="search"
                value={modalPatientSearch}
                onChange={(e) => setModalPatientSearch(e.target.value)}
                placeholder={t('clinical_search_patient')}
              />
              <select value={modalPatientId} onChange={(e) => setModalPatientId(e.target.value)} required>
                <option value="">{t('clinical_select_patient')}</option>
                {modalPatients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {doctors.length > 0 && (
                <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)}>
                  <option value="">{t('clinical_select_doctor')}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
              <label className="dc-muted text-sm">{t('clinical_appointment_time')}</label>
              <div className="dc-slot-grid">
                {slots.map((slot) => {
                  const taken = Boolean(apptBySlot[slot]);
                  const selected = modalSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={taken}
                      className={`dc-slot${taken ? ' is-taken' : ' is-free'}${selected ? ' is-selected' : ''}`}
                      onClick={() => { if (!taken) setModalSlot(slot); }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                placeholder={t('clinical_appointment_notes')}
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
              />
              {error && <div className="dc-error">{error}</div>}
              <button type="submit" disabled={!modalPatientId || !modalSlot}>
                {t('clinical_appointment_save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {printJob?.type === 'medical' && (
        <div className="dc-print-sheet print-document">
          <PrintHeader title={`${t('nav_clinical_report')} — ${printJob.patient.name}`} />
          {printJob.patient.medical_notes && (
            <div className="print-summary">
              <strong>{t('patient_medical_notes')}:</strong> {printJob.patient.medical_notes}
            </div>
          )}
          {printJob.file.sessions.length === 0 && <div>{t('clinical_report_none')}</div>}
          {printJob.file.sessions.length > 0 && (
            <table className="w-full text-sm print-table">
              <thead>
                <tr>
                  <th>{t('clinical_report_col_tooth')}</th>
                  <th>{t('clinical_report_col_treatment')}</th>
                  <th>{t('clinical_report_col_doctor')}</th>
                  <th>{t('clinical_report_col_date')}</th>
                  <th>{t('clinical_treatment_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {printJob.file.sessions.flatMap((session) => {
                  const rows = session.items.map((item, i) => (
                    <tr key={`${session.id}-${i}`}>
                      <td>#{item.tooth || '—'}</td>
                      <td>{item.name}</td>
                      <td>{session.doctor_name || '—'}</td>
                      <td>{date(session.session_date)}</td>
                      <td className="dc-money">{money(item.cost)}</td>
                    </tr>
                  ));
                  if (session.notes) {
                    rows.push(
                      <tr key={`${session.id}-notes`}>
                        <td colSpan={5} className="print-session-notes">
                          <strong>{t('clinical_session_notes')}:</strong> {session.notes}
                        </td>
                      </tr>
                    );
                  }
                  const imgCount = (session.images || []).length;
                  if (imgCount > 0) {
                    rows.push(
                      <tr key={`${session.id}-xrays`}>
                        <td colSpan={5} className="print-session-notes">
                          <strong>{t('clinical_xray_title')}:</strong>{' '}
                          {t('clinical_xray_print_count', { count: imgCount })}
                          {(session.images || []).filter((img) => img.aiReport).map((img) => (
                            <div key={img.id} className="print-session-ai-report">
                              <strong>{t('clinical_ai_report_title')}:</strong>
                              <div>{String(img.aiReport).slice(0, 800)}{String(img.aiReport).length > 800 ? '…' : ''}</div>
                              <em>{t('clinical_ai_disclaimer')}</em>
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {printJob?.type === 'ledger' && (
        <div className="dc-print-sheet print-document">
          <PrintHeader title={`${t('nav_ledger')} — ${printJob.patient.name}`} />
          <div className="print-summary flex justify-between font-bold">
            <span>{printJob.ledger.accountName}</span>
            <span>{t('ledger_opening_balance')}: {money(printJob.ledger.openingBalance)}</span>
          </div>
          <table className="w-full text-sm print-table">
            <thead>
              <tr>
                <th>{t('ledger_col_date')}</th>
                <th>{t('ledger_col_details')}</th>
                <th>{t('voucher_debit')}</th>
                <th>{t('voucher_credit')}</th>
                <th>{t('ledger_col_running')}</th>
              </tr>
            </thead>
            <tbody>
              {printJob.ledger.movements.map((m, i) => (
                <tr key={i}>
                  <td>{date(m.date)}</td>
                  <td>{m.details}</td>
                  <td className="dc-money">{money(m.debit)}</td>
                  <td className="dc-money">{money(m.credit)}</td>
                  <td className="dc-money">{money(m.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="font-bold">
            {t('ledger_closing_balance')}: {money(printJob.ledger.closingBalance)}
          </div>
        </div>
      )}
    </>
  );
}
