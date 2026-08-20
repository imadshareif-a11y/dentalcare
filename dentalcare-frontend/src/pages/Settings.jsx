import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useCurrencies } from '../hooks/useCurrencies';
import { DEFAULT_QUICK_ACTIONS, QUICK_ACTION_CATALOG, normalizeQuickActions } from '../lib/quickActions';

function codeSample(prefix, width, next) {
  const pad = Math.min(8, Math.max(1, Number(width) || 5));
  return `${prefix || ''}${String(Number(next) || 1).padStart(pad, '0')}`;
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { settings, reload, isOwner, letterheadUrl } = useSettings();
  const { currencies, reload: reloadCurrencies } = useCurrencies();
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [formatForm, setFormatForm] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [newTreatment, setNewTreatment] = useState({ name: '', price: '' });
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
        { id: 'treatments', labelKey: 'settings_tab_treatments', ownerOnly: true },
        { id: 'import', labelKey: 'settings_tab_import', ownerOnly: true },
      );
    }
    return list;
  }, [isOwner]);

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
      printHeaderText: settings.printHeaderText,
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
  }, [isOwner]);

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

  function toggleQuickAction(id) {
    setQuickActions((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
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
        aiVisionModel: aiForm.aiVisionModel.trim() || 'gpt-4o-mini',
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

  async function addTreatment(e) {
    e.preventDefault();
    try {
      const created = await api.post('/treatments', {
        name: newTreatment.name,
        price: Number(newTreatment.price),
        sortOrder: treatments.length + 1,
      });
      setTreatments((prev) => [...prev, created]);
      setNewTreatment({ name: '', price: '' });
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
    }
  }

  async function saveTreatment(item) {
    try {
      const updated = await api.patch(`/treatments/${item.id}`, {
        name: item.name,
        price: Number(item.price),
        isActive: item.is_active,
      });
      setTreatments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      alert(err instanceof ApiError ? err.body?.error || err.message : t('error_network'));
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

  function numberingBlock(label, prefixKey, widthKey, nextKey) {
    return (
      <div className="dc-settings-block">
        <div>
          {label} — {t('settings_numbering_sample')}:{' '}
          {codeSample(formatForm[prefixKey], formatForm[widthKey], formatForm[nextKey])}
        </div>
        <div className="dc-form-row">
          <input
            placeholder={t('settings_prefix')}
            value={formatForm[prefixKey]}
            onChange={(e) => setFormatForm((p) => ({ ...p, [prefixKey]: e.target.value }))}
          />
          <input
            type="number"
            min="1"
            max="8"
            placeholder={t('settings_width')}
            value={formatForm[widthKey]}
            onChange={(e) => setFormatForm((p) => ({ ...p, [widthKey]: Number(e.target.value) }))}
          />
          <input
            type="number"
            min="1"
            placeholder={t('settings_next')}
            value={formatForm[nextKey]}
            onChange={(e) => setFormatForm((p) => ({ ...p, [nextKey]: Number(e.target.value) }))}
          />
        </div>
      </div>
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
          <h4>{t('settings_password_title')}</h4>
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
        <section className="dc-settings-panel">
          <h4>{t('settings_favorites_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_favorites_hint')}</p>
          <form onSubmit={saveFavorites} className="dc-settings-form" style={{ maxWidth: 560 }}>
            <div className="dc-fav-settings-list">
              {availableQuickActions.map((action) => (
                <label key={action.id} className="dc-check-row dc-fav-settings-row">
                  <input
                    type="checkbox"
                    checked={quickActions.includes(action.id)}
                    onChange={() => toggleQuickAction(action.id)}
                  />
                  <i className={action.icon} />
                  <span>{t(action.labelKey)}</span>
                </label>
              ))}
            </div>
            {availableQuickActions.length === 0 && (
              <div className="dc-muted">{t('favorites_empty')}</div>
            )}
            <button type="submit" disabled={savingFav || quickActions.length === 0}>
              {savingFav ? t('party_saving') : t('settings_favorites_save')}
            </button>
          </form>
        </section>
      )}

      {activeTab === 'format' && isOwner && formatForm && (
        <section className="dc-settings-panel">
          <h4>{t('settings_format_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_format_hint')}</p>
          <form onSubmit={saveFormat} className="dc-settings-form">
            <label>
              {t('settings_date_format')}
              <select
                value={formatForm.dateFormat}
                onChange={(e) => setFormatForm((p) => ({ ...p, dateFormat: e.target.value }))}
              >
                {(settings.dateFormats || []).map((fmt) => (
                  <option key={fmt} value={fmt}>{fmt}</option>
                ))}
              </select>
            </label>
            <label>
              {t('settings_base_currency')}
              <select
                value={formatForm.baseCurrencyId || ''}
                onChange={(e) => setFormatForm((p) => ({ ...p, baseCurrencyId: e.target.value }))}
                required
              >
                <option value="">{t('doc_currency_choose')}</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.symbol} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="dc-muted text-sm">{t('settings_base_currency_hint')}</p>
            <label>
              {t('settings_decimals')}
              <input
                type="number"
                min="0"
                max="4"
                value={formatForm.decimalPlaces}
                onChange={(e) => setFormatForm((p) => ({ ...p, decimalPlaces: Number(e.target.value) }))}
              />
            </label>
            <label>
              {t('settings_thousands')}
              <input
                value={formatForm.thousandsSeparator}
                onChange={(e) => setFormatForm((p) => ({ ...p, thousandsSeparator: e.target.value }))}
              />
            </label>
            <label>
              {t('settings_decimal_sep')}
              <input
                value={formatForm.decimalSeparator}
                onChange={(e) => setFormatForm((p) => ({ ...p, decimalSeparator: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={saving}>{t('settings_save_format')}</button>
          </form>
        </section>
      )}

      {activeTab === 'numbering' && isOwner && formatForm && (
        <section className="dc-settings-panel">
          <h4>{t('settings_numbering_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_numbering_hint')}</p>
          <form onSubmit={saveFormat} className="dc-settings-form" style={{ maxWidth: 560 }}>
            {numberingBlock(t('settings_numbering_patients'), 'patientsPrefix', 'patientsWidth', 'patientsNext')}
            {numberingBlock(t('settings_numbering_suppliers'), 'suppliersPrefix', 'suppliersWidth', 'suppliersNext')}
            {numberingBlock(t('settings_numbering_doctors'), 'doctorsPrefix', 'doctorsWidth', 'doctorsNext')}
            {numberingBlock(t('settings_numbering_employees'), 'employeesPrefix', 'employeesWidth', 'employeesNext')}
            <button type="submit" disabled={saving}>{t('settings_save_format')}</button>
          </form>
        </section>
      )}

      {activeTab === 'letterhead' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_letterhead_title')}</h4>
          <p className="dc-muted text-sm">{t('settings_letterhead_hint')}</p>

          <div className="dc-letterhead-preview">
            <div className="dc-letterhead-preview-label">{t('settings_letterhead_preview')}</div>
            {(formatForm?.printHeaderText || '').trim() && (
              <div className="dc-letterhead-preview-text">
                {(formatForm.printHeaderText || '').split('\n').map((line, i) => (
                  <div key={i}>{line || '\u00A0'}</div>
                ))}
              </div>
            )}
            {settings.hasLetterhead && letterheadUrl && !(settings.letterheadMime || '').includes('pdf') && (
              <img
                className="dc-letterhead-preview-img"
                src={letterheadUrl}
                alt={t('settings_letterhead_title')}
              />
            )}
            {settings.hasLetterhead && letterheadUrl && (settings.letterheadMime || '').includes('pdf') && (
              <div className="dc-letterhead-preview-pdf">
                <i className="fa-solid fa-file-pdf" />
                <span>{t('print_pdf_letterhead_note')}</span>
                <a href={letterheadUrl} target="_blank" rel="noreferrer">
                  {t('settings_letterhead_open_pdf')}
                </a>
              </div>
            )}
            {!settings.hasLetterhead && !(formatForm?.printHeaderText || '').trim() && (
              <div className="dc-muted text-sm">{t('settings_letterhead_empty')}</div>
            )}
          </div>

          <label className="dc-settings-form" style={{ maxWidth: 560 }}>
            {t('settings_letterhead_text')}
            <textarea
              rows={4}
              placeholder={t('settings_letterhead_text')}
              value={formatForm?.printHeaderText || ''}
              onChange={(e) => setFormatForm((p) => ({ ...p, printHeaderText: e.target.value }))}
            />
          </label>
          <div>
            <button type="button" onClick={saveFormat} disabled={saving}>
              {t('settings_save_letterhead_text')}
            </button>
          </div>

          <div className="dc-letterhead-file-actions">
            <label className="dc-letterhead-upload">
              <i className="fa-solid fa-camera" />
              <span>
                {settings.hasLetterhead
                  ? t('settings_letterhead_replace')
                  : t('settings_letterhead_file')}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="dc-sr-only"
                onChange={uploadLetterhead}
              />
            </label>
            {settings.hasLetterhead && (
              <button type="button" className="dc-danger" onClick={removeLetterhead}>
                {t('settings_letterhead_remove')}
              </button>
            )}
          </div>
        </section>
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
              {aiForm.aiEnabled && (settings.hasAiApiKey || aiForm.aiApiKey.trim())
                && (aiForm.aiProvider !== 'compatible' || aiForm.aiBaseUrl.trim() || settings.aiBaseUrl)
                ? t('settings_ai_status_ready')
                : t('settings_ai_status_off')}
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

      {activeTab === 'treatments' && isOwner && (
        <section className="dc-settings-panel">
          <h4>{t('settings_treatments_title')}</h4>
          <form onSubmit={addTreatment} className="dc-form-row" style={{ marginBottom: 12 }}>
            <input
              required
              placeholder={t('clinical_treatment_name')}
              value={newTreatment.name}
              onChange={(e) => setNewTreatment((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder={t('clinical_treatment_cost')}
              value={newTreatment.price}
              onChange={(e) => setNewTreatment((p) => ({ ...p, price: e.target.value }))}
            />
            <button type="submit">{t('settings_treatment_add')}</button>
          </form>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('clinical_treatment_name')}</th>
                <th>{t('clinical_treatment_cost')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {treatments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      value={item.name}
                      onChange={(e) => setTreatments((prev) => prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => setTreatments((prev) => prev.map((x) => (x.id === item.id ? { ...x, price: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => saveTreatment(item)}>{t('platform_save')}</button>
                    <button type="button" className="dc-danger" onClick={() => removeTreatment(item.id)}>{t('platform_delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
