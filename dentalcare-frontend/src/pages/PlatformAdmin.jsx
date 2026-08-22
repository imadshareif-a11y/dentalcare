import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PartyModal from '../components/PartyModal';
import FormattedDateInput from '../components/FormattedDateInput';

function emptyCreateForm() {
  const from = new Date().toISOString().slice(0, 10);
  const untilDate = new Date();
  untilDate.setFullYear(untilDate.getFullYear() + 1);
  return {
    name: '',
    ownerName: '',
    ownerUsername: '',
    ownerPassword: '',
    activeFrom: from,
    activeUntil: untilDate.toISOString().slice(0, 10),
    maxUsers: 10,
  };
}

export default function PlatformAdmin() {
  const { t } = useTranslation();
  const { enterSupportSession } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '', status: 'ACTIVE', activeFrom: '', activeUntil: '', maxUsers: 10,
  });
  const [backups, setBackups] = useState([]);
  const [backupMeta, setBackupMeta] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/platform/tenants');
      setTenants(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBackups = useCallback(async () => {
    try {
      const data = await api.get('/platform/backups');
      setBackups(data.items || []);
      setBackupMeta(data);
    } catch {
      setBackups([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBackups(); }, [loadBackups]);

  async function runFullBackup() {
    setBackupBusy(true);
    try {
      await api.post('/platform/backups/full');
      await loadBackups();
      alert(t('platform_backups_ok'));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setBackupBusy(false);
    }
  }

  async function backupTenant(tenant) {
    setBackupBusy(true);
    try {
      await api.post(`/platform/backups/tenants/${tenant.id}`);
      await loadBackups();
      alert(t('platform_backups_tenant_ok'));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setBackupBusy(false);
    }
  }

  async function downloadBackup(fileName) {
    try {
      await api.download(`/platform/backups/${encodeURIComponent(fileName)}/download`, fileName);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(emptyCreateForm());
    setCreateOpen(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/platform/tenants', {
        name: form.name.trim(),
        ownerName: form.ownerName.trim() || undefined,
        ownerUsername: form.ownerUsername.trim(),
        ownerPassword: form.ownerPassword,
        activeFrom: form.activeFrom,
        activeUntil: form.activeUntil,
        maxUsers: Number(form.maxUsers) || 10,
      });
      alert(t('platform_created_success'));
      setCreateOpen(false);
      setForm(emptyCreateForm());
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(tenant) {
    setEditing(tenant);
    setEditForm({
      name: tenant.name,
      status: tenant.status,
      activeFrom: tenant.active_from || '',
      activeUntil: tenant.active_until || '',
      maxUsers: tenant.max_users || 10,
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/platform/tenants/${editing.id}`, {
        name: editForm.name.trim(),
        status: editForm.status,
        activeFrom: editForm.activeFrom,
        activeUntil: editForm.activeUntil,
        maxUsers: Number(editForm.maxUsers) || 10,
      });
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tenant) {
    if (!confirm(t('platform_delete_confirm', { name: tenant.name }))) return;
    try {
      await api.delete(`/platform/tenants/${tenant.id}`);
      if (editing?.id === tenant.id) setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function enterClinic(tenant) {
    if (!confirm(t('platform_support_confirm', { name: tenant.name }))) return;
    try {
      const data = await api.post(`/platform/tenants/${tenant.id}/support-access`, {});
      enterSupportSession(data);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="dc-party-head">
        <div>
          <h2>{t('platform_title')}</h2>
          <p className="dc-muted">{t('platform_hint')}</p>
        </div>
        <button type="button" className="dc-success" onClick={openCreate}>
          <i className="fa-solid fa-plus" /> {t('platform_add_clinic')}
        </button>
      </div>

      <h3>{t('platform_list_title')}</h3>
      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && tenants.length === 0 && <div>{t('platform_none')}</div>}
      {!loading && tenants.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('platform_clinic_name')}</th>
              <th>{t('platform_owner')}</th>
              <th>{t('platform_users')}</th>
              <th>{t('platform_max_users')}</th>
              <th>{t('platform_active_from')}</th>
              <th>{t('platform_active_until')}</th>
              <th>{t('user_col_status')}</th>
              <th>{t('check_col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr
                key={tenant.id}
                className="dc-platform-row"
                onClick={() => openEdit(tenant)}
              >
                <td><strong>{tenant.name}</strong></td>
                <td>{tenant.owner_username || '—'}</td>
                <td>{tenant.user_count}</td>
                <td>{tenant.max_users ?? '—'}</td>
                <td>{tenant.active_from || '—'}</td>
                <td>{tenant.active_until || '—'}</td>
                <td>
                  {tenant.status === 'ACTIVE'
                    ? <span className="dc-badge dc-badge-emerald">{t('platform_status_active')}</span>
                    : <span className="dc-badge dc-badge-rose">{t('platform_status_suspended')}</span>}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="dc-doc-view-actions">
                    <button type="button" onClick={() => openEdit(tenant)}>{t('platform_edit')}</button>
                    <button type="button" className="dc-ghost" disabled={backupBusy} onClick={() => backupTenant(tenant)}>
                      {t('platform_backups_tenant')}
                    </button>
                    <button type="button" className="dc-success" onClick={() => enterClinic(tenant)}>
                      {t('platform_support_enter')}
                    </button>
                    <button type="button" className="dc-danger" onClick={() => handleDelete(tenant)}>
                      {t('platform_delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="dc-settings-panel" style={{ marginTop: 24 }}>
        <h4>{t('platform_backups_title')}</h4>
        <p className="dc-muted text-sm">{t('platform_backups_hint')}</p>
        {backupMeta?.lastRun && (
          <p className="dc-muted text-sm">
            {t('platform_backups_last_run')}: {backupMeta.lastRun.ranAt} — {backupMeta.lastRun.file}
          </p>
        )}
        <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
          <button type="button" className="dc-success" disabled={backupBusy} onClick={runFullBackup}>
            {backupBusy ? t('ledger_loading') : t('platform_backups_run_full')}
          </button>
          <button type="button" className="dc-ghost" disabled={backupBusy} onClick={loadBackups}>
            {t('platform_backups_refresh')}
          </button>
        </div>
        {backups.length === 0 ? (
          <div className="dc-muted">{t('platform_backups_empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('platform_backups_file')}</th>
                <th>{t('platform_backups_type')}</th>
                <th>{t('platform_backups_size')}</th>
                <th>{t('platform_backups_date')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={`${b.type}-${b.file}`}>
                  <td>{b.file}</td>
                  <td>{b.type}</td>
                  <td>{Math.round((b.sizeBytes || 0) / 1024)} KB</td>
                  <td>{String(b.modifiedAt || '').slice(0, 19).replace('T', ' ')}</td>
                  <td>
                    <button type="button" onClick={() => downloadBackup(b.file)}>
                      {t('platform_backups_download')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PartyModal
        open={createOpen}
        title={t('platform_create_title')}
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreate} className="dc-platform-form">
          <input
            required
            placeholder={t('platform_clinic_name')}
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          <input
            placeholder={t('platform_owner_name')}
            value={form.ownerName}
            onChange={(e) => updateField('ownerName', e.target.value)}
          />
          <input
            required
            placeholder={t('user_username')}
            value={form.ownerUsername}
            onChange={(e) => updateField('ownerUsername', e.target.value)}
          />
          <input
            required
            type="password"
            minLength={8}
            placeholder={t('user_password_hint')}
            value={form.ownerPassword}
            onChange={(e) => updateField('ownerPassword', e.target.value)}
          />
          <label>
            {t('platform_max_users')}
            <input
              type="number"
              min={1}
              max={500}
              required
              value={form.maxUsers}
              onChange={(e) => updateField('maxUsers', e.target.value)}
            />
          </label>
          <label>
            {t('platform_active_from')}
            <FormattedDateInput
              required
              value={form.activeFrom}
              onChange={(v) => updateField('activeFrom', v)}
            />
          </label>
          <label>
            {t('platform_active_until')}
            <FormattedDateInput
              required
              value={form.activeUntil}
              onChange={(v) => updateField('activeUntil', v)}
            />
          </label>
          <button type="submit" className="dc-success" disabled={saving}>
            {saving ? t('platform_creating') : t('platform_create')}
          </button>
        </form>
      </PartyModal>

      <PartyModal
        open={Boolean(editing)}
        title={`${t('platform_edit')} — ${editing?.name || ''}`}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={saveEdit} className="dc-platform-form">
            <label>
              {t('platform_clinic_name')}
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <div className="dc-muted text-sm">
              {t('platform_owner')}: {editing.owner_username || '—'}
              {' · '}
              {t('platform_users')}: {editing.user_count}/{editForm.maxUsers}
            </div>
            <label>
              {t('platform_max_users')}
              <input
                type="number"
                min={1}
                max={500}
                required
                value={editForm.maxUsers}
                onChange={(e) => setEditForm((p) => ({ ...p, maxUsers: e.target.value }))}
              />
            </label>
            <label>
              {t('platform_active_from')}
              <FormattedDateInput
                required
                value={editForm.activeFrom}
                onChange={(v) => setEditForm((p) => ({ ...p, activeFrom: v }))}
              />
            </label>
            <label>
              {t('platform_active_until')}
              <FormattedDateInput
                required
                value={editForm.activeUntil}
                onChange={(v) => setEditForm((p) => ({ ...p, activeUntil: v }))}
              />
            </label>
            <label>
              {t('user_col_status')}
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="ACTIVE">{t('platform_status_active')}</option>
                <option value="SUSPENDED">{t('platform_status_suspended')}</option>
              </select>
            </label>
            <div className="dc-doc-view-actions">
              <button type="submit" className="dc-success" disabled={saving}>
                {saving ? t('platform_creating') : t('platform_save')}
              </button>
              <button type="button" className="dc-success" onClick={() => enterClinic(editing)}>
                {t('platform_support_enter')}
              </button>
              <button type="button" className="dc-danger" onClick={() => handleDelete(editing)}>
                {t('platform_delete')}
              </button>
            </div>
          </form>
        )}
      </PartyModal>
    </div>
  );
}
