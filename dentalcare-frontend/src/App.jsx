// App.jsx
// -----------------------------------------------------------
// كل تبويب إله permKey (اسم الصلاحية) وminLevel (أقل مستوى لازم
// يشوف فيه التبويب أصلًا) — نفس المفاتيح والمستويات المستخدمة
// بـ requirePermission() بالسيرفر بالضبط. هاي طبقة تجربة استخدام
// بس، مش طبقة أمان: السيرفر هو يلي بيرفض العملية فعليًا حتى لو
// حد قدر يوصل لواجهة تبويب مش مفروض يشوفه.
//
// للأقسام "الفعلية" (سند قبض/صرف/قيد/عيادي) ما في شاشة "مشاهدة"
// منفصلة، فبنعرض التبويب بس لو المستوى edit بالضبط. للأقسام يلي
// فيها قوائم (مرضى/أطباء/شيكات/تقارير)، نعرض التبويب لو view أو
// edit، ومنمرر canEdit للصفحة نفسها تقرر تخفي نموذج الإضافة أو لأ.
// -----------------------------------------------------------

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import Login from './pages/Login';
import VoucherForm from './components/VoucherForm';
import ReceiptForm from './components/ReceiptForm';
import PaymentForm from './components/PaymentForm';
import LedgerReport from './pages/LedgerReport';
import Patients from './pages/Patients';
import Doctors from './pages/Doctors';
import Checks from './pages/Checks';
import TrialBalance from './pages/TrialBalance';
import ProfitLoss from './pages/ProfitLoss';
import Clinical from './pages/Clinical';
import Users from './pages/Users';
import LanguageSwitcher from './components/LanguageSwitcher';

function buildTabs({ t, accounts, loadAccounts, permissions }) {
  const level = (key) => permissions?.[key] || 'none';
  const canEdit = (key) => level(key) === 'edit';
  const canSee = (key) => level(key) !== 'none';

  return [
    { key: 'clinical', label: t('nav_clinical'), visible: canEdit('clinical'),
      render: () => <Clinical accounts={accounts} onAccountsChanged={loadAccounts} /> },
    { key: 'receipt', label: t('nav_receipt'), visible: canEdit('receipts'),
      render: () => <ReceiptForm accounts={accounts} onPosted={() => alert(t('voucher_posted_success_receipt'))} /> },
    { key: 'payment', label: t('nav_payment'), visible: canEdit('payments'),
      render: () => <PaymentForm accounts={accounts} onPosted={() => alert(t('voucher_posted_success_payment'))} /> },
    { key: 'voucher', label: t('nav_voucher'), visible: canEdit('journal'),
      render: () => <VoucherForm accounts={accounts} onPosted={() => alert(t('voucher_posted_success'))} /> },
    { key: 'patients', label: t('nav_patients'), visible: canSee('patients'),
      render: () => <Patients canEdit={canEdit('patients')} onAccountsChanged={loadAccounts} /> },
    { key: 'doctors', label: t('nav_doctors'), visible: canSee('doctors'),
      render: () => <Doctors canEdit={canEdit('doctors')} onAccountsChanged={loadAccounts} /> },
    { key: 'checks', label: t('nav_checks'), visible: canSee('checks'),
      render: () => <Checks canEdit={canEdit('checks')} accounts={accounts} onAccountsChanged={loadAccounts} /> },
    { key: 'ledger', label: t('nav_ledger'), visible: canSee('reports'),
      render: () => <LedgerReport accounts={accounts} /> },
    { key: 'trialBalance', label: t('nav_trial_balance'), visible: canSee('reports'),
      render: () => <TrialBalance /> },
    { key: 'profitLoss', label: t('nav_profit_loss'), visible: canSee('reports'),
      render: () => <ProfitLoss /> },
    { key: 'users', label: t('nav_users'), visible: canEdit('users'),
      render: () => <Users /> },
  ];
}

export default function App() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [tab, setTab] = useState(null);

  const loadAccounts = useCallback(() => {
    if (!user) return;
    api.get('/accounts').then(setAccounts).catch((err) => {
      console.error('فشل جلب الحسابات:', err);
    });
  }, [user]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const allTabs = useMemo(
    () => buildTabs({ t, accounts, loadAccounts, permissions: user?.permissions }),
    [t, accounts, loadAccounts, user]
  );
  const visibleTabs = useMemo(() => allTabs.filter((tb) => tb.visible), [allTabs]);

  // أول ما يسجّل المستخدم دخول، نفتحله أول تبويب مسموح له يشوفه
  useEffect(() => {
    if (user && visibleTabs.length > 0 && !visibleTabs.some((tb) => tb.key === tab)) {
      setTab(visibleTabs[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, visibleTabs]);

  if (!user) return <Login />;

  const activeTab = visibleTabs.find((tb) => tb.key === tab);

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
        {visibleTabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}>{tb.label}</button>
        ))}
      </nav>

      {visibleTabs.length === 0 && <div>—</div>}
      {activeTab && activeTab.render()}
    </div>
  );
}
