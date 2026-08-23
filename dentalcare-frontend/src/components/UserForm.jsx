// components/UserForm.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import PermissionsEditor from './PermissionsEditor';

export default function UserForm({ onRegistered, onCancel }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [doctorPartyId, setDoctorPartyId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [defaultsMeta, setDefaultsMeta] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/permission-defaults').then(setDefaultsMeta).catch(() => setDefaultsMeta(null));
    api.get('/doctors').then((rows) => setDoctors(Array.isArray(rows) ? rows : [])).catch(() => setDoctors([]));
  }, []);

  useEffect(() => {
    if (role !== 'DOCTOR') setDoctorPartyId('');
  }, [role]);

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

    if (role === 'DOCTOR' && !doctorPartyId) {
      setError(t('user_doctor_link_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/users', {
        name: name.trim(), username: username.trim(), password, role, permissions,
        doctorPartyId: role === 'DOCTOR' ? doctorPartyId : null,
      });
      onRegistered?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="dc-user-form space-y-3">
      <div className="dc-user-form-grid">
        <label>
          {t('user_name')}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          {t('user_username')}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          {t('user_password')}
          <input
            type="password"
            placeholder={t('user_password_hint')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          {t('user_role')}
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="OWNER">{t('user_role_owner')}</option>
            <option value="ACCOUNTANT">{t('user_role_accountant')}</option>
            <option value="DOCTOR">{t('user_role_doctor')}</option>
            <option value="RECEPTIONIST">{t('user_role_receptionist')}</option>
          </select>
        </label>
      </div>

      {role === 'DOCTOR' && (
        <label>
          {t('user_doctor_link')}
          <select
            value={doctorPartyId}
            onChange={(e) => setDoctorPartyId(e.target.value)}
            required
          >
            <option value="">{t('user_doctor_link_placeholder')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <span className="dc-muted text-sm">{t('user_doctor_link_hint')}</span>
        </label>
      )}

      {defaultsMeta && (
        <div className="dc-user-perms-panel is-in-modal">
          <h4 className="dc-perms-form-title">{t('permissions_section_title')}</h4>
          <p className="dc-muted text-sm">{t('permissions_section_hint')}</p>
          <PermissionsEditor
            permissionKeys={defaultsMeta.keys}
            levels={defaultsMeta.levels}
            permissions={permissions}
            onChange={setPermissions}
          />
        </div>
      )}

      {error && <div className="dc-error">{error}</div>}

      <div className="dc-doc-view-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" className="dc-success" disabled={submitting}>
          {submitting ? t('user_registering') : t('user_register')}
        </button>
        {onCancel && (
          <button type="button" className="dc-ghost" onClick={onCancel} disabled={submitting}>
            {t('permissions_cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
