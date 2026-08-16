// App.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import Login from './pages/Login';
import VoucherForm from './components/VoucherForm';
import ReceiptForm from './components/ReceiptForm';
import PaymentForm from './components/PaymentForm';
import LedgerReport from './pages/LedgerReport';
import Patients from './pages/Patients';
import Checks from './pages/Checks';
import LanguageSwitcher from './components/LanguageSwitcher';

export default function App() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [tab, setTab] = useState('receipt');

  const loadAccounts = useCallback(() => {
    if (!user) return;
    api.get('/accounts').then(setAccounts).catch((err) => {
      console.error('فشل جلب الحسابات:', err);
    });
  }, [user]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  if (!user) return <Login />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>{t('welcome', { name: user.name })}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <LanguageSwitcher />
          <button onClick={logout}>{t('logout')}</button>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('receipt')}>{t('nav_receipt')}</button>
        <button onClick={() => setTab('payment')}>{t('nav_payment')}</button>
        <button onClick={() => setTab('voucher')}>{t('nav_voucher')}</button>
        <button onClick={() => setTab('patients')}>{t('nav_patients')}</button>
        <button onClick={() => setTab('checks')}>{t('nav_checks')}</button>
        <button onClick={() => setTab('ledger')}>{t('nav_ledger')}</button>
      </nav>

      {tab === 'checks' && <Checks accounts={accounts} onAccountsChanged={loadAccounts} />}
      {tab === 'patients' && <Patients onAccountsChanged={loadAccounts} />}
      {tab === 'receipt' && (
        <ReceiptForm
          accounts={accounts}
          onPosted={() => alert(t('voucher_posted_success_receipt'))}
        />
      )}
      {tab === 'payment' && (
        <PaymentForm
          accounts={accounts}
          onPosted={() => alert(t('voucher_posted_success_payment'))}
        />
      )}
      {tab === 'voucher' && (
        <VoucherForm
          accounts={accounts}
          onPosted={() => alert(t('voucher_posted_success'))}
        />
      )}
      {tab === 'ledger' && <LedgerReport accounts={accounts} />}
    </div>
  );
}
