import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader from '../components/PrintHeader';
import PatientForm from '../components/PatientForm';
import DentalChart from '../components/DentalChart';
import ToothPanel from '../components/ToothPanel';
import FormattedDateInput from '../components/FormattedDateInput';
import PartyModal from '../components/PartyModal';
import SearchableSelect from '../components/SearchableSelect';
import ClinicalImagesAttach from '../components/ClinicalImagesAttach';
import ClinicalSessionImages from '../components/ClinicalSessionImages';
import RoomTimelineModal from '../components/RoomTimelineModal';
import { localizedDisplay } from '../lib/localizedName';
import { inferConditionFromName, conditionLabelKey } from '../lib/toothConditions';

const ROOM_NAME_KEYS = {
  ar: ['name', 'room_name'],
  en: ['name_en', 'room_name_en'],
  he: ['name_he', 'room_name_he'],
};

const CLINIC_OPEN_HOUR = 8;
const CLINIC_CLOSE_HOUR = 20;
const SCHEDULE_GRID_COLS = 4;

function buildScheduleGridCells(slots, appointments, doctorId, roomId) {
  const cells = [];
  const skipped = new Set();

  for (let i = 0; i < slots.length; i += 1) {
    if (skipped.has(i)) continue;

    const slot = slots[i];
    const state = slotAvailability(appointments, slot, doctorId, roomId);
    const row = state.match;

    if (row) {
      let span = 1;
      while (i + span < slots.length) {
        if (Math.floor((i + span) / SCHEDULE_GRID_COLS) !== Math.floor(i / SCHEDULE_GRID_COLS)) break;
        const nextState = slotAvailability(appointments, slots[i + span], doctorId, roomId);
        if (nextState.match?.id !== row.id) break;
        span += 1;
      }
      for (let j = 1; j < span; j += 1) skipped.add(i + j);
      cells.push({
        slot,
        span,
        state,
        row,
        isApptStart: row.slot === slot,
        segmentEnd: slots[i + span - 1],
      });
      continue;
    }

    cells.push({
      slot,
      span: 1,
      state,
      row: null,
      isApptStart: false,
      segmentEnd: slot,
    });
  }

  return cells;
}

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

