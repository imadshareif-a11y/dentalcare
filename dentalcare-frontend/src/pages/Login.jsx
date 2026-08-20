import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

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
    <div className="dc-login">
      <div className="dc-login-card">
        <div className="dc-login-top">
          <LanguageSwitcher />
        </div>
        <div className="dc-brand-mark"><i className="fa-solid fa-tooth" /></div>
        <h2>{t('app_name')}</h2>
        <p className="dc-muted">{t('login_hint')}</p>
        <form onSubmit={handleSubmit}>
          <label>
            {t('username')}
            <input
              type="text" autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)} required
            />
          </label>
          <label>
            {t('password')}
            <input
              type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </label>
          {error && <div className="dc-error">{error}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? t('loggingIn') : t('login')}
          </button>
        </form>
      </div>
    </div>
  );
}
