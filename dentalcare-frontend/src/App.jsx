// App.jsx
import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import Login from './pages/Login';
import VoucherForm from './components/VoucherForm';
import LedgerReport from './pages/LedgerReport';

export default function App() {
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [tab, setTab] = useState('voucher');

  useEffect(() => {
    if (!user) return;
    api.get('/accounts').then(setAccounts).catch((err) => {
      console.error('فشل جلب الحسابات:', err);
    });
  }, [user]);

  if (!user) return <Login />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>مرحبًا، {user.name}</div>
        <button onClick={logout}>تسجيل خروج</button>
      </header>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('voucher')}>قيد محاسبي</button>
        <button onClick={() => setTab('ledger')}>كشف حساب</button>
      </nav>

      {tab === 'voucher' && (
        <VoucherForm
          accounts={accounts}
          onPosted={() => alert('تم ترحيل القيد بنجاح')}
        />
      )}
      {tab === 'ledger' && <LedgerReport accounts={accounts} />}
    </div>
  );
}
