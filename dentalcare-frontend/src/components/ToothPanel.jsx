import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TOOTH_CONDITIONS, conditionLabelKey, inferConditionFromName } from '../lib/toothConditions';

export default function ToothPanel({
  tooth,
  toothState,
  planItemsForTooth,
  toothHistory,
  catalog,
  money,
  date,
  canEdit,
  saving,
  onSaveCurrent,
  onAddPlanned,
  onRemovePlanned,
  onSavePlan,
  planNotes,
  onPlanNotesChange,
  allPlanItems,
}) {
  const { t } = useTranslation();
  const [currentCode, setCurrentCode] = useState(toothState?.current || 'HEALTHY');
  const [currentNotes, setCurrentNotes] = useState(toothState?.currentNotes || '');
  const [draftName, setDraftName] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [draftCondition, setDraftCondition] = useState('FILLING');

  if (!tooth) return null;

  const planned = planItemsForTooth || [];

  function handleCatalogPick(item) {
    setDraftName(item.name);
    setDraftCost(String(item.price));
    const code = item.condition_code || inferConditionFromName(item.name);
    if (code) setDraftCondition(code);
  }

  function handleAddPlanned() {
    const name = draftName.trim();
    const cost = Number(draftCost);
    if (!name) return;
    onAddPlanned({
      tooth: String(tooth),
      conditionCode: draftCondition,
      name,
      cost: Number.isFinite(cost) ? cost : 0,
    });
    setDraftName('');
    setDraftCost('');
  }

  return (
    <div className="dc-tooth-panel">
      <h4 className="dc-tooth-panel-title">{t('tooth_panel_title', { tooth })}</h4>

      <section className="dc-tooth-panel-section">
        <h5>{t('tooth_panel_current')}</h5>
        <div className="dc-tooth-panel-current-row">
          <select
            value={currentCode || 'HEALTHY'}
            onChange={(e) => setCurrentCode(e.target.value)}
            disabled={!canEdit || saving}
          >
            {TOOTH_CONDITIONS.map((c) => (
              <option key={c.code} value={c.code}>{t(conditionLabelKey(c.code))}</option>
            ))}
          </select>
          {canEdit && (
            <button
              type="button"
              className="dc-success"
              disabled={saving}
              onClick={() => onSaveCurrent(currentCode, currentNotes)}
            >
              {t('tooth_panel_save_current')}
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder={t('tooth_panel_current_notes')}
          value={currentNotes}
          onChange={(e) => setCurrentNotes(e.target.value)}
          disabled={!canEdit || saving}
        />
      </section>

      <section className="dc-tooth-panel-section">
        <h5>{t('tooth_panel_planned')}</h5>
        {planned.length === 0 && <p className="dc-muted text-sm">{t('tooth_panel_planned_empty')}</p>}
        <ul className="dc-tooth-plan-list">
          {planned.map((item) => (
            <li key={item.id || `${item.name}-${item.sortOrder}`} className="dc-tooth-plan-item">
              <span>
                <strong>{t(conditionLabelKey(item.conditionCode))}</strong>
                {' — '}
                {item.name}
                <span className="dc-money"> ({money(item.cost)})</span>
              </span>
              {canEdit && item.id && (
                <button type="button" className="dc-danger" onClick={() => onRemovePlanned(item.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="dc-tooth-plan-add">
            {catalog.length > 0 && (
              <div className="dc-tooth-plan-catalog">
                {catalog.slice(0, 6).map((item) => (
                  <button key={item.id} type="button" className="dc-ghost-light" onClick={() => handleCatalogPick(item)}>
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            <div className="dc-form-row">
              <select value={draftCondition} onChange={(e) => setDraftCondition(e.target.value)}>
                {TOOTH_CONDITIONS.filter((c) => c.code !== 'HEALTHY').map((c) => (
                  <option key={c.code} value={c.code}>{t(conditionLabelKey(c.code))}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('clinical_treatment_name')}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t('clinical_treatment_cost')}
                value={draftCost}
                onChange={(e) => setDraftCost(e.target.value)}
              />
              <button type="button" onClick={handleAddPlanned}>{t('tooth_panel_add_planned')}</button>
            </div>
          </div>
        )}
      </section>

      {canEdit && (
        <div className="dc-tooth-panel-save-plan">
          <label className="dc-muted text-sm">{t('tooth_panel_plan_notes')}</label>
          <textarea
            rows={2}
            value={planNotes || ''}
            onChange={(e) => onPlanNotesChange?.(e.target.value)}
            disabled={saving}
            placeholder={t('tooth_panel_plan_notes')}
          />
          <button
            type="button"
            className="dc-clinical-add-btn"
            disabled={saving || (allPlanItems || []).length === 0}
            onClick={onSavePlan}
          >
            {saving ? t('tooth_panel_saving') : t('tooth_panel_save_plan')}
          </button>
        </div>
      )}

      <section className="dc-tooth-panel-section">
        <h5>{t('tooth_panel_history')}</h5>
        {toothHistory.length === 0 ? (
          <p className="dc-muted text-sm">{t('clinical_tooth_history_empty')}</p>
        ) : (
          <ul className="dc-tooth-history-list">
            {toothHistory.map((row, i) => (
              <li key={`${row.sessionId}-${i}`} className="dc-tooth-history-item">
                <strong className="dc-tooth-history-name">{row.name}</strong>
                <span className="dc-tooth-history-meta">{row.doctorName || t('clinical_tooth_history_no_doctor')}</span>
                <span className="dc-tooth-history-meta">{date(row.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