function slotToMinutes(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

function appointmentEndSlot(row) {
  return row.end_slot || row.slot || String(row.starts_at || '').slice(11, 16);
}

function appointmentCoversSlot(row, slot) {
  if (row.status === 'CANCELLED') return false;
  const start = row.slot || String(row.starts_at || '').slice(11, 16);
  const end = appointmentEndSlot(row);
  const s = slotToMinutes(slot);
  const s0 = slotToMinutes(start);
  const s1 = slotToMinutes(end);
  if (s == null || s0 == null || s1 == null) return false;
  return s >= s0 && s <= s1;
}

function normalizeSlotRange(start, end) {
  const a = slotToMinutes(start);
  const b = slotToMinutes(end ?? start);
  if (a == null || b == null) return null;
  return a <= b ? { start, end: end ?? start } : { start: end, end: start };
}

function slotsInRange(start, end, allSlots) {
  const range = normalizeSlotRange(start, end);
  if (!range) return [];
  const lo = slotToMinutes(range.start);
  const hi = slotToMinutes(range.end);
  return allSlots.filter((s) => {
    const m = slotToMinutes(s);
    return m != null && m >= lo && m <= hi;
  });
}

function formatSlotRange(start, end) {
  const range = normalizeSlotRange(start, end);
  if (!range) return start || '';
  if (range.start === range.end) return range.start;
  return `${range.start}–${range.end}`;
}

function slotAvailability(appointments, slot, doctorId, roomId) {
  const active = (appointments || []).filter((a) => a.status !== 'CANCELLED');
  const covering = active.filter((a) => appointmentCoversSlot(a, slot));
  const forDoctor = covering.find((a) => a.doctor_id === doctorId);
  const forRoom = covering.find((a) => a.room_id === roomId);
  const match = covering.find((a) => a.doctor_id === doctorId && a.room_id === roomId);
  const isContinuation = Boolean(match && match.slot !== slot);
  return {
    match,
    forDoctor,
    forRoom,
    available: !forDoctor && !forRoom,
    isContinuation,
  };
}

function isRangeFullyAvailable(appointments, start, end, doctorId, roomId, allSlots) {
  const rangeSlots = slotsInRange(start, end, allSlots);
  if (rangeSlots.length === 0) return false;
  return rangeSlots.every((s) => slotAvailability(appointments, s, doctorId, roomId).available);
}

function isSlotInModalRange(slot, start, end, allSlots) {
  if (!start) return false;
  return slotsInRange(start, end || start, allSlots).includes(slot);
}

function firstAvailableSlot(appointments, doctorId, roomId, allSlots) {
  for (const slot of allSlots) {
    if (slotAvailability(appointments, slot, doctorId, roomId).available) return slot;
  }
  return '';
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
  const { t, i18n } = useTranslation();
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
  const [scheduleDoctorId, setScheduleDoctorId] = useState('');
  const [scheduleRoomId, setScheduleRoomId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentCost, setTreatmentCost] = useState('');
  const [cart, setCart] = useState([]);
  const [sessionNotes, setSessionNotes] = useState('');
  const [pendingXrays, setPendingXrays] = useState([]);
  const [xrayUploadSessionId, setXrayUploadSessionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [doctorFieldAlert, setDoctorFieldAlert] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [catalog, setCatalog] = useState([]);
  const [patientFile, setPatientFile] = useState({ sessions: [], treatedTeeth: [] });
  const [toothChartTeeth, setToothChartTeeth] = useState({});
  const [planDraftItems, setPlanDraftItems] = useState([]);
  const [planNotes, setPlanNotes] = useState('');
  const [chartSaving, setChartSaving] = useState(false);
  const [apptDate, setApptDate] = useState(todayIso);
  const [appointments, setAppointments] = useState([]);
  const [waBusy, setWaBusy] = useState(null);
  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [modalPatientId, setModalPatientId] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [modalRange, setModalRange] = useState({ start: '', end: '' });
  const [modalPlanItemId, setModalPlanItemId] = useState('');
  const [modalPendingPlan, setModalPendingPlan] = useState([]);
  const [planReport, setPlanReport] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [allDayAppointments, setAllDayAppointments] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [printJob, setPrintJob] = useState(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [mobileTab, setMobileTab] = useState('patient');

  const clinicalMobileTabs = useMemo(() => ([
    { id: 'patient', label: t('clinical_tab_patient'), icon: 'fa-solid fa-user' },
    { id: 'session', label: t('clinical_tab_treatment'), icon: 'fa-solid fa-tooth' },
    { id: 'sidebar', label: t('clinical_tab_schedule'), icon: 'fa-solid fa-calendar-days' },
  ]), [t]);

  useEffect(() => {
    api.get('/doctors').then((rows) => {
      const list = Array.isArray(rows) ? rows : [];
      setDoctors(list);
      if (list.length === 1) {
        setScheduleDoctorId(list[0].id);
      }
    }).catch(() => setDoctors([]));
    api.get('/rooms').then((rows) => {
      const list = (Array.isArray(rows) ? rows : []).filter((r) => r.is_active !== false);
      setRooms(list);
      if (list.length === 1) {
        setScheduleRoomId(list[0].id);
      }
    }).catch(() => setRooms([]));
    api.get('/treatments').then((rows) => setCatalog(rows.filter((x) => x.is_active))).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!focusPatientId) return;
    setSelectedPatientId(focusPatientId);
    onFocusPatientConsumed?.();
  }, [focusPatientId, onFocusPatientConsumed]);

  useEffect(() => {
    api.get('/patients').then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    if (!scheduleDoctorId || !scheduleRoomId) {
      setAppointments([]);
      return;
    }
    api.get('/appointments', { date: apptDate })
      .then(setAppointments)
      .catch(() => setAppointments([]));
  }, [apptDate, scheduleDoctorId, scheduleRoomId]);

  useEffect(() => {
    if (!timelineOpen) return;
    setTimelineLoading(true);
    api.get('/appointments', { date: apptDate })
      .then(setAllDayAppointments)
      .catch(() => setAllDayAppointments([]))
      .finally(() => setTimelineLoading(false));
  }, [timelineOpen, apptDate]);

  useEffect(() => {
    if (!waEnabled || !settings?.waAutoReminder) return;
    const key = `wa-reminders-${todayIso()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    api.post('/whatsapp/reminders/run').catch(() => {});
  }, [waEnabled, settings?.waAutoReminder]);

  useEffect(() => {
    setSelectedTooth(null);
    setDoctorFieldAlert(false);
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientFile({ sessions: [], treatedTeeth: [] });
      setToothChartTeeth({});
      setPlanDraftItems([]);
      setPlanNotes('');
      setPlanReport(null);
      setPendingXrays([]);
      setXrayUploadSessionId(null);
      return;
    }
    api.get(`/clinical/patient-file/${selectedPatientId}`)
      .then(setPatientFile)
      .catch(() => setPatientFile({ sessions: [], treatedTeeth: [] }));
    api.get(`/clinical/tooth-chart/${selectedPatientId}`)
      .then((data) => setToothChartTeeth(data.teeth || {}))
      .catch(() => setToothChartTeeth({}));
    api.get(`/clinical/treatment-plan/${selectedPatientId}`)
      .then((plan) => {
        setPlanDraftItems(plan.items || []);
        setPlanNotes(plan.notes || '');
      })
      .catch(() => {
        setPlanDraftItems([]);
        setPlanNotes('');
      });
  }, [selectedPatientId]);

  useEffect(() => {
    if (!apptModalOpen || !modalPatientId) {
      if (!modalPatientId) setModalPendingPlan([]);
      return;
    }
    api.get(`/clinical/treatment-plan/${modalPatientId}`)
      .then((plan) => {
        const pending = (plan.items || []).filter((i) => i.status === 'PLANNED');
        setModalPendingPlan(pending);
      })
      .catch(() => setModalPendingPlan([]));
  }, [modalPatientId, apptModalOpen]);

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
  const hasSelectedPatient = Boolean(selectedPatientId);
  const hasSelectedTooth = selectedTooth != null && selectedTooth !== '';
  const canPickTreatment = hasSelectedPatient && hasSelectedTooth;
  const slots = useMemo(() => daySlots(), []);
  const activeRooms = useMemo(
    () => rooms.filter((r) => r.is_active !== false),
    [rooms]
  );
  const selectedScheduleRoom = useMemo(
    () => activeRooms.find((r) => r.id === scheduleRoomId),
    [activeRooms, scheduleRoomId]
  );
  const patientSelectOptions = useMemo(
    () => patients.map((p) => ({
      value: p.id,
      label: p.name,
      searchText: `${p.name} ${p.phone || ''}`.trim(),
    })),
    [patients]
  );
  const scheduleGridCells = useMemo(
    () => buildScheduleGridCells(slots, appointments, scheduleDoctorId, scheduleRoomId),
    [slots, appointments, scheduleDoctorId, scheduleRoomId]
  );

  function addToCart() {
    if (!hasSelectedPatient) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (!hasSelectedTooth) {
      setError(t('clinical_select_tooth_first'));
      return;
    }
    if (!selectedDoctorId) {
      setError(t('clinical_doctor_required'));
      setDoctorFieldAlert(true);
      return;
    }
    const cost = Number(treatmentCost);
    if (!treatmentName.trim() || !cost || cost <= 0) {
      setError(t('clinical_treatment_required'));
      return;
    }
    setError(null);
    setDoctorFieldAlert(false);
    setCart((prev) => [...prev, { tooth: selectedTooth, name: treatmentName.trim(), cost }]);
    setTreatmentName('');
    setTreatmentCost('');
  }

  function pickCatalog(item) {
    if (!hasSelectedPatient) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (!hasSelectedTooth) {
      setError(t('clinical_select_tooth_first'));
      return;
    }
    setError(null);
    setTreatmentName(item.name);
    setTreatmentCost(String(item.price));
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
    if (!selectedDoctorId) {
      setError(t('clinical_doctor_required'));
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
          await reloadToothChart();
          alert(t('clinical_session_success'));
        } catch (uploadErr) {
          const detail = uploadErr instanceof ApiError
            ? (uploadErr.body?.error || uploadErr.message)
            : t('error_network');
          setXrayUploadSessionId(result.sessionId);
          setError(t('clinical_xray_upload_failed', { detail }));
          await reloadFile();
          await reloadToothChart();
          alert(t('clinical_session_success_images_failed'));
        }
      } else {
        setPendingXrays([]);
        setXrayUploadSessionId(null);
        await reloadFile();
        await reloadToothChart();
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

  function openApptModal(slot = '', { roomId: roomOverride } = {}) {
    let doctorId = scheduleDoctorId;
    let roomId = roomOverride || scheduleRoomId;

    // إن لم يُختر بعد — اختر الأول المتاح حتى لا يبدو الزر «ميّتاً»
    if (!doctorId && doctors.length > 0) {
      doctorId = doctors[0].id;
      setScheduleDoctorId(doctorId);
    }
    if (!roomId && activeRooms.length > 0) {
      roomId = activeRooms[0].id;
      setScheduleRoomId(roomId);
    } else if (roomOverride) {
      setScheduleRoomId(roomOverride);
      roomId = roomOverride;
    }

    if (!doctorId) {
      setError(t('clinical_schedule_doctor_required'));
      setApptModalOpen(true);
      setModalRange({ start: '', end: '' });
      setModalPatientId(selectedPatientId || '');
      setModalNotes('');
      setModalPlanItemId('');
      return;
    }
    if (!roomId) {
      setError(t('clinical_schedule_no_rooms'));
      setApptModalOpen(true);
      setModalRange({ start: '', end: '' });
      setModalPatientId(selectedPatientId || '');
      setModalNotes('');
      setModalPlanItemId('');
      return;
    }

    const startSlot = slot
      || firstAvailableSlot(appointments, doctorId, roomId, slots)
      || slots[0]
      || '';

    setError(null);
    setModalRange({ start: startSlot, end: startSlot });
    setModalPatientId(selectedPatientId || '');
    setModalNotes('');
    setModalPlanItemId('');
    setApptModalOpen(true);
  }

  function pickModalSlot(slot) {
    setModalRange((prev) => {
      if (!prev.start || (prev.start && prev.end && prev.start !== prev.end)) {
        setError(null);
        return { start: slot, end: slot };
      }
      const range = normalizeSlotRange(prev.start, slot);
      if (!range) return prev;
      if (!isRangeFullyAvailable(appointments, range.start, range.end, scheduleDoctorId, scheduleRoomId, slots)) {
        setError(t('clinical_appointment_range_busy'));
        return prev;
      }
      setError(null);
      return { start: range.start, end: range.end };
    });
  }

  async function reloadAppointments() {
    if (!scheduleDoctorId || !scheduleRoomId) {
      setAppointments([]);
    } else {
      try {
        setAppointments(await api.get('/appointments', { date: apptDate }));
      } catch {
        setAppointments([]);
      }
    }
    if (timelineOpen) {
      setAllDayAppointments(await api.get('/appointments', { date: apptDate }).catch(() => []));
    }
  }

  function openTimeline() {
    setError(null);
    setTimelineOpen(true);
  }

  function handleTimelineSelect(appt) {
    setSelectedPatientId(appt.patient_id);
    if (appt.doctor_id) setScheduleDoctorId(appt.doctor_id);
    if (appt.room_id) setScheduleRoomId(appt.room_id);
    setTimelineOpen(false);
  }

  function handleTimelineBook({ roomId, slot }) {
    if (!canEditAppointments) return;
    setTimelineOpen(false);
    openApptModal(slot, { roomId });
  }

  async function reloadToothChart() {
    if (!selectedPatientId) return;
    const chart = await api.get(`/clinical/tooth-chart/${selectedPatientId}`).catch(() => null);
    if (chart) setToothChartTeeth(chart.teeth || {});
    const plan = await api.get(`/clinical/treatment-plan/${selectedPatientId}`).catch(() => null);
    if (plan) {
      setPlanDraftItems(plan.items || []);
      setPlanNotes(plan.notes || '');
    }
  }

  async function saveToothCurrent(conditionCode, notes) {
    if (!selectedPatientId || !selectedTooth) return;
    setChartSaving(true);
    setError(null);
    try {
      const chart = await api.put(
        `/clinical/tooth-chart/${selectedPatientId}/${selectedTooth}`,
        { conditionCode, notes: notes || undefined }
      );
      setToothChartTeeth(chart.teeth || {});
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setChartSaving(false);
    }
  }

  function addPlannedItem(item) {
    setPlanDraftItems((prev) => [
      ...prev,
      {
        ...item,
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sortOrder: prev.length,
        status: 'PLANNED',
      },
    ]);
  }

  function removePlannedItem(id) {
    setPlanDraftItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function saveTreatmentPlanDraft() {
    if (!selectedPatientId) return;
    setChartSaving(true);
    setError(null);
    try {
      const plan = await api.put(`/clinical/treatment-plan/${selectedPatientId}`, {
        notes: planNotes || undefined,
        items: planDraftItems.map((item, index) => ({
          tooth: item.tooth,
          conditionCode: item.conditionCode || inferConditionFromName(item.name),
          catalogId: item.catalogId || undefined,
          name: item.name,
          cost: item.cost,
          sortOrder: index,
        })),
      });
      setPlanDraftItems(plan.items || []);
      setPlanNotes(plan.notes || '');
      await reloadToothChart();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setChartSaving(false);
    }
  }

  const planItemsForSelectedTooth = useMemo(
    () => planDraftItems.filter(
      (item) => String(item.tooth) === String(selectedTooth) && item.status !== 'CANCELLED'
    ),
    [planDraftItems, selectedTooth]
  );

  const savedPlannedItems = useMemo(
    () => planDraftItems.filter(
      (item) => item.status === 'PLANNED' && item.id && !String(item.id).startsWith('draft-')
    ),
    [planDraftItems]
  );

  function addFromPlanItem(item) {
    if (!hasSelectedPatient) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (!selectedDoctorId) {
      setError(t('clinical_doctor_required'));
      setDoctorFieldAlert(true);
      return;
    }
    setError(null);
    setDoctorFieldAlert(false);
    setSelectedTooth(item.tooth);
    setCart((prev) => [...prev, {
      tooth: item.tooth,
      name: item.name,
      cost: item.cost,
      conditionCode: item.conditionCode,
      catalogId: item.catalogId || undefined,
      planItemId: item.id,
    }]);
  }

  async function loadPlanReport() {
    if (!selectedPatientId) return;
    try {
      const report = await api.get(`/clinical/plan-report/${selectedPatientId}`);
      setPlanReport(report);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function saveAppointment(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!scheduleDoctorId) {
      setError(t('clinical_appointment_doctor_required'));
      return;
    }
    if (!scheduleRoomId) {
      setError(t('clinical_appointment_room_required'));
      return;
    }
    if (!modalPatientId) {
      setError(t('clinical_patient_required'));
      return;
    }
    if (!modalRange.start) {
      setError(t('clinical_appointment_slot_required'));
      return;
    }
    const range = normalizeSlotRange(modalRange.start, modalRange.end || modalRange.start);
    if (!range) {
      setError(t('clinical_appointment_slot_required'));
      return;
    }
    if (!isRangeFullyAvailable(appointments, range.start, range.end, scheduleDoctorId, scheduleRoomId, slots)) {
      setError(t('clinical_appointment_range_busy'));
      return;
    }
    setError(null);
    try {
      await api.post('/appointments', {
        patientId: modalPatientId,
        doctorId: scheduleDoctorId,
        roomId: scheduleRoomId,
        date: apptDate,
        slot: range.start,
        endSlot: range.end,
        notes: modalNotes || undefined,
        planItemId: modalPlanItemId || undefined,
      });
      setApptModalOpen(false);
      setModalPlanItemId('');
      setModalNotes('');
      await reloadAppointments();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function setApptStatus(id, status) {
    try {
      await api.patch(`/appointments/${id}`, { status });
      await reloadAppointments();
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
      <nav className="dc-clinical-mobile-tabs" aria-label={t('clinical_mobile_tabs')}>
        {clinicalMobileTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dc-clinical-mobile-tab${mobileTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setMobileTab(tab.id)}
          >
            <i className={tab.icon} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="dc-clinical dc-clinical-screen">
        <section className={`dc-col dc-col-patient${mobileTab !== 'patient' ? ' is-mobile-hidden' : ''}`}>
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
              <button type="button" className="dc-ghost-light" onClick={loadPlanReport} disabled={!selectedPatient}>
                <i className="fa-solid fa-list-check" /> {t('clinical_plan_report')}
              </button>
            </div>
          )}

          {planReport && selectedPatient && (
            <div className="dc-mini-card dc-plan-report">
              <h4>{t('clinical_plan_report')}</h4>
              {planReport.planned.length === 0 && planReport.completed.length === 0 && (
                <p className="dc-muted text-sm">{t('tooth_panel_planned_empty')}</p>
              )}
              {planReport.planned.length > 0 && (
                <div>
                  <strong>{t('clinical_plan_report_planned')}</strong>
                  <ul className="dc-tooth-plan-list">
                    {planReport.planned.map((item) => (
                      <li key={item.id} className="dc-tooth-plan-item">
                        #{item.tooth} — {t(conditionLabelKey(item.conditionCode))}: {item.name}
                        <span className="dc-money"> ({money(item.cost)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {planReport.completed.length > 0 && (
                <div>
                  <strong>{t('clinical_plan_report_completed')}</strong>
                  <ul className="dc-tooth-plan-list">
                    {planReport.completed.map((item) => (
                      <li key={item.id} className="dc-tooth-plan-item">
                        #{item.tooth} — {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm dc-muted">
                {t('clinical_plan_report_totals', {
                  remaining: money(planReport.totals?.plannedRemaining || 0),
                  executed: money(planReport.totals?.sessionExecuted || 0),
                })}
              </p>
            </div>
          )}

          <div className="dc-mini-card dc-patient-file-card">
            <h4>{t('clinical_patient_file')}</h4>
            <div className="dc-patient-file-scroll">
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
          </div>

          <div className="dc-mini-card dc-patient-balance-card">
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
        </section>

        <section className={`dc-col dc-col-session${mobileTab !== 'session' ? ' is-mobile-hidden' : ''}`}>
          <DentalChart
            selectedTooth={selectedTooth}
            toothStates={toothChartTeeth}
            selectEnabled={hasSelectedPatient}
            selectHint={t('clinical_patient_required')}
            onSelectTooth={(tooth) => {
              if (!hasSelectedPatient) {
                setError(t('clinical_patient_required'));
                return;
              }
              setSelectedTooth(tooth);
              setError(null);
            }}
          />

          {hasSelectedPatient && selectedTooth != null && selectedTooth !== '' && (
            <ToothPanel
              key={selectedTooth}
              tooth={selectedTooth}
              toothState={toothChartTeeth[String(selectedTooth)]}
              planItemsForTooth={planItemsForSelectedTooth}
              toothHistory={toothHistory}
              catalog={catalog}
              money={money}
              date={date}
              canEdit={canEditClinical}
              saving={chartSaving}
              onSaveCurrent={saveToothCurrent}
              onAddPlanned={addPlannedItem}
              onRemovePlanned={removePlannedItem}
              onSavePlan={saveTreatmentPlanDraft}
              planNotes={planNotes}
              onPlanNotesChange={setPlanNotes}
              allPlanItems={planDraftItems}
            />
          )}

          {canEditClinical && (
            <>
          <h3 className="dc-col-title"><i className="fa-solid fa-plus" style={{ color: '#059669' }} /> {t('clinical_pick_treatment')}</h3>
          {!hasSelectedPatient && (
            <p className="dc-clinical-tooth-hint" role="status">
              <i className="fa-solid fa-user" aria-hidden="true" />
              {t('clinical_patient_required')}
            </p>
          )}
          {hasSelectedPatient && !hasSelectedTooth && (
            <p className="dc-clinical-tooth-hint" role="status">
              <i className="fa-solid fa-hand-pointer" aria-hidden="true" />
              {t('clinical_select_tooth_first')}
            </p>
          )}
          {canPickTreatment && (
            <p className="dc-clinical-selected-tooth text-sm">
              {t('clinical_selected_tooth')}: <strong>#{selectedTooth}</strong>
            </p>
          )}
          {catalog.length > 0 && (
            <div className="dc-treat-grid">
              {catalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="dc-treat-tile"
                  disabled={!canPickTreatment}
                  title={!hasSelectedPatient
                    ? t('clinical_patient_required')
                    : !hasSelectedTooth
                      ? t('clinical_select_tooth_first')
                      : undefined}
                  onClick={() => pickCatalog(item)}
                >
                  {item.name}
                  <span className="dc-price-tag">{money(item.price)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="dc-form-row dc-clinical-treat-row">
            <div className="dc-form-field">
              <input
                type="text" placeholder={t('clinical_treatment_name')}
                value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)}
                disabled={!canPickTreatment}
              />
            </div>
            <div className={`dc-form-field dc-doctor-field${doctorFieldAlert ? ' is-alert' : ''}`}>
              {doctorFieldAlert && (
                <span className="dc-field-alert" title={t('clinical_doctor_required')}>
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                </span>
              )}
              <select
                value={selectedDoctorId}
                onChange={(e) => {
                  setSelectedDoctorId(e.target.value);
                  if (e.target.value) setDoctorFieldAlert(false);
                }}
                disabled={!canPickTreatment}
                aria-invalid={doctorFieldAlert || undefined}
                aria-describedby={doctorFieldAlert ? 'clinical-doctor-alert' : undefined}
              >
                <option value="">{t('clinical_select_doctor')}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {doctorFieldAlert && (
                <span id="clinical-doctor-alert" className="dc-sr-only">{t('clinical_doctor_required')}</span>
              )}
            </div>
            <div className="dc-form-field">
              <input
                type="number" min="0" step="0.01" placeholder={t('clinical_treatment_cost')}
                value={treatmentCost} onChange={(e) => setTreatmentCost(e.target.value)}
                disabled={!canPickTreatment}
              />
            </div>
            <button
              type="button"
              className="dc-clinical-add-btn"
              onClick={addToCart}
              disabled={!canPickTreatment}
              title={!hasSelectedPatient
                ? t('clinical_patient_required')
                : !hasSelectedTooth
                  ? t('clinical_select_tooth_first')
                  : undefined}
            >
              {t('clinical_add_to_cart')}
            </button>
          </div>

          <div className="dc-cart">
            <div className="font-bold" style={{ marginBottom: 4 }}>{t('clinical_cart_title')}</div>
            {savedPlannedItems.length > 0 && (
              <div className="dc-cart-from-plan">
                <span className="dc-muted text-sm">{t('clinical_add_from_plan')}</span>
                <div className="dc-tooth-plan-catalog">
                  {savedPlannedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="dc-ghost-light"
                      onClick={() => addFromPlanItem(item)}
                    >
                      #{item.tooth} {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cart.length === 0 && <div>{t('clinical_cart_empty')}</div>}
            {cart.map((c, i) => (
              <div key={i} className="dc-cart-line">
                <span><span className="dc-tooth-badge">#{c.tooth}</span> {c.name}</span>
                <span className="dc-money">
                  {money(c.cost)}
                  <button type="button" className="dc-cart-remove" onClick={() => removeFromCart(i)} aria-label="×">×</button>
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

        <section className={`dc-col dc-col-sidebar${mobileTab !== 'sidebar' ? ' is-mobile-hidden' : ''}`}>
          <div className="dc-mini-card">
            <div className="dc-appt-head">
              <h4>{t('clinical_appointments')}</h4>
              <div className="dc-appt-head-actions">
                {activeRooms.length > 0 && (
                  <button type="button" className="dc-ghost" onClick={openTimeline}>
                    {t('clinical_room_timeline_open')}
                  </button>
                )}
                {canEditAppointments && (
                  <button
                    type="button"
                    onClick={() => openApptModal('')}
                    title={!scheduleDoctorId
                      ? t('clinical_schedule_doctor_required')
                      : !scheduleRoomId
                        ? t('clinical_schedule_room_required')
                        : undefined}
                  >
                    {t('clinical_appointment_add')}
                  </button>
                )}
              </div>
            </div>
            <div className="dc-form-row dc-schedule-filters">
              <div className="dc-form-field">
                <label className="dc-muted text-sm">{t('clinical_schedule_doctor')}</label>
                <select
                  value={scheduleDoctorId}
                  onChange={(e) => setScheduleDoctorId(e.target.value)}
                  required
                >
                  <option value="">{t('clinical_select_doctor')}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="dc-form-field">
                <label className="dc-muted text-sm">{t('clinical_schedule_room')}</label>
                <select
                  value={scheduleRoomId}
                  onChange={(e) => setScheduleRoomId(e.target.value)}
                  required
                >
                  <option value="">{t('clinical_select_room')}</option>
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.id}>{localizedDisplay(r, i18n.language, ROOM_NAME_KEYS)}</option>
                  ))}
                </select>
              </div>
            </div>
            {!scheduleDoctorId && (
              <p className="dc-muted text-sm">{t('clinical_schedule_doctor_required')}</p>
            )}
            {scheduleDoctorId && !scheduleRoomId && activeRooms.length === 0 && (
              <p className="dc-muted text-sm">{t('clinical_schedule_no_rooms')}</p>
            )}
            {scheduleDoctorId && activeRooms.length > 0 && !scheduleRoomId && (
              <p className="dc-muted text-sm">{t('clinical_schedule_room_required')}</p>
            )}
            {error && !apptModalOpen && (
              <div className="dc-error">{error}</div>
            )}
            <label className="dc-muted text-sm">{t('clinical_appointment_date')}</label>
            <FormattedDateInput value={apptDate} onChange={setApptDate} />
            {scheduleDoctorId && scheduleRoomId && (
            <div className="dc-schedule-grid" role="grid">
              {scheduleGridCells.map((cell) => {
                const { slot, span, state, row, isApptStart, segmentEnd } = cell;
                const taken = Boolean(row);
                const blocked = !state.available && !taken;
                const blockedLabel = state.forDoctor && state.forRoom
                  ? t('clinical_slot_busy_both')
                  : state.forDoctor
                    ? t('clinical_slot_doctor_busy', {
                      room: localizedDisplay(state.forDoctor, i18n.language, ROOM_NAME_KEYS),
                    })
                    : t('clinical_slot_room_busy', {
                      doctor: state.forRoom?.doctor_name || '—',
                    });
                const timeLabel = taken
                  ? (isApptStart
                    ? formatSlotRange(row.slot, appointmentEndSlot(row))
                    : formatSlotRange(slot, segmentEnd))
                  : slot;
                return (
                  <div
                    key={slot}
                    role="gridcell"
                    title={blocked ? blockedLabel : undefined}
                    style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
                    className={[
                      'dc-schedule-cell',
                      taken ? ' is-taken' : blocked ? ' is-blocked' : ' is-free',
                      span > 1 ? ' is-merged' : '',
                      taken && !isApptStart ? ' is-segment' : '',
                      row && selectedPatientId === row.patient_id ? ' is-active' : '',
                    ].join('')}
                    onClick={() => {
                      if (taken) setSelectedPatientId(row.patient_id);
                      else if (state.available && canEditAppointments) openApptModal(slot);
                    }}
                  >
                    <div className="dc-schedule-cell-time" dir="ltr">{timeLabel}</div>
                    <div className="dc-schedule-cell-body">
                      {taken ? (
                        <>
                          <div className="dc-schedule-cell-name">{row.patient_name}</div>
                          {(row.plan_item_name || row.pending_plan) && (
                            <div className="dc-schedule-cell-plan dc-muted text-sm">
                              {row.plan_item_name
                                ? `#${row.plan_tooth} ${row.plan_item_name}`
                                : row.pending_plan}
                            </div>
                          )}
                          <span className={`dc-badge ${row.status === 'DONE' ? 'dc-badge-emerald' : 'dc-badge-amber'}`}>
                            {t(`clinical_appt_${row.status.toLowerCase()}`)}
                          </span>
                        </>
                      ) : blocked ? (
                        <span className="dc-schedule-cell-blocked">{blockedLabel}</span>
                      ) : (
                        <span className="dc-schedule-cell-free">{t('clinical_slot_available')}</span>
                      )}
                    </div>
                    {canEditAppointments && row?.status === 'SCHEDULED' && isApptStart && (
                      <div className="dc-schedule-cell-actions" onClick={(e) => e.stopPropagation()}>
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
            )}
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
            {scheduleDoctorId && selectedScheduleRoom && (
              <p className="text-sm">
                {t('clinical_appointment_for_doctor_room', {
                  doctor: doctors.find((d) => d.id === scheduleDoctorId)?.name || '—',
                  room: localizedDisplay(selectedScheduleRoom, i18n.language, ROOM_NAME_KEYS),
                })}
              </p>
            )}
            <form onSubmit={saveAppointment} className="space-y-3">
              <div className="dc-form-row dc-schedule-filters">
                <div className="dc-form-field">
                  <label className="dc-muted text-sm">{t('clinical_schedule_doctor')}</label>
                  <select
                    value={scheduleDoctorId}
                    onChange={(e) => setScheduleDoctorId(e.target.value)}
                  >
                    <option value="">{t('clinical_select_doctor')}</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="dc-form-field">
                  <label className="dc-muted text-sm">{t('clinical_schedule_room')}</label>
                  <select
                    value={scheduleRoomId}
                    onChange={(e) => setScheduleRoomId(e.target.value)}
                  >
                    <option value="">{t('clinical_select_room')}</option>
                    {activeRooms.map((r) => (
                      <option key={r.id} value={r.id}>{localizedDisplay(r, i18n.language, ROOM_NAME_KEYS)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="dc-muted text-sm">{t('clinical_appointment_date')}</label>
              <FormattedDateInput
                value={apptDate}
                onChange={(next) => {
                  setApptDate(next);
                  setModalRange({ start: '', end: '' });
                }}
              />
              <SearchableSelect
                label={t('clinical_select_patient')}
                value={modalPatientId}
                onChange={setModalPatientId}
                options={patientSelectOptions}
                placeholder={t('clinical_search_patient')}
              />
              <label className="dc-muted text-sm">{t('clinical_appointment_time_range')}</label>
              <p className="dc-muted text-sm">{t('clinical_appointment_time_range_hint')}</p>
              {modalRange.start && (
                <p className="text-sm">
                  <strong>{t('clinical_appointment_selected_range', {
                    range: formatSlotRange(modalRange.start, modalRange.end || modalRange.start),
                  })}</strong>
                </p>
              )}
              <div className="dc-slot-grid">
                {slots.map((slot) => {
                  const state = slotAvailability(appointments, slot, scheduleDoctorId, scheduleRoomId);
                  const inRange = isSlotInModalRange(slot, modalRange.start, modalRange.end, slots);
                  const disabled = !state.available;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={disabled}
                      title={disabled && !state.match
                        ? (state.forDoctor
                          ? t('clinical_slot_doctor_busy', { room: localizedDisplay(state.forDoctor, i18n.language, ROOM_NAME_KEYS) })
                          : t('clinical_slot_room_busy', { doctor: state.forRoom?.doctor_name || '—' }))
                        : undefined}
                      className={[
                        'dc-slot',
                        disabled ? ' is-taken' : ' is-free',
                        inRange ? ' is-in-range' : '',
                        (slot === modalRange.start || slot === modalRange.end) ? ' is-selected' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => { if (state.available) pickModalSlot(slot); }}
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
              {modalPendingPlan.length > 0 && (
                <label className="dc-muted text-sm">
                  {t('clinical_appointment_plan_link')}
                  <select
                    value={modalPlanItemId}
                    onChange={(e) => setModalPlanItemId(e.target.value)}
                  >
                    <option value="">{t('clinical_appointment_plan_none')}</option>
                    {modalPendingPlan.map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.tooth} — {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {error && <div className="dc-error">{error}</div>}
              <button type="submit">
                {t('clinical_appointment_save')}
              </button>
            </form>
          </div>
        </div>
      )}

      <RoomTimelineModal
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        date={apptDate}
        onDateChange={setApptDate}
        rooms={activeRooms}
        appointments={allDayAppointments}
        slots={slots}
        loading={timelineLoading}
        canBook={canEditAppointments}
        onSelectAppointment={handleTimelineSelect}
        onBookSlot={handleTimelineBook}
      />

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
