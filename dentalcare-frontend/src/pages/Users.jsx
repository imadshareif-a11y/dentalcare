// pages/Users.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import PartyModal from '../components/PartyModal';
import UserForm from '../components/UserForm';
import PermissionsEditor from '../components/PermissionsEditor';

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
  const [users, setUsers] = useState([]);
  const [defaultsMeta, setDefaultsMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState({});
  const [saving, setSaving] = useState(false);

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
              return (
                <article key={u.id} className={`dc-user-card${editing ? ' is-editing' : ''}`}>
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
                    <span className={`dc-user-status${u.is_active ? ' is-active' : ''}`}>
                      {u.is_active ? t('user_status_active') : '—'}
                    </span>
                    <div className="dc-user-actions">
                      {editing ? (
                        <button type="button" className="dc-ghost" onClick={() => setEditingUserId(null)}>
                          {t('permissions_cancel')}
                        </button>
                      ) : (
                        <button type="button" onClick={() => startEditing(u)}>
                          {t('permissions_edit_button')}
                        </button>
                      )}
                    </div>
                  </div>

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
