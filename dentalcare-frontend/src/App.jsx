import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import { dedupeChartAccounts } from './lib/dedupeList';
import Login from './pages/Login';
import VoucherForm from './components/VoucherForm';
import BankEntryForm from './components/BankEntryForm';
import ReceiptForm from './components/ReceiptForm';
import PaymentForm from './components/PaymentForm';
import PurchaseInvoiceForm from './components/PurchaseInvoiceForm';
import AdjustmentNoteForm from './components/AdjustmentNoteForm';
import LedgerReport from './pages/LedgerReport';
import Patients from './pages/Patients';
import Suppliers from './pages/Suppliers';
import Doctors from './pages/Doctors';
import Employees from './pages/Employees';
import Checks from './pages/Checks';
import TrialBalance from './pages/TrialBalance';
import ProfitLoss from './pages/ProfitLoss';
import Expenses from './pages/Expenses';
import Clinical from './pages/Clinical';
import ClinicalReport from './pages/ClinicalReport';
import Users from './pages/Users';
import JournalBook from './pages/JournalBook';
import SettingsPage from './pages/Settings';
import PlatformAdmin from './pages/PlatformAdmin';
import Currencies from './pages/Currencies';
import CashBoxes from './pages/CashBoxes';
import BanksPage from './pages/BanksPage';
import ExpenseAccounts from './pages/ExpenseAccounts';
import AssetAccounts from './pages/AssetAccounts';
import ChartOfAccounts from './pages/ChartOfAccounts';
import Favorites from './pages/Favorites';
import DocumentWorkspace from './components/DocumentWorkspace';
import LanguageSwitcher from './components/LanguageSwitcher';
import CurrencyDailyConfirm from './components/CurrencyDailyConfirm';
import PartyModal from './components/PartyModal';
import PatientForm from './components/PatientForm';
import SupplierForm from './components/SupplierForm';
import { needsDailyRateConfirm } from './lib/currencyDailyConfirm';
import { DEFAULT_QUICK_ACTIONS, findAccGroupForTab } from './lib/quickActions';

const ROLE_LABEL = {
  OWNER: 'user_role_owner',
  ACCOUNTANT: 'user_role_accountant',
  DOCTOR: 'user_role_doctor',
  RECEPTIONIST: 'user_role_receptionist',
  SUPER_ADMIN: 'user_role_super_admin',
};

