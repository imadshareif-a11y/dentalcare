import { useTranslation } from 'react-i18next';

const TILE_ICONS = {
  chartTree: 'fa-solid fa-sitemap',
  currencies: 'fa-solid fa-coins',
  cashBoxes: 'fa-solid fa-cash-register',
  banks: 'fa-solid fa-building-columns',
  expenseAccounts: 'fa-solid fa-receipt',
  assetAccounts: 'fa-solid fa-building',
  patients: 'fa-solid fa-users',
  suppliers: 'fa-solid fa-truck',
  doctors: 'fa-solid fa-user-doctor',
  employees: 'fa-solid fa-id-badge',
  receipt: 'fa-solid fa-file-invoice-dollar',
  payment: 'fa-solid fa-money-bill-transfer',
  purchase: 'fa-solid fa-cart-shopping',
  creditNote: 'fa-solid fa-file-circle-minus',
  debitNote: 'fa-solid fa-file-circle-plus',
  bankEntry: 'fa-solid fa-building-columns',
  voucher: 'fa-solid fa-book',
  ledger: 'fa-solid fa-scroll',
  checks: 'fa-solid fa-money-check',
  clinicalReport: 'fa-solid fa-notes-medical',
  trialBalance: 'fa-solid fa-scale-balanced',
  profitLoss: 'fa-solid fa-chart-line',
  expenses: 'fa-solid fa-chart-pie',
  journalBook: 'fa-solid fa-book-open',
};

export function accountsHubIcon(key) {
  return TILE_ICONS[key] || 'fa-solid fa-folder-open';
}

export default function AccountsHub({
  tiles = [],
  onOpen,
  titleKey = 'accounts_hub_title',
  hintKey = 'accounts_hub_hint',
  emptyKey = 'accounts_hub_empty',
}) {
  const { t } = useTranslation();

  return (
    <div className="dc-favorites">
      <h3>{t(titleKey)}</h3>
      <p className="dc-muted text-sm">{t(hintKey)}</p>

      {tiles.length === 0 ? (
        <div className="dc-favorites-empty">{t(emptyKey)}</div>
      ) : (
        <div className="dc-favorites-grid">
          {tiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className="dc-fav-tile"
              onClick={() => onOpen?.(tile.key)}
            >
              <span className="dc-fav-icon">
                <i className={tile.icon || accountsHubIcon(tile.key)} />
              </span>
              <span className="dc-fav-label">{tile.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
