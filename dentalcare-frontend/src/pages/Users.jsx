// pages/Users.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import PartyModal from '../components/PartyModal';
import UserForm from '../components/UserForm';
import PermissionsEditor from '../components/PermissionsEditor';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL_KEY = {
  OWNER: 'user_role_owner',
  ACCOUNTANT: 'user_role_accountant',
  DOCTOR: 'user_role_doctor',
  RECEPTIONIST: 'user_role_receptionist',
};

const ROLE_TONE = {
  OWNER: 'violet',
  ACCOUNTANT: 'sky',
  DOCTOR: 'teal',
  RECEPTIONIST: 'amber',
};

const ROLE_ORDER = ['OWNER', 'ACCOUNTANT', 'DOCTOR', 'RECEPTIONIST'];

export default function Users() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [defaultsMeta, setDefaultsMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [linkSavingId, setLinkSavingId] = useState(null);

  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsRole, setDefaultsRole] = useState('RECEPTIONIST');
  const [defaultsDraft, setDefaultsDraft] = useState(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const loadDefaultsMeta = useCallback(async () => {
    try {
      const data = await api.get('/permission-defaults');
      setDefaultsMeta(data);
      return data;
    } catch {
      setDefaultsMeta(null);
      return null;
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.filter((u) => u.role !== 'SUPER_ADMIN' && u.username !== 'platform'));
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
    loadDefaultsMeta();
    api.get('/doctors').then((rows) => setDoctors(Array.isArray(rows) ? rows : [])).catch(() => setDoctors([]));
  }, [loadUsers, loadDefaultsMeta]);

  function openAddModal() {
    setFormKey((k) => k + 1);
    setAddOpen(true);
  }

  function closeAddModal() {
    setAddOpen(false);
  }

  async function handleRegistered() {
    closeAddModal();
    await loadUsers();
  }

  async function openDefaultsModal() {
    const data = await loadDefaultsMeta();
    if (!data?.defaults) return;
    setDefaultsDraft({ ...data.defaults });
    setDefaultsRole('RECEPTIONIST');
    setDefaultsOpen(true);
  }

  function closeDefaultsModal() {
    setDefaultsOpen(false);
    setDefaultsDraft(null);
  }

  function updateDefaultsForRole(perms) {
    setDefaultsDraft((prev) => ({
      ...prev,
      [defaultsRole]: perms,
    }));
  }

  async function saveRoleDefaults() {
    if (!defaultsDraft) return;
    setSavingDefaults(true);
    try {
      const data = await api.put('/permission-defaults', { defaults: defaultsDraft });
      setDefaultsMeta(data);
      closeDefaultsModal();
      alert(t('permissions_defaults_saved'));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSavingDefaults(false);
    }
  }

  async function resetRoleDefaults() {
    if (!confirm(t('permissions_defaults_reset_confirm'))) return;
    setSavingDefaults(true);
    try {
      const data = await api.post('/permission-defaults/reset');
      setDefaultsMeta(data);
      setDefaultsDraft({ ...data.defaults });
      alert(t('permissions_defaults_reset_ok'));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSavingDefaults(false);
    }
  }

  function startEditing(u) {
    setEditingUserId(u.id);
    setEditingPermissions(u.permissions || {});
  }

  async function savePermissions(userId) {
    setSaving(true);
    try {
      await api.patch(`/users/${userId}/permissions`, { permissions: editingPermissions });
      setEditingUserId(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSaving(false);
    }
  }

  async function saveDoctorLink(userId, doctorPartyId) {
    setLinkSavingId(userId);
    try {
      await api.patch(`/users/${userId}`, {
        doctorPartyId: doctorPartyId || null,
      });
      await loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setLinkSavingId(null);
    }
  }

  async function toggleActive(u) {
    const next = !u.is_active;
    if (!next && !confirm(t('user_deactivate_confirm', { name: u.name }))) return;
    setStatusSavingId(u.id);
    try {
      await api.patch(`/users/${u.id}`, { isActive: next });
      await loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setStatusSavingId(null);
    }
  }

  async function deleteUser(u) {
    if (String(u.id) === String(currentUser?.id)) return;
    if (!confirm(t('user_delete_confirm', { name: u.name, username: u.username }))) return;
    setDeletingId(u.id);
    try {
      await api.delete(`/users/${u.id}`);
      if (editingUserId === u.id) setEditingUserId(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setDeletingId(null);
    }
  }

  const roles = defaultsMeta?.roles || ROLE_ORDER;

  return (
    <div className="dc-users space-y-4">
      <section className="dc-users-list-panel">
        <div className="dc-users-list-head">
          <h3 className="dc-users-list-title">
            <i className="fa-solid fa-users" aria-hidden />
            {t('user_list_title')}
          </h3>
          <div className="dc-users-list-actions">
            <button type="button" className="dc-ghost" onClick={openDefaultsModal}>
              <i className="fa-solid fa-sliders" aria-hidden />
              {' '}
              {t('permissions_defaults_edit')}
            </button>
            <button type="button" className="dc-success" onClick={openAddModal}>
              <i className="fa-solid fa-user-plus" aria-hidden />
              {' '}
              {t('user_register')}
            </button>
          </div>
        </div>

        {loading && <div className="dc-muted">{t('ledger_loading')}</div>}
        {error && <div className="dc-error">{error}</div>}
        {!loading && users.length === 0 && <div className="dc-muted">{t('user_none_yet')}</div>}

        {!loading && users.length > 0 && (
          <div className="dc-users-cards">
            {users.map((u) => {
              const editing = editingUserId === u.id;
              const isSelf = String(u.id) === String(currentUser?.id);
              const busy = statusSavingId === u.id || deletingId === u.id || linkSavingId === u.id;
              return (
                <article
                  key={u.id}
                  className={`dc-user-card${editing ? ' is-editing' : ''}${u.is_active ? '' : ' is-inactive'}`}
                >
                  <div className="dc-user-card-main">
                    <div className="dc-user-avatar" aria-hidden>
                      {(u.name || u.username || '?').slice(0, 1)}
                    </div>
                    <div className="dc-user-meta">
                      <strong>{u.name}</strong>
                      <span className="dc-muted">@{u.username}</span>
                    </div>
                    <span className={`dc-user-role tone-${ROLE_TONE[u.role] || 'slate'}`}>
                      {t(ROLE_LABEL_KEY[u.role] || u.role)}
                    </span>
                    <span className={`dc-user-status${u.is_active ? ' is-active' : ' is-inactive'}`}>
                      {u.is_active ? t('user_status_active') : t('user_status_inactive')}
                    </span>
                    <div className="dc-user-actions">
                      <button
                        type="button"
                        className={u.is_active ? 'dc-ghost' : 'dc-success'}
                        disabled={busy || (isSelf && u.is_active)}
                        title={isSelf && u.is_active ? t('user_cannot_deactivate_self') : undefined}
                        onClick={() => toggleActive(u)}
                      >
                        {statusSavingId === u.id
                          ? t('ledger_loading')
                          : (u.is_active ? t('user_deactivate') : t('user_activate'))}
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          className="dc-danger"
                          disabled={busy}
                          onClick={() => deleteUser(u)}
                        >
                          {deletingId === u.id ? t('ledger_loading') : t('user_delete')}
                        </button>
                      )}
                      {editing ? (
                        <button type="button" className="dc-ghost" onClick={() => setEditingUserId(null)}>
                          {t('permissions_cancel')}
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => startEditing(u)}>
                          {t('permissions_edit_button')}
                        </button>
                      )}
                    </div>
                  </div>

                  {u.role === 'DOCTOR' && (
                    <div className="dc-user-doctor-link-row">
                      <label className="dc-user-doctor-link">
                        <span className="dc-muted text-sm">{t('user_doctor_link')}</span>
                        <select
                          value={u.doctor_party_id || ''}
                          disabled={linkSavingId === u.id}
                          onChange={(e) => saveDoctorLink(u.id, e.target.value || null)}
                        >
                          <option value="">{t('user_doctor_link_placeholder')}</option>
                          {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {editing && defaultsMeta && (
                    <div className="dc-user-perms-panel">
                      <PermissionsEditor
                        permissionKeys={defaultsMeta.keys}
                        levels={defaultsMeta.levels}
                        permissions={editingPermissions}
                        onChange={setEditingPermissions}
                      />
                      <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start' }}>
                        <button type="button" className="dc-success" onClick={() => savePermissions(u.id)} disabled={saving}>
                          {saving ? t('ledger_loading') : t('permissions_save')}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PartyModal
        open={addOpen}
        wide
        title={t('user_register')}
        onClose={closeAddModal}
      >
        <UserForm
          key={formKey}
          onRegistered={handleRegistered}
          onCancel={closeAddModal}
        />
      </PartyModal>

      <PartyModal
        open={defaultsOpen && Boolean(defaultsDraft)}
        wide
        title={t('permissions_defaults_title')}
        onClose={closeDefaultsModal}
      >
        <p className="dc-muted text-sm">{t('permissions_defaults_hint')}</p>

        <div className="dc-role-tabs" role="tablist">
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={defaultsRole === role}
              className={`dc-role-tab tone-${ROLE_TONE[role] || 'slate'}${defaultsRole === role ? ' is-active' : ''}`}
              onClick={() => setDefaultsRole(role)}
            >
              {t(ROLE_LABEL_KEY[role] || role)}
            </button>
          ))}
        </div>

        {defaultsMeta && defaultsDraft?.[defaultsRole] && (
          <div className="dc-user-perms-panel is-in-modal">
            <PermissionsEditor
              permissionKeys={defaultsMeta.keys}
              levels={defaultsMeta.levels}
              permissions={defaultsDraft[defaultsRole]}
              onChange={updateDefaultsForRole}
            />
          </div>
        )}

        <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button type="button" className="dc-success" disabled={savingDefaults} onClick={saveRoleDefaults}>
            {savingDefaults ? t('ledger_loading') : t('permissions_defaults_save')}
          </button>
          <button type="button" className="dc-ghost" disabled={savingDefaults} onClick={resetRoleDefaults}>
            {t('permissions_defaults_reset')}
          </button>
          <button type="button" className="dc-ghost" disabled={savingDefaults} onClick={closeDefaultsModal}>
            {t('permissions_cancel')}
          </button>
        </div>
      </PartyModal>
    </div>
  );
}