const ACC_GROUPS = [
  {
    id: 'favorites',
    labelKey: 'nav_favorites',
    keys: ['favorites'],
    icon: 'fa-solid fa-star',
  },
  {
    id: 'accounts',
    labelKey: 'nav_acc_accounts',
    keys: ['chartTree', 'currencies', 'cashBoxes', 'banks', 'expenseAccounts', 'assetAccounts'],
    subgroups: [
      { id: 'parties', labelKey: 'nav_acc_parties', keys: ['patients', 'suppliers', 'doctors', 'employees'] },
    ],
    icon: 'fa-solid fa-wallet',
  },
  { id: 'docs', labelKey: 'nav_acc_documents', keys: ['receipt', 'payment', 'purchase', 'creditNote', 'debitNote', 'bankEntry', 'voucher'], icon: 'fa-solid fa-file-invoice' },
  { id: 'reports', labelKey: 'nav_acc_reports', keys: ['ledger', 'checks', 'clinicalReport', 'trialBalance', 'profitLoss', 'expenses', 'journalBook'], icon: 'fa-solid fa-chart-pie' },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function firstKey(keys, visible) {
  return keys.find((key) => visible.some((tb) => tb.key === key)) || null;
}

function buildTabs({
  t,
  accounts,
  loadAccounts,
  permissions,
  quickActionIds,
  onFavoriteAction,
  clinicalFocusPatientId,
  onClinicalFocusConsumed,
  onOpenPatientClinical,
}) {
  const level = (key) => permissions?.[key] || 'none';
  const canEdit = (key) => level(key) === 'edit';
  const canSee = (key) => level(key) !== 'none';

  return [
    { key: 'favorites', label: t('nav_favorites'), visible: true,
      render: () => (
        <Favorites
          permissions={permissions}
          quickActionIds={quickActionIds}
          onAction={onFavoriteAction}
        />
      ) },
    { key: 'clinical', label: t('nav_clinical'), visible: canSee('clinical') || canSee('appointments'),
      render: () => (
        <Clinical
          accounts={accounts}
          onAccountsChanged={loadAccounts}
          canEditClinical={canEdit('clinical')}
          canEditAppointments={canEdit('appointments') || canEdit('clinical')}
          canEditPatients={canEdit('patients')}
          focusPatientId={clinicalFocusPatientId}
          onFocusPatientConsumed={onClinicalFocusConsumed}
        />
      ) },
    { key: 'receipt', label: t('nav_receipt'), visible: canEdit('receipts'),
      render: () => (
        <DocumentWorkspace sourceType="RECEIPT" titleKey="nav_receipt" successKey="voucher_posted_success_receipt">
          {({ onPosted }) => <ReceiptForm accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'payment', label: t('nav_payment'), visible: canEdit('payments'),
      render: () => (
        <DocumentWorkspace sourceType="PAYMENT" titleKey="nav_payment" successKey="voucher_posted_success_payment">
          {({ onPosted }) => <PaymentForm accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'purchase', label: t('nav_purchase_invoice'), visible: canEdit('payments'),
      render: () => (
        <DocumentWorkspace sourceType="PURCHASE_INVOICE" titleKey="nav_purchase_invoice" successKey="voucher_posted_success_purchase">
          {({ onPosted }) => <PurchaseInvoiceForm accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'creditNote', label: t('nav_credit_note'), visible: canEdit('receipts') || canEdit('payments') || canEdit('journal'),
      render: () => (
        <DocumentWorkspace sourceType="CREDIT_NOTE" titleKey="nav_credit_note" successKey="voucher_posted_success_credit_note">
          {({ onPosted }) => <AdjustmentNoteForm type="credit" accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'debitNote', label: t('nav_debit_note'), visible: canEdit('receipts') || canEdit('payments') || canEdit('journal'),
      render: () => (
        <DocumentWorkspace sourceType="DEBIT_NOTE" titleKey="nav_debit_note" successKey="voucher_posted_success_debit_note">
          {({ onPosted }) => <AdjustmentNoteForm type="debit" accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'bankEntry', label: t('nav_bank_entry'), visible: canEdit('journal') || canEdit('payments') || canEdit('accounts'),
      render: () => (
        <DocumentWorkspace sourceType="BANK_ENTRY" titleKey="nav_bank_entry" successKey="voucher_posted_success_bank_entry">
          {({ onPosted }) => <BankEntryForm accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'voucher', label: t('nav_voucher'), visible: canEdit('journal'),
      render: () => (
        <DocumentWorkspace sourceType="JOURNAL" titleKey="nav_voucher" successKey="voucher_posted_success">
          {({ onPosted }) => <VoucherForm accounts={accounts} onPosted={onPosted} />}
        </DocumentWorkspace>
      ) },
    { key: 'patients', label: t('nav_patients'), visible: canSee('patients'),
      render: () => (
        <Patients
          canEdit={canEdit('patients')}
          onAccountsChanged={loadAccounts}
          onOpenClinical={onOpenPatientClinical}
        />
      ) },
    { key: 'suppliers', label: t('nav_suppliers'), visible: canSee('payments'),
      render: () => <Suppliers canEdit={canEdit('payments')} onAccountsChanged={loadAccounts} /> },
    { key: 'doctors', label: t('nav_doctors'), visible: canSee('doctors'),
      render: () => <Doctors canEdit={canEdit('doctors')} onAccountsChanged={loadAccounts} /> },
    { key: 'employees', label: t('nav_employees'), visible: canSee('employees'),
      render: () => <Employees canEdit={canEdit('employees')} onAccountsChanged={loadAccounts} /> },
    { key: 'currencies', label: t('nav_currencies'), visible: canSee('accounts'),
      render: () => <Currencies canEdit={canEdit('accounts')} /> },
    { key: 'chartTree', label: t('nav_chart_tree'), visible: canSee('accounts'),
      render: () => <ChartOfAccounts canEdit={canEdit('accounts')} onAccountsChanged={loadAccounts} /> },
    { key: 'cashBoxes', label: t('nav_cash_boxes'), visible: canSee('accounts'),
      render: () => <CashBoxes canEdit={canEdit('accounts')} onAccountsChanged={loadAccounts} /> },
    { key: 'banks', label: t('nav_banks'), visible: canSee('accounts'),
      render: () => <BanksPage canEdit={canEdit('accounts')} onAccountsChanged={loadAccounts} /> },
    { key: 'expenseAccounts', label: t('nav_expense_accounts'), visible: canSee('accounts'),
      render: () => <ExpenseAccounts canEdit={canEdit('accounts')} onAccountsChanged={loadAccounts} /> },
    { key: 'assetAccounts', label: t('nav_asset_accounts'), visible: canSee('accounts'),
      render: () => <AssetAccounts canEdit={canEdit('accounts')} onAccountsChanged={loadAccounts} /> },
    { key: 'checks', label: t('nav_checks'), visible: canSee('checks'),
      render: () => <Checks canEdit={canEdit('checks')} accounts={accounts} onAccountsChanged={loadAccounts} /> },
    { key: 'clinicalReport', label: t('nav_clinical_report'), visible: canSee('reports') || canSee('clinical'),
      render: () => <ClinicalReport /> },
    { key: 'ledger', label: t('nav_ledger'), visible: canSee('reports'),
      render: () => <LedgerReport accounts={accounts} /> },
    { key: 'trialBalance', label: t('nav_trial_balance'), visible: canSee('reports'),
      render: () => <TrialBalance /> },
    { key: 'profitLoss', label: t('nav_profit_loss'), visible: canSee('reports'),
      render: () => <ProfitLoss /> },
    { key: 'expenses', label: t('nav_expenses'), visible: canSee('reports'),
      render: () => <Expenses /> },
    { key: 'journalBook', label: t('nav_journal_book'), visible: canSee('reports'),
      render: () => <JournalBook /> },
    { key: 'users', label: t('nav_users'), visible: canEdit('users'),
      render: () => <Users /> },
    { key: 'settings', label: t('nav_settings'), visible: true,
      render: () => <SettingsPage onAccountsChanged={loadAccounts} /> },
  ];
}

export default function App() {
  const { t } = useTranslation();
  const { user, logout, refreshUser, exitSupportSession, avatarUrl } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [section, setSection] = useState('clinical');
  const [accGroup, setAccGroup] = useState('favorites');
  const [accSubGroup, setAccSubGroup] = useState(null); // e.g. 'parties' under accounts
  const [tab, setTab] = useState(null);
  const [showCurrencyDaily, setShowCurrencyDaily] = useState(false);
  const [quickModal, setQuickModal] = useState(null); // 'patient' | 'supplier' | null
  const [clinicalFocusPatientId, setClinicalFocusPatientId] = useState(null);

  const loadAccounts = useCallback(() => {
    if (!user || user.role === 'SUPER_ADMIN') return;
    api.get('/accounts').then((rows) => {
      setAccounts(dedupeChartAccounts(Array.isArray(rows) ? rows : []));
    }).catch((err) => {
      console.error('فشل جلب الحسابات:', err);
    });
  }, [user]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    setShowCurrencyDaily(needsDailyRateConfirm(user));
  }, [user]);

  const quickActionIds = user?.preferences?.quickActions || DEFAULT_QUICK_ACTIONS;

  const navigateAccountingTab = useCallback((tabKey) => {
    const loc = findAccGroupForTab(ACC_GROUPS, tabKey);
    setSection('accounting');
    if (loc) {
      setAccGroup(loc.groupId);
      setAccSubGroup(loc.subGroupId);
    }
    setTab(tabKey);
  }, []);

  const handleFavoriteAction = useCallback((action) => {
    if (!action) return;
    if (action.kind === 'modal') {
      if (action.modal === 'currencyDaily') {
        setShowCurrencyDaily(true);
        return;
      }
      setQuickModal(action.modal);
      return;
    }
    if (action.kind === 'section') {
      setSection(action.section);
      setTab(action.tab);
      return;
    }
    if (action.kind === 'tab') {
      navigateAccountingTab(action.tab);
    }
  }, [navigateAccountingTab]);

  const openPatientInClinical = useCallback((patientId) => {
    if (!patientId) return;
    const perms = user?.permissions || {};
    const canClinicalPanel = (perms.clinical || 'none') !== 'none'
      || (perms.appointments || 'none') !== 'none';
    if (!canClinicalPanel) return;
    setClinicalFocusPatientId(patientId);
    setSection('clinical');
    setTab('clinical');
  }, [user]);

  const clearClinicalFocusPatient = useCallback(() => {
    setClinicalFocusPatientId(null);
  }, []);

  const allTabs = useMemo(
    () => buildTabs({
      t,
      accounts,
      loadAccounts,
      permissions: user?.permissions,
      quickActionIds,
      onFavoriteAction: handleFavoriteAction,
      clinicalFocusPatientId,
      onClinicalFocusConsumed: clearClinicalFocusPatient,
      onOpenPatientClinical: openPatientInClinical,
    }),
    [
      t,
      accounts,
      loadAccounts,
      user,
      quickActionIds,
      handleFavoriteAction,
      clinicalFocusPatientId,
      clearClinicalFocusPatient,
      openPatientInClinical,
    ]
  );
  const visibleTabs = useMemo(() => allTabs.filter((tb) => tb.visible), [allTabs]);

  const canClinical = visibleTabs.some((tb) => tb.key === 'clinical');
  const accGroupsVisible = ACC_GROUPS.map((group) => {
    const directItems = visibleTabs.filter((tb) => group.keys.includes(tb.key));
    const subgroups = (group.subgroups || [])
      .map((sg) => ({
        ...sg,
        items: visibleTabs.filter((tb) => sg.keys.includes(tb.key)),
      }))
      .filter((sg) => sg.items.length > 0);
    return {
      ...group,
      items: directItems,
      subgroups,
    };
  }).filter((group) => group.items.length > 0 || group.subgroups.length > 0);
  const canPatients = visibleTabs.some((tb) => tb.key === 'patients');
  const canAccounting = accGroupsVisible.length > 0;
  const canUsers = visibleTabs.some((tb) => tb.key === 'users');
  const adminTabs = visibleTabs.filter((tb) => tb.key === 'users' || tb.key === 'settings');

  const topSections = [
    { id: 'clinical', label: t('nav_section_clinical'), show: canClinical, icon: 'fa-solid fa-user-doctor', tone: 'teal' },
    { id: 'patients', label: t('nav_section_patients'), show: canPatients, icon: 'fa-solid fa-users', tone: 'teal' },
    { id: 'accounting', label: t('nav_section_accounting'), show: canAccounting, icon: 'fa-solid fa-calculator', tone: 'teal' },
    { id: 'settings', label: t('nav_settings'), show: true, icon: 'fa-solid fa-gear', tone: 'muted' },
  ].filter((s) => s.show);

  function openSection(id) {
    setSection(id);
    if (id === 'clinical') {
      setTab('clinical');
      return;
    }
    if (id === 'patients') {
      setTab('patients');
      return;
    }
    if (id === 'settings') {
      setTab('settings');
      return;
    }
    const group = accGroupsVisible.find((g) => g.id === 'favorites') || accGroupsVisible[0];
    if (group) {
      setAccGroup(group.id);
      if (group.items[0]) {
        setAccSubGroup(null);
        setTab(group.items[0].key);
      } else if (group.subgroups[0]?.items[0]) {
        setAccSubGroup(group.subgroups[0].id);
        setTab(group.subgroups[0].items[0].key);
      }
    }
  }

  function openAccGroup(id) {
    const group = accGroupsVisible.find((g) => g.id === id);
    if (!group) return;
    setAccGroup(id);
    if (group.items[0]) {
      setAccSubGroup(null);
      setTab(group.items[0].key);
    } else if (group.subgroups[0]?.items[0]) {
      setAccSubGroup(group.subgroups[0].id);
      setTab(group.subgroups[0].items[0].key);
    }
  }

  function openAccDirectTab(key) {
    setAccSubGroup(null);
    setTab(key);
  }

  function openAccSubGroup(subGroupId) {
    const group = accGroupsVisible.find((g) => g.id === accGroup);
    const sg = group?.subgroups?.find((s) => s.id === subGroupId);
    if (!sg?.items?.[0]) return;
    setAccSubGroup(subGroupId);
    setTab(sg.items[0].key);
  }

  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN') return;
    const allowed = new Set(visibleTabs.map((tb) => tb.key));
    if (tab && allowed.has(tab)) return;
    const preferred = firstKey(
      ['clinical', 'receipt', 'payment', 'voucher', 'patients', 'settings'],
      visibleTabs
    );
    if (!preferred) return;
    if (preferred === 'clinical') openSection('clinical');
    else if (preferred === 'settings') openSection('settings');
    else if (preferred === 'patients') openSection('patients');
    else openSection('accounting');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, visibleTabs]);

  if (!user) return <Login />;

  const activeTab = visibleTabs.find((tb) => tb.key === tab);
  const isPlatform = user.role === 'SUPER_ADMIN' && !user.supportMode;
  const isSupportMode = Boolean(user.supportMode);
  const currentAccGroup = accGroupsVisible.find((g) => g.id === accGroup) || accGroupsVisible[0];
  const currentAccSubGroup = currentAccGroup?.subgroups?.find((sg) => sg.id === accSubGroup) || null;
  const accountsSecondNavActive = accSubGroup
    || (currentAccGroup?.items?.some((tb) => tb.key === tab) ? tab : null);
  return (
    <div className="dc-app">
      {showCurrencyDaily && (
        <CurrencyDailyConfirm
          user={user}
          onConfirmed={() => setShowCurrencyDaily(false)}
        />
      )}
      <header className={`dc-chrome no-print${isPlatform ? ' is-simple' : ''}`}>
        <div className="dc-hello">
          <div className="dc-logo"><i className="fa-solid fa-tooth" /></div>
          <div>
            <div className="dc-hello-kicker">
              {isSupportMode ? t('platform_support_badge') : t('hello_office')}
            </div>
            <div className="dc-hello-name">
              {isSupportMode && user.clinicName ? user.clinicName : user.name}
            </div>
            <div className="dc-hello-role">
              {isSupportMode
                ? t('platform_support_as_admin')
                : t(ROLE_LABEL[user.role] || 'user_role')}
            </div>
          </div>
        </div>
        {!isPlatform && (
          <nav className="dc-nav-pills">
            {topSections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`dc-section tone-${s.tone}${section === s.id ? ' is-active' : ''}`}
                onClick={() => openSection(s.id)}
              >
                <i className={s.icon} />
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <div className="dc-toolbar">
          {isSupportMode && (
            <button type="button" className="dc-ghost" onClick={exitSupportSession}>
              <i className="fa-solid fa-arrow-right-from-bracket" /> {t('platform_support_exit')}
            </button>
          )}
          <LanguageSwitcher />
          <div className="dc-avatar" title={user.username}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="dc-avatar-img" />
            ) : (
              initials(user.name)
            )}
          </div>
          <button type="button" className="dc-ghost" onClick={logout}>
            <i className="fa-solid fa-right-from-bracket" /> {t('logout')}
          </button>
        </div>
      </header>

      {isSupportMode && (
        <div className="dc-support-banner no-print">
          <span>
            <i className="fa-solid fa-headset" />{' '}
            {t('platform_support_banner', { name: user.clinicName || '—' })}
          </span>
          <button type="button" onClick={exitSupportSession}>{t('platform_support_exit')}</button>
        </div>
      )}

      {!isPlatform && section === 'accounting' && currentAccGroup && (
        <>
          <nav className="dc-subnav no-print">
            {accGroupsVisible.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`dc-chip ${group.id}${accGroup === group.id ? ' is-active' : ''}`}
                onClick={() => openAccGroup(group.id)}
              >
                <i className={group.icon} />
                {t(group.labelKey)}
              </button>
            ))}
          </nav>
          <nav className="dc-subnav dc-subnav-2 no-print">
            {currentAccGroup.items.map((tb) => (
              <button
                key={tb.key}
                type="button"
                className={`dc-chip${accountsSecondNavActive === tb.key ? ' is-active' : ''}`}
                onClick={() => openAccDirectTab(tb.key)}
              >
                {tb.label}
              </button>
            ))}
            {(currentAccGroup.subgroups || []).map((sg) => (
              <button
                key={sg.id}
                type="button"
                className={`dc-chip parties${accSubGroup === sg.id ? ' is-active' : ''}`}
                onClick={() => openAccSubGroup(sg.id)}
              >
                {t(sg.labelKey)}
              </button>
            ))}
          </nav>
          {currentAccSubGroup && (
            <nav className="dc-subnav dc-subnav-3 no-print">
              {currentAccSubGroup.items.map((tb) => (
                <button
                  key={tb.key}
                  type="button"
                  className={`dc-chip${tab === tb.key ? ' is-active' : ''}`}
                  onClick={() => setTab(tb.key)}
                >
                  {tb.label}
                </button>
              ))}
            </nav>
          )}
        </>
      )}

      {!isPlatform && section === 'settings' && (
        <nav className="dc-subnav no-print">
          {adminTabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              className={`dc-chip${tab === tb.key ? ' is-active' : ''}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </nav>
      )}

      <main className={`dc-main${(!isPlatform && tab === 'clinical') ? ' is-clinical' : ''}`}>
        {(!isPlatform && tab === 'clinical') ? (
          activeTab && activeTab.render()
        ) : (
          <div className="dc-panel">
            {isPlatform && <PlatformAdmin />}
            {!isPlatform && activeTab && activeTab.render()}
          </div>
        )}
      </main>

      <PartyModal
        open={quickModal === 'patient'}
        title={t('fav_new_patient')}
        onClose={() => setQuickModal(null)}
      >
        <PatientForm
          onRegistered={async () => {
            setQuickModal(null);
            await loadAccounts();
            await refreshUser?.();
          }}
        />
      </PartyModal>

      <PartyModal
        open={quickModal === 'supplier'}
        title={t('fav_new_supplier')}
        onClose={() => setQuickModal(null)}
      >
        <SupplierForm
          onSaved={async () => {
            setQuickModal(null);
            await loadAccounts();
          }}
        />
      </PartyModal>
    </div>
  );
}
