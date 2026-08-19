// pages/Users.jsx
import { Fragment, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import UserForm from '../components/UserForm';
import PermissionsEditor from '../components/PermissionsEditor';

const ROLE_LABEL_KEY = {
  OWNER: 'user_role_owner',
  ACCOUNTANT: 'user_role_accountant',
  DOCTOR: 'user_role_doctor',
  RECEPTIONIST: 'user_role_receptionist',
};

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [defaultsMeta, setDefaultsMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState({});
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers();
    api.get('/permission-defaults').then(setDefaultsMeta).catch(() => setDefaultsMeta(null));
  }, [loadUsers]);

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

  return (
    <div className="space-y-4">
      <UserForm onRegistered={loadUsers} />

      <h3>{t('user_list_title')}</h3>
      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!loading && users.length === 0 && <div>{t('user_none_yet')}</div>}

      {!loading && users.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('user_name')}</th>
              <th>{t('user_username')}</th>
              <th>{t('user_role')}</th>
              <th>{t('user_col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr>
                  <td>{u.name}</td>
                  <td>{u.username}</td>
                  <td>{t(ROLE_LABEL_KEY[u.role] || u.role)}</td>
                  <td>{u.is_active ? t('user_status_active') : '—'}</td>
                  <td>
                    {editingUserId === u.id ? (
                      <button onClick={() => setEditingUserId(null)}>{t('permissions_cancel')}</button>
                    ) : (
                      <button onClick={() => startEditing(u)}>{t('permissions_edit_button')}</button>
                    )}
                  </td>
                </tr>
                {editingUserId === u.id && defaultsMeta && (
                  <tr>
                    <td colSpan={5}>
                      <PermissionsEditor
                        permissionKeys={defaultsMeta.keys}
                        levels={defaultsMeta.levels}
                        permissions={editingPermissions}
                        onChange={setEditingPermissions}
                      />
                      <button onClick={() => savePermissions(u.id)} disabled={saving}>
                        {saving ? t('ledger_loading') : t('permissions_save')}
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
