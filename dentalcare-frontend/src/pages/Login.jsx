// pages/Login.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', textAlign: 'center' }}>
      <h2>{t('login')}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text" placeholder={t('username')} value={username}
          onChange={(e) => setUsername(e.target.value)} required
          style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
        />
        <input
          type="password" placeholder={t('password')} value={password}
          onChange={(e) => setPassword(e.target.value)} required
          style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
        />
        {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 10 }}>
          {submitting ? t('loggingIn') : t('login')}
        </button>
      </form>
    </div>
  );
}
