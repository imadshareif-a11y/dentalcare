import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_QUICK_ACTIONS, resolveQuickActions } from '../lib/quickActions';

function reorderList(list, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return list;
  const fromIdx = list.indexOf(fromId);
  const toIdx = list.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return list;
  const next = [...list];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromId);
  return next;
}

function moveItem(list, id, delta) {
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const target = idx + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item);
  return next;
}

export default function FavoritesSettings({
  quickActions,
  onChange,
  availableActions,
  permissions,
  onSave,
  saving,
}) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const catalogById = useMemo(
    () => new Map(availableActions.map((a) => [a.id, a])),
    [availableActions]
  );

  const activeItems = useMemo(
    () => quickActions
      .map((id) => catalogById.get(id))
      .filter(Boolean),
    [quickActions, catalogById]
  );

  const inactiveItems = useMemo(
    () => availableActions.filter((a) => !quickActions.includes(a.id)),
    [availableActions, quickActions]
  );

  const previewActions = resolveQuickActions(quickActions, permissions);

  function addAction(id) {
    if (quickActions.includes(id)) return;
    onChange([...quickActions, id]);
  }

  function removeAction(id) {
    onChange(quickActions.filter((x) => x !== id));
  }

  function handleDrop(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    onChange(reorderList(quickActions, fromId, toId));
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <form onSubmit={onSave} className="dc-fav-settings">
      <div className="dc-fav-settings-layout">
        <section className="dc-fav-settings-preview-card">
          <div className="dc-fav-settings-section-head">
            <h5>{t('settings_favorites_preview_title')}</h5>
            <span className="dc-fav-settings-count">{previewActions.length}</span>
          </div>
          <p className="dc-muted text-sm">{t('settings_favorites_preview_hint')}</p>
          {previewActions.length === 0 ? (
            <div className="dc-favorites-empty dc-fav-settings-preview-empty">
              {t('settings_favorites_preview_empty')}
            </div>
          ) : (
            <div className="dc-fav-settings-preview-grid">
              {previewActions.map((action, index) => (
                <div key={action.id} className="dc-fav-settings-preview-tile">
                  <span className="dc-fav-settings-preview-rank">{index + 1}</span>
                  <span className="dc-fav-icon"><i className={action.icon} /></span>
                  <span className="dc-fav-label">{t(action.labelKey)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dc-fav-settings-active-card">
          <div className="dc-fav-settings-section-head">
            <h5>{t('settings_favorites_active_title')}</h5>
            <span className="dc-fav-settings-count">{activeItems.length}</span>
          </div>
          <p className="dc-muted text-sm">{t('settings_favorites_active_hint')}</p>

          {activeItems.length === 0 ? (
            <div className="dc-favorites-empty">{t('settings_favorites_active_empty')}</div>
          ) : (
            <ul className="dc-fav-settings-active-list">
              {activeItems.map((action, index) => {
                const isDragging = dragId === action.id;
                const isOver = dragOverId === action.id && dragId && dragId !== action.id;
                return (
                  <li
                    key={action.id}
                    className={`dc-fav-settings-active-row${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setDragId(action.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', action.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      if (!dragId || dragId === action.id) return;
                      e.preventDefault();
                      setDragOverId(action.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === action.id) setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = e.dataTransfer.getData('text/plain') || dragId;
                      handleDrop(fromId, action.id);
                    }}
                  >
                    <span className="dc-fav-settings-grip" title={t('settings_favorites_drag_hint')}>
                      <i className="fa-solid fa-grip-vertical" />
                    </span>
                    <span className="dc-fav-settings-rank">{index + 1}</span>
                    <span className="dc-fav-settings-active-icon"><i className={action.icon} /></span>
                    <span className="dc-fav-settings-active-label">{t(action.labelKey)}</span>
                    <div className="dc-fav-settings-active-actions">
                      <button
                        type="button"
                        className="dc-fav-settings-icon-btn"
                        onClick={() => onChange(moveItem(quickActions, action.id, -1))}
                        disabled={index === 0}
                        title={t('settings_favorites_move_up')}
                      >
                        <i className="fa-solid fa-chevron-up" />
                      </button>
                      <button
                        type="button"
                        className="dc-fav-settings-icon-btn"
                        onClick={() => onChange(moveItem(quickActions, action.id, 1))}
                        disabled={index === activeItems.length - 1}
                        title={t('settings_favorites_move_down')}
                      >
                        <i className="fa-solid fa-chevron-down" />
                      </button>
                      <button
                        type="button"
                        className="dc-fav-settings-icon-btn is-danger"
                        onClick={() => removeAction(action.id)}
                        title={t('settings_favorites_remove')}
                      >
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dc-fav-settings-pool-card">
          <div className="dc-fav-settings-section-head">
            <h5>{t('settings_favorites_available_title')}</h5>
            <span className="dc-fav-settings-count">{inactiveItems.length}</span>
          </div>
          <p className="dc-muted text-sm">{t('settings_favorites_available_hint')}</p>

          {inactiveItems.length === 0 ? (
            <div className="dc-muted text-sm">{t('settings_favorites_available_empty')}</div>
          ) : (
            <div className="dc-fav-settings-pool-grid">
              {inactiveItems.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="dc-fav-settings-pool-tile"
                  onClick={() => addAction(action.id)}
                >
                  <span className="dc-fav-icon"><i className={action.icon} /></span>
                  <span className="dc-fav-label">{t(action.labelKey)}</span>
                  <span className="dc-fav-settings-pool-add">
                    <i className="fa-solid fa-plus" /> {t('settings_favorites_add')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="dc-fav-settings-footer">
        <button
          type="button"
          className="dc-ghost"
          onClick={() => onChange(
            DEFAULT_QUICK_ACTIONS.filter((id) => catalogById.has(id))
          )}
          disabled={saving}
        >
          {t('settings_favorites_reset')}
        </button>
        <button type="submit" disabled={saving || quickActions.length === 0}>
          {saving ? t('party_saving') : t('settings_favorites_save')}
        </button>
      </div>
    </form>
  );
}
