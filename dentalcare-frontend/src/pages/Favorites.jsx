import { useTranslation } from 'react-i18next';
import { resolveQuickActions } from '../lib/quickActions';

export default function Favorites({ permissions, quickActionIds, onAction }) {
  const { t } = useTranslation();
  const actions = resolveQuickActions(quickActionIds, permissions);

  return (
    <div className="dc-favorites">
      <h3>{t('favorites_page_title')}</h3>
      <p className="dc-muted text-sm">{t('favorites_hint')}</p>

      {actions.length === 0 ? (
        <div className="dc-favorites-empty">{t('favorites_empty')}</div>
      ) : (
        <div className="dc-favorites-grid">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="dc-fav-tile"
              onClick={() => onAction?.(action)}
            >
              <span className="dc-fav-icon"><i className={action.icon} /></span>
              <span className="dc-fav-label">{t(action.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
