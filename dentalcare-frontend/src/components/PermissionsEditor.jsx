// components/PermissionsEditor.jsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** مجموعات مرتّبة — كل مفتاح صلاحية يغطي أقسامًا محددة في النظام */
const PERMISSION_GROUPS = [
  {
    id: 'clinic',
    tone: 'teal',
    icon: 'fa-solid fa-stethoscope',
    keys: ['clinical', 'appointments', 'patients', 'doctors'],
  },
  {
    id: 'finance',
    tone: 'sky',
    icon: 'fa-solid fa-file-invoice-dollar',
    keys: ['receipts', 'payments', 'journal', 'openingBalance', 'checks'],
  },
  {
    id: 'accounts',
    tone: 'amber',
    icon: 'fa-solid fa-wallet',
    keys: ['accounts'],
  },
  {
    id: 'administration',
    tone: 'indigo',
    icon: 'fa-solid fa-gauge-high',
    keys: ['admin', 'reports', 'employees'],
  },
  {
    id: 'system',
    tone: 'violet',
    icon: 'fa-solid fa-shield-halved',
    keys: ['users'],
  },
];

const LEVELS = [
  { id: 'none', shortKey: 'permission_level_short_none' },
  { id: 'view', shortKey: 'permission_level_short_view' },
  { id: 'edit', shortKey: 'permission_level_short_edit' },
];

export default function PermissionsEditor({
  permissionKeys,
  levels = ['none', 'view', 'edit'],
  permissions,
  onChange,
}) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const known = new Set(permissionKeys || []);
    const built = PERMISSION_GROUPS.map((g) => ({
      ...g,
      keys: g.keys.filter((k) => known.has(k)),
    })).filter((g) => g.keys.length > 0);

    const placed = new Set(built.flatMap((g) => g.keys));
    const leftovers = (permissionKeys || []).filter((k) => !placed.has(k));
    if (leftovers.length > 0) {
      built.push({
        id: 'other',
        tone: 'slate',
        icon: 'fa-solid fa-ellipsis',
        keys: leftovers,
      });
    }
    return built;
  }, [permissionKeys]);

  const allowedLevels = LEVELS.filter((l) => levels.includes(l.id));

  function updateKey(key, value) {
    onChange({ ...permissions, [key]: value });
  }

  function setGroupLevel(groupKeys, value) {
    const next = { ...permissions };
    for (const key of groupKeys) next[key] = value;
    onChange(next);
  }

  return (
    <div className="dc-perms">
      <div className="dc-perms-legend">
        {allowedLevels.map((lvl) => (
          <span key={lvl.id} className={`dc-perms-legend-item is-${lvl.id}`}>
            <i className={`dc-perms-dot is-${lvl.id}`} aria-hidden />
            {t(`permission_level_${lvl.id}`)}
          </span>
        ))}
      </div>

      <div className="dc-perms-groups">
        {groups.map((group) => (
          <section key={group.id} className={`dc-perms-group tone-${group.tone}`}>
            <header className="dc-perms-group-head">
              <div className="dc-perms-group-title">
                <i className={group.icon} aria-hidden />
                <div>
                  <strong>{t(`permission_group_${group.id}`)}</strong>
                  {t(`permission_group_${group.id}_hint`, { defaultValue: '' }) && (
                    <p className="dc-perms-group-hint">{t(`permission_group_${group.id}_hint`)}</p>
                  )}
                </div>
              </div>
              <div className="dc-perms-group-bulk" role="group" aria-label={t('permissions_set_group')}>
                {allowedLevels.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    className={`dc-perms-bulk is-${lvl.id}`}
                    title={t(`permission_level_${lvl.id}`)}
                    onClick={() => setGroupLevel(group.keys, lvl.id)}
                  >
                    {t(lvl.shortKey)}
                  </button>
                ))}
              </div>
            </header>

            <ul className="dc-perms-rows">
              {group.keys.map((key) => {
                const value = permissions[key] || 'none';
                const hintKey = `permission_${key}_hint`;
                const hint = t(hintKey, { defaultValue: '' });
                return (
                  <li key={key} className={`dc-perms-row is-${value}`}>
                    <div className="dc-perms-label-block">
                      <span className="dc-perms-label">{t(`permission_${key}`)}</span>
                      {hint && hint !== hintKey && (
                        <span className="dc-perms-key-hint">{hint}</span>
                      )}
                    </div>
                    <div className="dc-perms-seg" role="group" aria-label={t(`permission_${key}`)}>
                      {allowedLevels.map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          className={`dc-perms-seg-btn is-${lvl.id}${value === lvl.id ? ' is-active' : ''}`}
                          aria-pressed={value === lvl.id}
                          onClick={() => updateKey(key, lvl.id)}
                        >
                          {t(lvl.shortKey)}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
