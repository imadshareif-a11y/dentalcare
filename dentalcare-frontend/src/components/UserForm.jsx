// components/UserForm.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import PermissionsEditor from './PermissionsEditor';

export default function UserForm({ onRegistered }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [permissions, setPermissions] = useState({});
  const [defaultsMeta, setDefaultsMeta] = useState(null); // { keys, levels, defaults }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/permission-defaults').then(setDefaultsMeta).catch(() => setDefaultsMeta(null));
  }, []);

  // لما يتغيّر الدور، نرجّع الصلاحيات للقيم الافتراضية لهذا
  // الدور — المدير بعدين يقدر يعدّلها يدويًا قبل الحفظ
  useEffect(() => {
    if (defaultsMeta) setPermissions(defaultsMeta.defaults[role] || {});
  }, [role, defaultsMeta]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !username.trim() || !password) {
      setError(t('accounts_required'));
      return;
    }
    if (password.length < 8) {
      setError(t('user_password_hint'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/users', {
        name: name.trim(), username: username.trim(), password, role, permissions,
      });
      setName('');
      setUsername('');
      setPassword('');
      setRole('RECEPTIONIST');
      onRegistered?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('user_register')}</h3>
      <input
        type="text" placeholder={t('user_name')}
        value={name} onChange={(e) => setName(e.target.value)} required
      />
      <input
        type="text" placeholder={t('user_username')}
        value={username} onChange={(e) => setUsername(e.target.value)} required
      />
      <input
        type="password" placeholder={`${t('user_password')} (${t('user_password_hint')})`}
        value={password} onChange={(e) => setPassword(e.target.value)} required
      />

      <div>
        <label>{t('user_role')}</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="OWNER">{t('user_role_owner')}</option>
          <option value="ACCOUNTANT">{t('user_role_accountant')}</option>
          <option value="DOCTOR">{t('user_role_doctor')}</option>
          <option value="RECEPTIONIST">{t('user_role_receptionist')}</option>
        </select>
      </div>

      {defaultsMeta && (
        <PermissionsEditor
          permissionKeys={defaultsMeta.keys}
          levels={defaultsMeta.levels}
          permissions={permissions}
          onChange={setPermissions}
        />
      )}

      {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}

      <button type="submit" disabled={submitting}>
        {submitting ? t('user_registering') : t('user_register')}
      </button>
    </form>
  );
}
