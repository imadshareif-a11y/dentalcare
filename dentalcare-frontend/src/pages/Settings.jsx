import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useCurrencies } from '../hooks/useCurrencies';
import { DEFAULT_QUICK_ACTIONS, QUICK_ACTION_CATALOG, normalizeQuickActions } from '../lib/quickActions';
import FavoritesSettings from '../components/FavoritesSettings';
import FormatSettings from '../components/FormatSettings';
import LetterheadSettings from '../components/LetterheadSettings';
import PartyModal from '../components/PartyModal';
import Doctors from './Doctors';
import { localizedDisplay, localizedEditValue, localizedPayload } from '../lib/localizedName';
import { TOOTH_CONDITIONS, conditionLabel, inferConditionFromName } from '../lib/toothConditions';
import ClinicNumberInput from '../components/ClinicNumberInput';

function suggestConditionCode(nameEn, name) {
  const fromEn = String(nameEn || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (fromEn && /^[A-Z]/.test(fromEn)) return fromEn.slice(0, 32);
  const fromName = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (fromName && /^[A-Z]/.test(fromName)) return fromName.slice(0, 32);
  return `CUSTOM_${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
}

function codeSample(prefix, width, next) {
  const pad = Math.min(8, Math.max(1, Number(width) || 5));
  return `${prefix || ''}${String(Number(next) || 1).padStart(pad, '0')}`;
}

const PARTY_NUMBERING_SERIES = [
  { labelKey: 'settings_numbering_patients', icon: 'fa-solid fa-user-group', prefixKey: 'patientsPrefix', widthKey: 'patientsWidth', nextKey: 'patientsNext' },
  { labelKey: 'settings_numbering_suppliers', icon: 'fa-solid fa-truck', prefixKey: 'suppliersPrefix', widthKey: 'suppliersWidth', nextKey: 'suppliersNext' },
  { labelKey: 'settings_numbering_doctors', icon: 'fa-solid fa-user-doctor', prefixKey: 'doctorsPrefix', widthKey: 'doctorsWidth', nextKey: 'doctorsNext' },
  { labelKey: 'settings_numbering_employees', icon: 'fa-solid fa-id-badge', prefixKey: 'employeesPrefix', widthKey: 'employeesWidth', nextKey: 'employeesNext' },
];

const DOC_NUMBERING_SERIES = [
  { labelKey: 'settings_numbering_receipts', icon: 'fa-solid fa-hand-holding-dollar', prefixKey: 'receiptsPrefix', widthKey: 'receiptsWidth', nextKey: 'receiptsNext' },
  { labelKey: 'settings_numbering_payments', icon: 'fa-solid fa-money-bill-transfer', prefixKey: 'paymentsPrefix', widthKey: 'paymentsWidth', nextKey: 'paymentsNext' },
  { labelKey: 'settings_numbering_journal', icon: 'fa-solid fa-book', prefixKey: 'journalDocsPrefix', widthKey: 'journalDocsWidth', nextKey: 'journalDocsNext' },
  { labelKey: 'settings_numbering_bank_entries', icon: 'fa-solid fa-building-columns', prefixKey: 'bankEntriesPrefix', widthKey: 'bankEntriesWidth', nextKey: 'bankEntriesNext' },
  { labelKey: 'settings_numbering_purchase_invoices', icon: 'fa-solid fa-file-invoice', prefixKey: 'purchaseInvoicesPrefix', widthKey: 'purchaseInvoicesWidth', nextKey: 'purchaseInvoicesNext' },
  { labelKey: 'settings_numbering_credit_notes', icon: 'fa-solid fa-file-circle-plus', prefixKey: 'creditNotesPrefix', widthKey: 'creditNotesWidth', nextKey: 'creditNotesNext' },
  { labelKey: 'settings_numbering_debit_notes', icon: 'fa-solid fa-file-circle-minus', prefixKey: 'debitNotesPrefix', widthKey: 'debitNotesWidth', nextKey: 'debitNotesNext' },
];

export default function SettingsPage({ onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const { user, refreshUser, avatarUrl, bumpAvatar } = useAuth();
  const { settings, reload, isOwner, letterheadUrl, money, date } = useSettings();
  const { currencies, reload: reloadCurrencies } = useCurrencies();
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [formatForm, setFormatForm] = useState(null);
  const [numberingSection, setNumberingSection] = useState('parties');
  const [treatments, setTreatments] = useState([]);
  const [toothConditions, setToothConditions] = useState([]);
  const [treatmentForm, setTreatmentForm] = useState({ name: '', price: '', conditionCode: '', stages: [] });
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [treatmentModalBusy, setTreatmentModalBusy] = useState(false);
  const [editingTreatmentId, setEditingTreatmentId] = useState(null);
  const [conditionForm, setConditionForm] = useState({
    name: '', name_en: '', name_he: '', code: '', color: '#0284c7', is_active: true,
  });
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [conditionModalBusy, setConditionModalBusy] = useState(false);
  const [editingConditionId, setEditingConditionId] = useState(null);
  const [catalogSubTab, setCatalogSubTab] = useState('conditions');
  const [rooms, setRooms] = useState([]);
  const [newRoom, setNewRoom] = useState({ name: '' });
  const [roomAddOpen, setRoomAddOpen] = useState(false);
  const [roomAddBusy, setRoomAddBusy] = useState(false);
  const [importPatients, setImportPatients] = useState(null);
  const [importSuppliers, setImportSuppliers] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  const [quickActions, setQuickActions] = useState(DEFAULT_QUICK_ACTIONS);
  const [savingFav, setSavingFav] = useState(false);
  const [aiForm, setAiForm] = useState({
    aiEnabled: false,
    aiProvider: 'openai',
    aiApiKey: '',
    aiBaseUrl: '',
    aiVisionModel: 'gpt-4o-mini',
    clearAiApiKey: false,
  });
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [waForm, setWaForm] = useState({
    waEnabled: false,
    waProvider: 'compatible',
    waApiToken: '',
    clearWaApiToken: false,
    waPhoneNumberId: '',
    waBaseUrl: '',
    waDefaultCountry: '972',
    waTemplateAppointment: '',
    waTemplateReminder: '',
    waTemplatePayment: '',
    waTemplateBalance: '',
    waAutoAppointment: false,
    waAutoReminder: false,
    waAutoPayment: false,
  });
  const [savingWa, setSavingWa] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [waTestResult, setWaTestResult] = useState(null);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoreFile, setRestoreFile] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const AI_PROVIDER_DEFAULTS = {
    openai: { model: 'gpt-4o-mini', baseUrl: '' },
    gemini: { model: 'gemini-2.0-flash', baseUrl: '' },
    compatible: { model: 'gpt-4o-mini', baseUrl: '' },
  };

  const tabs = useMemo(() => {
    const list = [
      { id: 'account', labelKey: 'settings_tab_account', ownerOnly: false },
      { id: 'favorites', labelKey: 'settings_tab_favorites', ownerOnly: false },
    ];
    if (isOwner) {
      list.push(
        { id: 'format', labelKey: 'settings_tab_format', ownerOnly: true },
        { id: 'numbering', labelKey: 'settings_tab_numbering', ownerOnly: true },
        { id: 'letterhead', labelKey: 'settings_tab_letterhead', ownerOnly: true },
        { id: 'ai', labelKey: 'settings_tab_ai', ownerOnly: true },
        { id: 'whatsapp', labelKey: 'settings_tab_whatsapp', ownerOnly: true },
        { id: 'backup', labelKey: 'settings_tab_backup', ownerOnly: true },
        { id: 'fiscal', labelKey: 'settings_tab_fiscal', ownerOnly: true },
        { id: 'clinical-catalog', labelKey: 'settings_tab_clinical_catalog', ownerOnly: true },
        { id: 'rooms', labelKey: 'settings_tab_rooms', ownerOnly: true },
        { id: 'doctors', labelKey: 'settings_tab_doctors', ownerOnly: true },
        { id: 'import', labelKey: 'settings_tab_import', ownerOnly: true },
      );
    }
    return list;
  }, [isOwner]);

  useEffect(() => {
    if (activeTab === 'treatments') {
      setActiveTab('clinical-catalog');
      setCatalogSubTab('treatments');
    }
  }, [activeTab]);

  useEffect(() => {
    setQuickActions(normalizeQuickActions(user?.preferences?.quickActions));
  }, [user]);

  useEffect(() => {
    if (!tabs.some((tb) => tb.id === activeTab)) {
      setActiveTab(tabs[0]?.id || 'account');
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    setFormatForm({
      dateFormat: settings.dateFormat,
      baseCurrencyId: settings.baseCurrencyId || '',
      decimalPlaces: settings.decimalPlaces,
      thousandsSeparator: settings.thousandsSeparator,
      decimalSeparator: settings.decimalSeparator,
      numberDigits: settings.numberDigits || 'western',
      timeFormat: settings.timeFormat || '12h',
      printHeaderText: settings.printHeaderText,
      letterheadLayout: settings.letterheadLayout,
      patientsPrefix: settings.patientsPrefix || 'C',
      patientsWidth: settings.patientsWidth || 5,
      patientsNext: settings.patientsNext || 1,
      suppliersPrefix: settings.suppliersPrefix || 'S',
      suppliersWidth: settings.suppliersWidth || 5,
      suppliersNext: settings.suppliersNext || 1,
      doctorsPrefix: settings.doctorsPrefix || 'D',
      doctorsWidth: settings.doctorsWidth || 5,
      doctorsNext: settings.doctorsNext || 1,
      employeesPrefix: settings.employeesPrefix || 'E',
      employeesWidth: settings.employeesWidth || 5,
      employeesNext: settings.employeesNext || 1,
      receiptsPrefix: settings.receiptsPrefix || 'RC',
      receiptsWidth: settings.receiptsWidth || 5,
      receiptsNext: settings.receiptsNext || 1,
      paymentsPrefix: settings.paymentsPrefix || 'PY',
      paymentsWidth: settings.paymentsWidth || 5,
      paymentsNext: settings.paymentsNext || 1,
      journalDocsPrefix: settings.journalDocsPrefix || 'JV',
      journalDocsWidth: settings.journalDocsWidth || 5,
      journalDocsNext: settings.journalDocsNext || 1,
      bankEntriesPrefix: settings.bankEntriesPrefix || 'BE',
      bankEntriesWidth: settings.bankEntriesWidth || 5,
      bankEntriesNext: settings.bankEntriesNext || 1,
      purchaseInvoicesPrefix: settings.purchaseInvoicesPrefix || 'PI',
      purchaseInvoicesWidth: settings.purchaseInvoicesWidth || 5,
      purchaseInvoicesNext: settings.purchaseInvoicesNext || 1,
      creditNotesPrefix: settings.creditNotesPrefix || 'CN',
      creditNotesWidth: settings.creditNotesWidth || 5,
      creditNotesNext: settings.creditNotesNext || 1,
      debitNotesPrefix: settings.debitNotesPrefix || 'DN',
      debitNotesWidth: settings.debitNotesWidth || 5,
      debitNotesNext: settings.debitNotesNext || 1,
      fxGainLossAccountId: settings.fxGainLossAccountId || '',
    });
  }, [settings]);

  useEffect(() => {
    setAiForm({
      aiEnabled: Boolean(settings.aiEnabled),
      aiProvider: settings.aiProvider || 'openai',
      aiApiKey: '',
      aiBaseUrl: settings.aiBaseUrl || '',
      aiVisionModel: settings.aiVisionModel || 'gpt-4o-mini',
      clearAiApiKey: false,
    });
  }, [settings]);

  useEffect(() => {
    setWaForm({
      waEnabled: Boolean(settings.waEnabled),
      waProvider: settings.waProvider || 'compatible',
      waApiToken: '',
      clearWaApiToken: false,
      waPhoneNumberId: settings.waPhoneNumberId || '',
      waBaseUrl: settings.waBaseUrl || '',
      waDefaultCountry: settings.waDefaultCountry || '972',
      waTemplateAppointment: settings.waTemplateAppointment || '',
      waTemplateReminder: settings.waTemplateReminder || '',
      waTemplatePayment: settings.waTemplatePayment || '',
      waTemplateBalance: settings.waTemplateBalance || '',
      waAutoAppointment: Boolean(settings.waAutoAppointment),
      waAutoReminder: Boolean(settings.waAutoReminder),
      waAutoPayment: Boolean(settings.waAutoPayment),
    });
  }, [settings]);

  useEffect(() => {
    if (!isOwner) return;
    api.get('/treatments').then(setTreatments).catch(() => setTreatments([]));
    api.get('/rooms').then(setRooms).catch(() => setRooms([]));
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner || activeTab !== 'clinical-catalog') return;
    api.get('/tooth-conditions')
      .then(setToothConditions)
      .catch(() => setToothConditions([]));
  }, [isOwner, activeTab]);

  const conditionOptions = useMemo(() => {
    const rows = (toothConditions || []).filter((c) => c.is_active !== false && c.code !== 'HEALTHY');
    if (rows.length) return rows;
    return TOOTH_CONDITIONS.filter((c) => c.code !== 'HEALTHY');
  }, [toothConditions]);

  function conditionDisplayName(codeOrRow) {
    if (!codeOrRow) return t('settings_treatment_condition_none');
    if (typeof codeOrRow === 'object') {
      return conditionLabel(codeOrRow, t, i18n.language);
    }
    const found = toothConditions.find((c) => c.code === codeOrRow);
    if (found) return conditionLabel(found, t, i18n.language);
    return conditionLabel(codeOrRow, t, i18n.language);
  }

  useEffect(() => {
    if (!isOwner || (activeTab !== 'fiscal' && activeTab !== 'backup')) return;
    api.get('/settings/fiscal-years')
      .then((data) => setFiscalYears(data.years || []))
      .catch(() => setFiscalYears([]));
  }, [isOwner, activeTab]);

  async function exportClinicBackup() {
    setBackupBusy(true);
    setError(null);
    try {
      await api.download('/settings/backup/export', `clinic-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreClinicBackup(e) {
    e.preventDefault();
    if (!restoreFile) {
      setError(t('settings_backup_file_required'));
      return;
    }
    if (restoreConfirm !== 'استعادة' && restoreConfirm !== 'RESTORE') {
      setError(t('settings_backup_confirm_required'));
      return;
    }
    if (!confirm(t('settings_backup_restore_warn'))) return;
    setBackupBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', restoreFile);
      form.append('confirm', restoreConfirm);
      await api.uploadForm('/settings/backup/restore', form);
      setRestoreFile(null);
      setRestoreConfirm('');
      alert(t('settings_backup_restore_ok'));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setBackupBusy(false);
    }
  }

  async function closeFiscalYear(yearLabel) {
    if (!confirm(t('settings_fiscal_close_confirm', { year: yearLabel }))) return;
    setBackupBusy(true);
    setError(null);
    try {
      await api.post(`/settings/fiscal-years/${yearLabel}/close`);
      const data = await api.get('/settings/fiscal-years');
      setFiscalYears(data.years || []);
      alert(t('settings_fiscal_closed'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setBackupBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.patch('/auth/password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      alert(t('settings_password_success'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await api.upload('/auth/avatar', file);
      await refreshUser();
      bumpAvatar();
      alert(t('settings_avatar_uploaded'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
    e.target.value = '';
  }

  async function removeAvatar() {
    if (!confirm(t('settings_avatar_remove_confirm'))) return;
    setError(null);
    try {
      await api.delete('/auth/avatar');
      await refreshUser();
      bumpAvatar();
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function saveFavorites(e) {
    e.preventDefault();
    setSavingFav(true);
    setError(null);
    try {
      const ids = normalizeQuickActions(quickActions);
      await api.patch('/auth/preferences', { quickActions: ids });
      await refreshUser();
      setQuickActions(ids);
      alert(t('settings_favorites_saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setSavingFav(false);
    }
  }

  const level = (key) => user?.permissions?.[key] || 'none';
  const availableQuickActions = QUICK_ACTION_CATALOG.filter((a) => a.can(level));

  async function saveFormat(e) {
    e?.preventDefault?.();
    setSaving(true);
    setError(null);
    try {
      await api.patch('/settings', formatForm);
      await reload();
      await reloadCurrencies();
      alert(t('settings_saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLetterhead(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.upload('/settings/letterhead', file);
      await reload();
      alert(t('settings_letterhead_uploaded'));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
    e.target.value = '';
  }

  async function removeLetterhead() {
    if (!confirm(t('settings_letterhead_remove_confirm'))) return;
    try {
      await api.delete('/settings/letterhead');
      await reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function saveAiSettings(e) {
    e.preventDefault();
    setSavingAi(true);
    setError(null);
    setAiTestResult(null);
    try {
      await api.patch('/settings/ai', {
        aiEnabled: aiForm.aiEnabled,
        aiProvider: aiForm.aiProvider,
        aiBaseUrl: aiForm.aiBaseUrl.trim() || null,
        aiVisionModel: aiForm.aiVisionModel.trim()
          || (AI_PROVIDER_DEFAULTS[aiForm.aiProvider] || AI_PROVIDER_DEFAULTS.openai).model,
        ...(aiForm.clearAiApiKey
          ? { clearAiApiKey: true }
          : (aiForm.aiApiKey.trim() ? { aiApiKey: aiForm.aiApiKey.trim() } : {})),
      });
      setAiForm((p) => ({ ...p, aiApiKey: '', clearAiApiKey: false }));
      await reload();
      alert(t('settings_ai_saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setSavingAi(false);
    }
  }

  async function testAiConnection() {
    setTestingAi(true);
    setError(null);
    setAiTestResult(null);
    try {
      const result = await api.post('/settings/ai/test', {
        aiProvider: aiForm.aiProvider,
        aiBaseUrl: aiForm.aiBaseUrl.trim() || null,
        aiVisionModel: aiForm.aiVisionModel.trim() || null,
        ...(aiForm.aiApiKey.trim() && !aiForm.clearAiApiKey
          ? { aiApiKey: aiForm.aiApiKey.trim() }
          : {}),
      });
      setAiTestResult({
        ok: true,
        message: t('settings_ai_test_ok', { model: result.model || '—' }),
      });
    } catch (err) {
      setAiTestResult({
        ok: false,
        message: t('settings_ai_test_fail', {
          detail: err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'),
        }),
      });
    } finally {
      setTestingAi(false);
    }
  }

  async function saveWaSettings(e) {
    e.preventDefault();
    setSavingWa(true);
    setError(null);
    setWaTestResult(null);
    try {
      await api.patch('/settings/whatsapp', {
        waEnabled: waForm.waEnabled,
        waProvider: waForm.waProvider,
        waPhoneNumberId: waForm.waPhoneNumberId.trim() || null,
        waBaseUrl: waForm.waBaseUrl.trim() || null,
        waDefaultCountry: waForm.waDefaultCountry.trim() || '972',
        waTemplateAppointment: waForm.waTemplateAppointment.trim() || null,
        waTemplateReminder: waForm.waTemplateReminder.trim() || null,
        waTemplatePayment: waForm.waTemplatePayment.trim() || null,
        waTemplateBalance: waForm.waTemplateBalance.trim() || null,
        waAutoAppointment: waForm.waAutoAppointment,
        waAutoReminder: waForm.waAutoReminder,
        waAutoPayment: waForm.waAutoPayment,
        ...(waForm.clearWaApiToken
          ? { clearWaApiToken: true }
          : (waForm.waApiToken.trim() ? { waApiToken: waForm.waApiToken.trim() } : {})),
      });
      setWaForm((p) => ({ ...p, waApiToken: '', clearWaApiToken: false }));
      await reload();
      alert(t('settings_wa_saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setSavingWa(false);
    }
  }

  async function testWaConnection() {
    setTestingWa(true);
    setError(null);
    setWaTestResult(null);
    try {
      const result = await api.post('/settings/whatsapp/test', {
        waProvider: waForm.waProvider,
        waPhoneNumberId: waForm.waPhoneNumberId.trim() || null,
        waBaseUrl: waForm.waBaseUrl.trim() || null,
        waDefaultCountry: waForm.waDefaultCountry.trim() || null,
        ...(waForm.waApiToken.trim() && !waForm.clearWaApiToken
          ? { waApiToken: waForm.waApiToken.trim() }
          : {}),
      });
      setWaTestResult({
        ok: true,
        message: t('settings_wa_test_ok', {
          detail: result.displayPhone || result.provider || '—',
        }),
      });
    } catch (err) {
      setWaTestResult({
        ok: false,
        message: t('settings_wa_test_fail', {
          detail: err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'),
        }),
      });
    } finally {
      setTestingWa(false);
    }
  }

  function openTreatmentAddModal() {
    setEditingTreatmentId(null);
    setTreatmentForm({ name: '', price: '', conditionCode: '', stages: [] });
    setTreatmentModalOpen(true);
  }

  function openTreatmentEditModal(item) {
    setEditingTreatmentId(item.id);
    setTreatmentForm({
      name: item.name || '',
      price: item.price != null ? String(item.price) : '',
      conditionCode: item.condition_code || '',
      stages: (item.stages || []).map((s, i) => ({
        id: s.id || `stage-${i}`,
        name: s.name || '',
        isOptional: Boolean(s.isOptional),
      })),
    });
    setTreatmentModalOpen(true);
  }

  function closeTreatmentModal() {
    setTreatmentModalOpen(false);
    setEditingTreatmentId(null);
    setTreatmentForm({ name: '', price: '', conditionCode: '', stages: [] });
  }

  function updateTreatmentStage(index, patch) {
    setTreatmentForm((prev) => {
      const stages = [...(prev.stages || [])];
      stages[index] = { ...stages[index], ...patch };
      return { ...prev, stages };
    });
  }

  async function submitTreatment(e) {
    e.preventDefault();
    setTreatmentModalBusy(true);
    try {
      const stagesPayload = (treatmentForm.stages || [])
        .filter((s) => String(s.name || '').trim())
        .map((s, i) => ({
          name: String(s.name).trim(),
          sortOrder: i,
          isOptional: Boolean(s.isOptional),
        }));
      const body = {
        name: treatmentForm.name,
        price: Number(treatmentForm.price),
        conditionCode: treatmentForm.conditionCode || null,
        stages: stagesPayload,
      };
      if (editingTreatmentId) {
        const updated = await api.patch(`/treatments/${editingTreatmentId}`, body);
        setTreatments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await api.post('/treatments', {
          ...body,
          sortOrder: treatments.length + 1,
          conditionCode: treatmentForm.conditionCode
            || inferConditionFromName(treatmentForm.name)
            || undefined,
        });
        setTreatments((prev) => [...prev, created]);
      }
      closeTreatmentModal();
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setTreatmentModalBusy(false);
    }
  }

  async function removeTreatment(id) {
    if (!confirm(t('settings_treatment_delete_confirm'))) return;
    try {
      await api.delete(`/treatments/${id}`);
      setTreatments((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  function openConditionAddModal() {
    setEditingConditionId(null);
    setConditionForm({ name: '', name_en: '', name_he: '', code: '', color: '#0284c7', is_active: true });
    setConditionModalOpen(true);
  }

  function openConditionEditModal(item) {
    setEditingConditionId(item.id);
    setConditionForm({
      name: item.name || '',
      name_en: item.name_en || '',
      name_he: item.name_he || '',
      code: item.code || '',
      color: item.color || '#0284c7',
      is_active: item.is_active !== false,
      is_system: Boolean(item.is_system),
    });
    setConditionModalOpen(true);
  }

  function closeConditionModal() {
    setConditionModalOpen(false);
    setEditingConditionId(null);
    setConditionForm({ name: '', name_en: '', name_he: '', code: '', color: '#0284c7', is_active: true });
  }

  async function submitToothCondition(e) {
    e.preventDefault();
    setConditionModalBusy(true);
    try {
      if (editingConditionId) {
        const updated = await api.patch(`/tooth-conditions/${editingConditionId}`, {
          name: conditionForm.name,
          name_en: conditionForm.name_en || null,
          name_he: conditionForm.name_he || null,
          color: conditionForm.color || null,
          isActive: conditionForm.is_active !== false,
        });
        setToothConditions((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await api.post('/tooth-conditions', {
          name: conditionForm.name,
          name_en: conditionForm.name_en || undefined,
          name_he: conditionForm.name_he || undefined,
          code: conditionForm.code || suggestConditionCode(conditionForm.name_en, conditionForm.name),
          color: conditionForm.color || '#0284c7',
          sortOrder: toothConditions.length * 10 + 200,
        });
        setToothConditions((prev) => [...prev, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      }
      closeConditionModal();
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setConditionModalBusy(false);
    }
  }

  async function removeToothCondition(item) {
    if (item.is_system) {
      alert(t('settings_condition_system_no_delete'));
      return;
    }
    if (!confirm(t('settings_condition_delete_confirm'))) return;
    try {
      await api.delete(`/tooth-conditions/${item.id}`);
      setToothConditions((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  function openRoomAddModal() {
    setNewRoom({ name: '' });
    setRoomAddOpen(true);
  }

  function closeRoomAddModal() {
    setRoomAddOpen(false);
    setNewRoom({ name: '' });
  }

  async function addRoom(e) {
    e.preventDefault();
    setRoomAddBusy(true);
    try {
      const created = await api.post('/rooms', {
        ...localizedPayload(newRoom.name, i18n.language),
        sortOrder: rooms.length + 1,
      });
      setRooms((prev) => [...prev, created]);
      closeRoomAddModal();
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    } finally {
      setRoomAddBusy(false);
    }
  }

  async function saveRoom(item) {
    try {
      const updated = await api.patch(`/rooms/${item.id}`, {
        ...localizedPayload(item._editName ?? localizedEditValue(item, i18n.language), i18n.language),
        isActive: item.is_active,
      });
      setRooms((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function removeRoom(id) {
    if (!confirm(t('settings_room_delete_confirm'))) return;
    try {
      await api.delete(`/rooms/${id}`);
      setRooms((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function downloadPatientsTemplate() {
    try {
      await api.download('/settings/excel-template/patients', 'ذمم-مدينة-زبائن.xlsx');
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function downloadSuppliersTemplate() {
    try {
      await api.download('/settings/excel-template/suppliers', 'ذمم-دائنة-موردين.xlsx');
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function importPatientsFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportPatients(null);
    try {
      const result = await api.upload('/settings/import-patients', file);
      setImportPatients(result);
      alert(t('settings_import_success'));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
    e.target.value = '';
  }

  async function importSuppliersFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSuppliers(null);
    try {
      const result = await api.upload('/settings/import-suppliers', file);
      setImportSuppliers(result);
      alert(t('settings_import_success'));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
    e.target.value = '';
  }

  function numberingSeriesCard({ labelKey, icon, prefixKey, widthKey, nextKey }) {
    const prefix = formatForm[prefixKey];
    const width = formatForm[widthKey];
    const next = formatForm[nextKey];
    const sample = codeSample(prefix, width, next);
    const pad = Math.min(8, Math.max(1, Number(width) || 5));
    const padded = String(Number(next) || 1).padStart(pad, '0');

    return (
      <article key={prefixKey} className="dc-numbering-card">
        <header className="dc-numbering-card-head">
          <span className="dc-numbering-card-icon" aria-hidden="true">
            <i className={icon} />
          </span>
          <div className="dc-numbering-card-title">
            <h5>{t(labelKey)}</h5>
            <div className="dc-numbering-formula" aria-label={t('settings_numbering_formula_label')}>
              <span className="dc-numbering-part dc-numbering-part-prefix">{prefix || '—'}</span>
              <span className="dc-numbering-part dc-numbering-part-seq">{padded}</span>
            </div>
          </div>
          <output className="dc-numbering-preview" htmlFor={`${prefixKey}-fields`}>
            {sample}
          </output>
        </header>
        <div className="dc-numbering-fields" id={`${prefixKey}-fields`}>
          <label>
            <span>{t('settings_prefix')}</span>
            <input
              value={prefix}
              maxLength={10}
              onChange={(e) => setFormatForm((p) => ({ ...p, [prefixKey]: e.target.value }))}
            />
          </label>
          <label>
            <span>{t('settings_width')}</span>
            <input
              type="number"
              min="1"
              max="8"
              value={width}
              onChange={(e) => setFormatForm((p) => ({ ...p, [widthKey]: Number(e.target.value) }))}
            />
          </label>
          <label>
            <span>{t('settings_next')}</span>
            <input
              type="number"
              min="1"
              value={next}
              onChange={(e) => setFormatForm((p) => ({ ...p, [nextKey]: Number(e.target.value) }))}
            />
          </label>
        </div>
      </article>
    );
  }

  return (
    <div className="dc-settings space-y-4">
      <h3>{t('nav_settings')}</h3>

      <nav className="dc-subnav dc-settings-tabs" style={{ padding: 0 }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={`dc-chip${activeTab === tb.id ? ' is-active' : ''}`}
            onClick={() => { setActiveTab(tb.id); setError(null); }}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </nav>

      {error && <div className="dc-error">{error}</div>}

      {activeTab === 'account' && (
        <section className="dc-settings-panel">
          <h4>{t('settings_avatar_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_avatar_hint')}</p>
          <div className="dc-account-avatar-block">
            <div className="dc-account-avatar-preview" aria-hidden="true">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="dc-account-avatar-img" />
              ) : (
                <span className="dc-account-avatar-fallback">
                  {(user?.name || user?.username || '?').slice(0, 1)}
                </span>
              )}
            </div>
            <div className="dc-account-avatar-meta">
              <strong>{user?.name}</strong>
              <span className="dc-muted">@{user?.username}</span>
            </div>
            <div className="dc-letterhead-file-actions">
              <label className="dc-letterhead-upload">
                <i className="fa-solid fa-camera" />
                <span>
                  {user?.hasAvatar
                    ? t('settings_avatar_replace')
                    : t('settings_avatar_upload')}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="dc-sr-only"
                  onChange={uploadAvatar}
                />
              </label>
              {user?.hasAvatar && (
                <button type="button" className="dc-danger" onClick={removeAvatar}>
                  {t('settings_avatar_remove')}
                </button>
              )}
            </div>
          </div>

          <h4 style={{ marginTop: 28 }}>{t('settings_password_title')}</h4>
          <form onSubmit={changePassword} className="dc-settings-form">
            <input
              type="password"
              required
              placeholder={t('settings_current_password')}
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder={t('user_password_hint')}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
            />
            <button type="submit">{t('settings_password_save')}</button>
          </form>
        </section>
      )}

      {activeTab === 'favorites' && (
        <section className="dc-settings-panel dc-fav-settings-panel">
          <h4>{t('settings_favorites_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_favorites_hint')}</p>
          {availableQuickActions.length === 0 ? (
            <div className="dc-muted">{t('favorites_empty')}</div>
          ) : (
            <FavoritesSettings
              quickActions={quickActions}
              onChange={setQuickActions}
              availableActions={availableQuickActions}
              permissions={user?.permissions}
              onSave={saveFavorites}
              saving={savingFav}
            />
          )}
        </section>
      )}

      {activeTab === 'format' && isOwner && formatForm && (
        <FormatSettings
          formatForm={formatForm}
          setFormatForm={setFormatForm}
          dateFormats={settings.dateFormats || []}
          currencies={currencies}
          onSave={saveFormat}
          saving={saving}
          locale={i18n.language}
        />
      )}

      {activeTab === 'numbering' && isOwner && formatForm && (
        <section className="dc-settings-panel dc-numbering-panel">
          <div className="dc-numbering-intro">
            <h4>{t('settings_numbering_title')}</h4>
            <p className="dc-muted text-sm">{t('settings_numbering_hint')}</p>
            <div className="dc-numbering-formula-banner">
              <span className="dc-numbering-formula-banner-label">{t('settings_numbering_formula_label')}</span>
              <code className="dc-numbering-formula-banner-code">{t('settings_numbering_formula_example')}</code>
            </div>
          </div>

          <div className="dc-numbering-section-tabs" role="tablist" aria-label={t('settings_numbering_title')}>
            <button
              type="button"
              role="tab"
              aria-selected={numberingSection === 'parties'}
              className={`dc-numbering-section-tab${numberingSection === 'parties' ? ' is-active' : ''}`}
              onClick={() => setNumberingSection('parties')}
            >
              <i className="fa-solid fa-address-book" aria-hidden="true" />
              <span>{t('settings_numbering_section_parties')}</span>
              <span className="dc-numbering-section-count">{PARTY_NUMBERING_SERIES.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={numberingSection === 'documents'}
              className={`dc-numbering-section-tab${numberingSection === 'documents' ? ' is-active' : ''}`}
              onClick={() => setNumberingSection('documents')}
            >
              <i className="fa-solid fa-file-lines" aria-hidden="true" />
              <span>{t('settings_numbering_section_documents')}</span>
              <span className="dc-numbering-section-count">{DOC_NUMBERING_SERIES.length}</span>
            </button>
          </div>

          <form onSubmit={saveFormat} className="dc-numbering-form">
            <p className="dc-muted text-sm dc-numbering-section-hint">
              {numberingSection === 'parties'
                ? t('settings_numbering_parties_hint')
                : t('settings_numbering_docs_hint')}
            </p>
            <div className="dc-numbering-grid" role="tabpanel">
              {(numberingSection === 'parties' ? PARTY_NUMBERING_SERIES : DOC_NUMBERING_SERIES)
                .map((series) => numberingSeriesCard(series))}
            </div>
            <div className="dc-numbering-form-footer">
              <button type="submit" disabled={saving}>{t('settings_save_numbering')}</button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'letterhead' && isOwner && formatForm && (
        <LetterheadSettings
          headerText={formatForm.printHeaderText || ''}
          onHeaderTextChange={(text) => setFormatForm((p) => ({ ...p, printHeaderText: text }))}
          letterheadLayout={formatForm.letterheadLayout}
          onLayoutChange={(letterheadLayout) => setFormatForm((p) => ({ ...p, letterheadLayout }))}
          onSave={saveFormat}
          saving={saving}
          hasLetterhead={settings.hasLetterhead}
          letterheadUrl={letterheadUrl}
          letterheadMime={settings.letterheadMime}
          onUpload={uploadLetterhead}
          onRemove={removeLetterhead}
          formatMoney={money}
          formatDate={date}
          clinicName={user?.clinicName || user?.name || ''}
        />
      )}

      {activeTab === 'ai' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_ai_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_ai_hint')}</p>
          <p className="dc-clinical-ai-disclaimer">{t('clinical_ai_disclaimer')}</p>
          <p className="dc-ai-privacy-note">{t('settings_ai_privacy_note')}</p>

          <form onSubmit={saveAiSettings} className="dc-settings-form" style={{ maxWidth: 640 }}>
            <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={aiForm.aiEnabled}
                onChange={(e) => setAiForm((p) => ({ ...p, aiEnabled: e.target.checked }))}
              />
              {t('settings_ai_enable')}
            </label>

            <label>
              {t('settings_ai_provider')}
              <select
                value={aiForm.aiProvider}
                onChange={(e) => {
                  const next = e.target.value;
                  const defaults = AI_PROVIDER_DEFAULTS[next] || AI_PROVIDER_DEFAULTS.openai;
                  setAiForm((p) => ({
                    ...p,
                    aiProvider: next,
                    aiVisionModel: defaults.model,
                    aiBaseUrl: next === 'compatible' ? p.aiBaseUrl : '',
                  }));
                }}
              >
                <option value="openai">{t('settings_ai_provider_openai')}</option>
                <option value="gemini">{t('settings_ai_provider_gemini')}</option>
                <option value="compatible">{t('settings_ai_provider_compatible')}</option>
              </select>
            </label>

            <div className="dc-ai-provider-help">
              <strong>{t(`settings_ai_help_${aiForm.aiProvider}_title`)}</strong>
              <p>{t(`settings_ai_help_${aiForm.aiProvider}_body`)}</p>
              <ul>
                <li>{t(`settings_ai_help_${aiForm.aiProvider}_need_key`)}</li>
                <li>{t(`settings_ai_help_${aiForm.aiProvider}_need_model`)}</li>
                {aiForm.aiProvider === 'compatible' && (
                  <li>{t('settings_ai_help_compatible_need_url')}</li>
                )}
              </ul>
            </div>

            <fieldset className="dc-ai-link-box" disabled={!aiForm.aiEnabled}>
              <legend>{t('settings_ai_link_title')}</legend>

              <label>
                {t('settings_ai_api_key')}
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    settings.hasAiApiKey
                      ? t('settings_ai_api_key_kept', { hint: settings.aiApiKeyHint || '••••' })
                      : t(`settings_ai_api_key_placeholder_${aiForm.aiProvider}`)
                  }
                  value={aiForm.aiApiKey}
                  onChange={(e) => setAiForm((p) => ({
                    ...p,
                    aiApiKey: e.target.value,
                    clearAiApiKey: false,
                  }))}
                  disabled={aiForm.clearAiApiKey}
                />
              </label>
              {settings.hasAiApiKey && (
                <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={aiForm.clearAiApiKey}
                    onChange={(e) => setAiForm((p) => ({
                      ...p,
                      clearAiApiKey: e.target.checked,
                      aiApiKey: e.target.checked ? '' : p.aiApiKey,
                    }))}
                  />
                  {t('settings_ai_clear_key')}
                </label>
              )}

              <label>
                {t('settings_ai_model')}
                <input
                  type="text"
                  value={aiForm.aiVisionModel}
                  onChange={(e) => setAiForm((p) => ({ ...p, aiVisionModel: e.target.value }))}
                  placeholder={AI_PROVIDER_DEFAULTS[aiForm.aiProvider]?.model || 'gpt-4o-mini'}
                />
              </label>
              <p className="dc-muted text-sm">{t(`settings_ai_model_hint_${aiForm.aiProvider}`)}</p>

              {(aiForm.aiProvider === 'compatible' || aiForm.aiProvider === 'openai') && (
                <>
                  <label>
                    {t('settings_ai_base_url')}
                    <input
                      type="url"
                      value={aiForm.aiBaseUrl}
                      onChange={(e) => setAiForm((p) => ({ ...p, aiBaseUrl: e.target.value }))}
                      placeholder={
                        aiForm.aiProvider === 'compatible'
                          ? 'https://your-proxy.example/v1'
                          : 'https://api.openai.com/v1'
                      }
                      required={aiForm.aiProvider === 'compatible' && aiForm.aiEnabled}
                    />
                  </label>
                  <p className="dc-muted text-sm">
                    {t(aiForm.aiProvider === 'compatible'
                      ? 'settings_ai_base_url_hint_compatible'
                      : 'settings_ai_base_url_hint')}
                  </p>
                </>
              )}
            </fieldset>

            <div className="dc-muted text-sm">
              {(() => {
                const draftReady = aiForm.aiEnabled
                  && !aiForm.clearAiApiKey
                  && (settings.hasAiApiKey || aiForm.aiApiKey.trim())
                  && (aiForm.aiProvider !== 'compatible'
                    || aiForm.aiBaseUrl.trim()
                    || settings.aiBaseUrl);
                const ready = settings.aiReady || draftReady || (aiTestResult?.ok && aiForm.aiEnabled);
                return ready ? t('settings_ai_status_ready') : t('settings_ai_status_off');
              })()}
            </div>

            {aiTestResult && (
              <div className={aiTestResult.ok ? 'dc-ai-test-ok' : 'dc-error'}>
                {aiTestResult.message}
              </div>
            )}

            <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" disabled={savingAi || testingAi}>
                {savingAi ? t('ledger_loading') : t('settings_ai_save')}
              </button>
              <button
                type="button"
                className="dc-ghost"
                disabled={savingAi || testingAi || !aiForm.aiEnabled}
                onClick={testAiConnection}
              >
                {testingAi ? t('settings_ai_testing') : t('settings_ai_test')}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'whatsapp' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_wa_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_wa_hint')}</p>
          <p className="dc-muted text-sm">{t('settings_wa_phone_note')}</p>

          <form onSubmit={saveWaSettings} className="dc-settings-form" style={{ maxWidth: 640 }}>
            <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={waForm.waEnabled}
                onChange={(e) => setWaForm((p) => ({ ...p, waEnabled: e.target.checked }))}
              />
              {t('settings_wa_enable')}
            </label>

            <label>
              {t('settings_wa_provider')}
              <select
                value={waForm.waProvider}
                onChange={(e) => setWaForm((p) => ({ ...p, waProvider: e.target.value }))}
              >
                <option value="meta">{t('settings_wa_provider_meta')}</option>
                <option value="compatible">{t('settings_wa_provider_compatible')}</option>
              </select>
            </label>

            <div className="dc-ai-provider-help">
              <strong>{t(`settings_wa_help_${waForm.waProvider}_title`)}</strong>
              <p>{t(`settings_wa_help_${waForm.waProvider}_body`)}</p>
            </div>

            <fieldset className="dc-ai-link-box" disabled={!waForm.waEnabled}>
              <legend>{t('settings_wa_link_title')}</legend>

              <label>
                {t('settings_wa_api_token')}
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    settings.hasWaApiToken
                      ? t('settings_wa_api_token_kept', { hint: settings.waApiTokenHint || '••••' })
                      : t('settings_wa_api_token_placeholder')
                  }
                  value={waForm.waApiToken}
                  onChange={(e) => setWaForm((p) => ({
                    ...p,
                    waApiToken: e.target.value,
                    clearWaApiToken: false,
                  }))}
                  disabled={waForm.clearWaApiToken}
                />
              </label>
              {settings.hasWaApiToken && (
                <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={waForm.clearWaApiToken}
                    onChange={(e) => setWaForm((p) => ({
                      ...p,
                      clearWaApiToken: e.target.checked,
                      waApiToken: e.target.checked ? '' : p.waApiToken,
                    }))}
                  />
                  {t('settings_wa_clear_token')}
                </label>
              )}

              {waForm.waProvider === 'meta' && (
                <label>
                  {t('settings_wa_phone_number_id')}
                  <input
                    type="text"
                    value={waForm.waPhoneNumberId}
                    onChange={(e) => setWaForm((p) => ({ ...p, waPhoneNumberId: e.target.value }))}
                    required={waForm.waEnabled}
                  />
                </label>
              )}

              <label>
                {t('settings_wa_base_url')}
                <input
                  type="url"
                  value={waForm.waBaseUrl}
                  onChange={(e) => setWaForm((p) => ({ ...p, waBaseUrl: e.target.value }))}
                  placeholder={waForm.waProvider === 'meta'
                    ? 'https://graph.facebook.com/v21.0'
                    : 'https://api.ultramsg.com/instanceXXXX'}
                  required={waForm.waProvider === 'compatible' && waForm.waEnabled}
                />
              </label>

              <label>
                {t('settings_wa_default_country')}
                <select
                  value={waForm.waDefaultCountry === '970' ? '970' : '972'}
                  onChange={(e) => setWaForm((p) => ({ ...p, waDefaultCountry: e.target.value }))}
                >
                  <option value="972">{t('settings_wa_cc_il')}</option>
                  <option value="970">{t('settings_wa_cc_ps')}</option>
                </select>
              </label>
              <p className="dc-muted text-sm">{t('settings_wa_cc_hint')}</p>

              {waForm.waProvider === 'meta' && (
                <>
                  <label>
                    {t('settings_wa_template_appointment')}
                    <input
                      type="text"
                      value={waForm.waTemplateAppointment}
                      onChange={(e) => setWaForm((p) => ({ ...p, waTemplateAppointment: e.target.value }))}
                    />
                  </label>
                  <label>
                    {t('settings_wa_template_reminder')}
                    <input
                      type="text"
                      value={waForm.waTemplateReminder}
                      onChange={(e) => setWaForm((p) => ({ ...p, waTemplateReminder: e.target.value }))}
                    />
                  </label>
                  <label>
                    {t('settings_wa_template_payment')}
                    <input
                      type="text"
                      value={waForm.waTemplatePayment}
                      onChange={(e) => setWaForm((p) => ({ ...p, waTemplatePayment: e.target.value }))}
                    />
                  </label>
                  <label>
                    {t('settings_wa_template_balance')}
                    <input
                      type="text"
                      value={waForm.waTemplateBalance}
                      onChange={(e) => setWaForm((p) => ({ ...p, waTemplateBalance: e.target.value }))}
                    />
                  </label>
                </>
              )}
            </fieldset>

            <fieldset className="dc-ai-link-box" disabled={!waForm.waEnabled}>
              <legend>{t('settings_wa_auto_title')}</legend>
              <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={waForm.waAutoAppointment}
                  onChange={(e) => setWaForm((p) => ({ ...p, waAutoAppointment: e.target.checked }))}
                />
                {t('settings_wa_auto_appointment')}
              </label>
              <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={waForm.waAutoReminder}
                  onChange={(e) => setWaForm((p) => ({ ...p, waAutoReminder: e.target.checked }))}
                />
                {t('settings_wa_auto_reminder')}
              </label>
              <label className="dc-check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={waForm.waAutoPayment}
                  onChange={(e) => setWaForm((p) => ({ ...p, waAutoPayment: e.target.checked }))}
                />
                {t('settings_wa_auto_payment')}
              </label>
            </fieldset>

            <div className="dc-muted text-sm">
              {waForm.waEnabled && (settings.hasWaApiToken || waForm.waApiToken.trim())
                && (waForm.waProvider !== 'compatible' || waForm.waBaseUrl.trim() || settings.waBaseUrl)
                && (waForm.waProvider !== 'meta' || waForm.waPhoneNumberId.trim() || settings.waPhoneNumberId)
                ? t('settings_wa_status_ready')
                : t('settings_wa_status_off')}
            </div>

            {waTestResult && (
              <div className={waTestResult.ok ? 'dc-ai-test-ok' : 'dc-error'}>
                {waTestResult.message}
              </div>
            )}

            <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" disabled={savingWa || testingWa}>
                {savingWa ? t('ledger_loading') : t('settings_wa_save')}
              </button>
              <button
                type="button"
                className="dc-ghost"
                disabled={savingWa || testingWa || !waForm.waEnabled}
                onClick={testWaConnection}
              >
                {testingWa ? t('settings_wa_testing') : t('settings_wa_test')}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'backup' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_backup_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_backup_hint')}</p>
          <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
            <button type="button" className="dc-success" disabled={backupBusy} onClick={exportClinicBackup}>
              {backupBusy ? t('ledger_loading') : t('settings_backup_export')}
            </button>
          </div>
          <form onSubmit={restoreClinicBackup} className="dc-settings-form" style={{ maxWidth: 520 }}>
            <h4>{t('settings_backup_restore_title')}</h4>
            <p className="dc-error text-sm">{t('settings_backup_restore_warn')}</p>
            <label>
              {t('settings_backup_file')}
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              />
            </label>
            <label>
              {t('settings_backup_confirm_label')}
              <input
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder={t('settings_backup_confirm_placeholder')}
              />
            </label>
            <button type="submit" className="dc-danger" disabled={backupBusy}>
              {backupBusy ? t('ledger_loading') : t('settings_backup_restore')}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'fiscal' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_fiscal_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_fiscal_hint')}</p>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('settings_fiscal_year')}</th>
                <th>{t('settings_fiscal_range')}</th>
                <th>{t('settings_fiscal_status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fiscalYears.map((y) => (
                <tr key={y.id || y.yearLabel}>
                  <td>{y.yearLabel}</td>
                  <td>{String(y.startsOn).slice(0, 10)} — {String(y.endsOn).slice(0, 10)}</td>
                  <td>
                    {y.status === 'CLOSED'
                      ? t('settings_fiscal_status_closed')
                      : t('settings_fiscal_status_open')}
                  </td>
                  <td>
                    {y.status === 'OPEN' && (
                      <button type="button" disabled={backupBusy} onClick={() => closeFiscalYear(y.yearLabel)}>
                        {t('settings_fiscal_close')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {fiscalYears.length === 0 && (
                <tr><td colSpan={4} className="dc-muted">{t('settings_fiscal_empty')}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === 'clinical-catalog' && isOwner && (
        <section className="dc-settings-panel">
          <div className="dc-party-head">
            <div>
              <h4>{t('settings_tab_clinical_catalog')}</h4>
              <p className="dc-muted text-sm">{t('settings_clinical_catalog_hint')}</p>
            </div>
          </div>

          <nav className="dc-subnav dc-settings-subtabs" style={{ padding: 0, marginBottom: 8 }}>
            <button
              type="button"
              className={`dc-chip${catalogSubTab === 'conditions' ? ' is-active' : ''}`}
              onClick={() => setCatalogSubTab('conditions')}
            >
              {t('settings_subtab_conditions')}
            </button>
            <button
              type="button"
              className={`dc-chip${catalogSubTab === 'treatments' ? ' is-active' : ''}`}
              onClick={() => setCatalogSubTab('treatments')}
            >
              {t('settings_subtab_treatments')}
            </button>
          </nav>

          {catalogSubTab === 'conditions' && (
            <>
              <div className="dc-catalog-subhead">
                <p className="dc-muted text-sm">{t('settings_conditions_hint')}</p>
                <button type="button" onClick={openConditionAddModal}>
                  <i className="fa-solid fa-plus" /> {t('settings_condition_add')}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>{t('settings_condition_name')}</th>
                    <th>{t('settings_condition_code')}</th>
                    <th>{t('settings_condition_color')}</th>
                    <th>{t('settings_condition_active')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {toothConditions.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.is_system ? (
                          <span className="dc-muted text-sm"> · {t('settings_condition_system')}</span>
                        ) : null}
                      </td>
                      <td><code className="dc-num">{item.code}</code></td>
                      <td>
                        <span
                          className="dc-condition-color-swatch"
                          style={{ background: item.color || '#0284c7' }}
                          title={item.color || ''}
                        />
                      </td>
                      <td>{item.is_active !== false ? t('settings_condition_active') : t('settings_condition_inactive')}</td>
                      <td>
                        <button type="button" onClick={() => openConditionEditModal(item)}>{t('party_edit')}</button>
                        {!item.is_system && (
                          <button type="button" className="dc-danger" onClick={() => removeToothCondition(item)}>
                            {t('platform_delete')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {toothConditions.length === 0 && (
                    <tr><td colSpan={5} className="dc-muted">{t('settings_conditions_empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {catalogSubTab === 'treatments' && (
            <>
              <div className="dc-catalog-subhead">
                <p className="dc-muted text-sm">{t('settings_treatments_hint')}</p>
                <button type="button" onClick={openTreatmentAddModal}>
                  <i className="fa-solid fa-plus" /> {t('settings_treatment_add')}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>{t('clinical_treatment_name')}</th>
                    <th>{t('clinical_treatment_cost')}</th>
                    <th>{t('settings_treatment_condition')}</th>
                    <th>{t('settings_treatment_stages')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td className="dc-money">{money(item.price)}</td>
                      <td>{item.condition_code ? conditionDisplayName(item.condition_code) : t('settings_treatment_condition_none')}</td>
                      <td>
                        {(item.stages || []).length > 0
                          ? `${item.stages.length} — ${item.stages.map((s) => s.name).join(' · ')}`
                          : '—'}
                      </td>
                      <td>
                        <button type="button" onClick={() => openTreatmentEditModal(item)}>{t('party_edit')}</button>
                        <button type="button" className="dc-danger" onClick={() => removeTreatment(item.id)}>{t('platform_delete')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {activeTab === 'rooms' && isOwner && (
        <section className="dc-settings-panel">
          <div className="dc-party-head">
            <div>
              <h4>{t('settings_rooms_title')}</h4>
              <p className="dc-muted text-sm">{t('settings_rooms_hint')}</p>
            </div>
            <button type="button" onClick={openRoomAddModal}>
              <i className="fa-solid fa-plus" /> {t('settings_room_add')}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('settings_room_name')}</th>
                <th>{t('settings_room_active')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      value={item._editName ?? localizedEditValue(item, i18n.language)}
                      onChange={(e) => setRooms((prev) => prev.map((x) => (
                        x.id === item.id ? { ...x, _editName: e.target.value } : x
                      )))}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.is_active !== false}
                      onChange={(e) => setRooms((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_active: e.target.checked } : x)))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => saveRoom(item)}>{t('platform_save')}</button>
                    <button type="button" className="dc-danger" onClick={() => removeRoom(item.id)}>{t('platform_delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === 'doctors' && isOwner && (
        <section className="dc-settings-panel space-y-3">
          <div>
            <h4>{t('settings_doctors_title')}</h4>
            <p className="dc-muted text-sm">{t('settings_doctors_hint')}</p>
          </div>
          <Doctors canEdit={isOwner} onAccountsChanged={onAccountsChanged} />
        </section>
      )}

      {activeTab === 'import' && isOwner && (
        <section className="dc-settings-panel space-y-4">
          <h4>{t('settings_import_title')}</h4>
          <p>{t('settings_import_simple')}</p>
          <p className="dc-muted text-sm">{t('settings_import_hint')}</p>

          <div className="dc-settings-card">
            <h4>{t('settings_import_patients_title')}</h4>
            <p className="text-sm">{t('settings_import_patients_hint')}</p>
            <table className="w-full text-sm" style={{ margin: '8px 0' }}>
              <thead>
                <tr>
                  <th>{t('patient_name')}</th>
                  <th>{t('patient_phone')}</th>
                  <th>{t('patient_address')}</th>
                  <th>{t('patient_medical_notes')}</th>
                  <th>{t('patient_balance')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>أحمد علي</td>
                  <td>0591234567</td>
                  <td>رام الله</td>
                  <td>حساسية بنج</td>
                  <td>350</td>
                </tr>
              </tbody>
            </table>
            <button type="button" onClick={downloadPatientsTemplate}>{t('settings_import_patients_template')}</button>
            <label style={{ display: 'block', marginTop: 8 }}>
              {t('settings_import_file')}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importPatientsFile} />
            </label>
            {importPatients && (
              <div>{t('settings_import_parties_result', { created: importPatients.created, withBalance: importPatients.withBalance })}</div>
            )}
          </div>

          <div className="dc-settings-card">
            <h4>{t('settings_import_suppliers_title')}</h4>
            <p className="text-sm">{t('settings_import_suppliers_hint')}</p>
            <table className="w-full text-sm" style={{ margin: '8px 0' }}>
              <thead>
                <tr>
                  <th>{t('supplier_name')}</th>
                  <th>{t('patient_phone')}</th>
                  <th>{t('patient_balance')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>مختبر الأسنان</td>
                  <td>022234567</td>
                  <td>1200</td>
                </tr>
              </tbody>
            </table>
            <button type="button" onClick={downloadSuppliersTemplate}>{t('settings_import_suppliers_template')}</button>
            <label style={{ display: 'block', marginTop: 8 }}>
              {t('settings_import_file')}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importSuppliersFile} />
            </label>
            {importSuppliers && (
              <div>{t('settings_import_parties_result', { created: importSuppliers.created, withBalance: importSuppliers.withBalance })}</div>
            )}
          </div>
        </section>
      )}

      <PartyModal
        open={conditionModalOpen}
        title={editingConditionId ? t('settings_condition_edit') : t('settings_condition_add')}
        onClose={() => {
          if (!conditionModalBusy) closeConditionModal();
        }}
      >
        <form onSubmit={submitToothCondition} className="space-y-3">
          <div className="dc-form-field">
            <label>{t('settings_condition_name')}</label>
            <input
              required
              autoFocus
              value={conditionForm.name}
              onChange={(e) => setConditionForm((p) => ({ ...p, name: e.target.value }))}
              disabled={conditionModalBusy}
            />
          </div>
          {!editingConditionId && (
            <>
              <div className="dc-form-field">
                <label>{t('settings_condition_name_en')}</label>
                <input
                  value={conditionForm.name_en}
                  onChange={(e) => {
                    const name_en = e.target.value;
                    setConditionForm((p) => ({
                      ...p,
                      name_en,
                      code: p.code || suggestConditionCode(name_en, p.name),
                    }));
                  }}
                  disabled={conditionModalBusy}
                  placeholder="e.g. Whitening"
                />
              </div>
              <div className="dc-form-field">
                <label>{t('settings_condition_code')}</label>
                <input
                  className="dc-num"
                  value={conditionForm.code}
                  onChange={(e) => setConditionForm((p) => ({
                    ...p,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                  }))}
                  disabled={conditionModalBusy}
                  placeholder={t('settings_condition_code_hint')}
                />
              </div>
            </>
          )}
          {editingConditionId && (
            <div className="dc-form-field">
              <label>{t('settings_condition_code')}</label>
              <input className="dc-num" value={conditionForm.code} disabled readOnly />
            </div>
          )}
          <div className="dc-form-field">
            <label>{t('settings_condition_color')}</label>
            <input
              type="color"
              value={conditionForm.color || '#0284c7'}
              onChange={(e) => setConditionForm((p) => ({ ...p, color: e.target.value }))}
              disabled={conditionModalBusy}
            />
          </div>
          {editingConditionId && (
            <label className="dc-check-inline">
              <input
                type="checkbox"
                checked={conditionForm.is_active !== false}
                onChange={(e) => setConditionForm((p) => ({ ...p, is_active: e.target.checked }))}
                disabled={conditionModalBusy}
              />
              <span>{t('settings_condition_active')}</span>
            </label>
          )}
          <div className="dc-doc-view-actions">
            <button type="submit" disabled={conditionModalBusy}>
              {conditionModalBusy
                ? t('party_saving')
                : (editingConditionId ? t('platform_save') : t('settings_condition_add'))}
            </button>
            <button
              type="button"
              className="dc-ghost-light"
              onClick={closeConditionModal}
              disabled={conditionModalBusy}
            >
              {t('btn_cancel')}
            </button>
          </div>
        </form>
      </PartyModal>

      <PartyModal
        open={treatmentModalOpen}
        title={editingTreatmentId ? t('settings_treatment_edit') : t('settings_treatment_add')}
        onClose={() => {
          if (!treatmentModalBusy) closeTreatmentModal();
        }}
      >
        <form onSubmit={submitTreatment} className="space-y-3">
          <div className="dc-form-field">
            <label>{t('clinical_treatment_name')}</label>
            <input
              required
              autoFocus
              value={treatmentForm.name}
              onChange={(e) => setTreatmentForm((p) => ({ ...p, name: e.target.value }))}
              disabled={treatmentModalBusy}
            />
          </div>
          <div className="dc-form-field">
            <label>{t('clinical_treatment_cost')}</label>
            <ClinicNumberInput
              required
              showCurrency
              min="0"
              step="0.01"
              value={treatmentForm.price}
              onChange={(price) => setTreatmentForm((p) => ({ ...p, price }))}
              disabled={treatmentModalBusy}
            />
          </div>
          <div className="dc-form-field">
            <label>{t('settings_treatment_condition')}</label>
            <select
              className="dc-treatment-condition-select"
              value={treatmentForm.conditionCode || ''}
              onChange={(e) => setTreatmentForm((p) => ({ ...p, conditionCode: e.target.value }))}
              disabled={treatmentModalBusy}
            >
              <option value="">
                {editingTreatmentId
                  ? t('settings_treatment_condition_none')
                  : t('settings_treatment_condition_auto')}
              </option>
              {conditionOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {conditionDisplayName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="dc-form-field">
            <label>{t('settings_treatment_stages')}</label>
            <p className="dc-muted text-sm">{t('settings_treatment_stages_hint')}</p>
            {(treatmentForm.stages || []).map((stage, idx) => (
              <div key={stage.id || idx} className="dc-plan-stage-edit-row">
                <input
                  type="text"
                  placeholder={t('clinical_stage_new')}
                  value={stage.name}
                  onChange={(e) => updateTreatmentStage(idx, { name: e.target.value })}
                  disabled={treatmentModalBusy}
                />
                <label className="dc-plan-stage-opt">
                  <input
                    type="checkbox"
                    checked={Boolean(stage.isOptional)}
                    onChange={(e) => updateTreatmentStage(idx, { isOptional: e.target.checked })}
                    disabled={treatmentModalBusy}
                  />
                  {t('clinical_stage_optional')}
                </label>
                <button
                  type="button"
                  className="dc-danger"
                  disabled={treatmentModalBusy}
                  onClick={() => {
                    setTreatmentForm((prev) => ({
                      ...prev,
                      stages: (prev.stages || []).filter((_, i) => i !== idx),
                    }));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="dc-ghost-light"
              disabled={treatmentModalBusy}
              onClick={() => setTreatmentForm((prev) => ({
                ...prev,
                stages: [...(prev.stages || []), {
                  id: `new-stage-${Date.now()}`,
                  name: '',
                  isOptional: false,
                }],
              }))}
            >
              + {t('clinical_stage_add')}
            </button>
          </div>
          <div className="dc-doc-view-actions">
            <button type="submit" disabled={treatmentModalBusy}>
              {treatmentModalBusy
                ? t('party_saving')
                : (editingTreatmentId ? t('platform_save') : t('settings_treatment_add'))}
            </button>
            <button
              type="button"
              className="dc-ghost-light"
              onClick={closeTreatmentModal}
              disabled={treatmentModalBusy}
            >
              {t('btn_cancel')}
            </button>
          </div>
        </form>
      </PartyModal>

      <PartyModal
        open={roomAddOpen}
        title={t('settings_room_add')}
        onClose={closeRoomAddModal}
      >
        <form onSubmit={addRoom} className="space-y-3">
          <p className="dc-muted text-sm">{t('localized_name_hint')}</p>
          <div className="dc-form-field">
            <label>{t('settings_room_name')}</label>
            <input
              required
              autoFocus
              value={newRoom.name}
              onChange={(e) => setNewRoom({ name: e.target.value })}
            />
          </div>
          <div className="dc-doc-view-actions">
            <button type="submit" disabled={roomAddBusy}>
              {roomAddBusy ? t('party_saving') : t('settings_room_add')}
            </button>
            <button type="button" className="dc-ghost-light" onClick={closeRoomAddModal} disabled={roomAddBusy}>
              {t('btn_cancel')}
            </button>
          </div>
        </form>
      </PartyModal>
    </div>
  );
}
