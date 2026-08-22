import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TOOTH_CONDITIONS, conditionLabel, inferConditionFromName } from '../lib/toothConditions';
import ClinicNumberInput from './ClinicNumberInput';

export default function ToothPanel({
  tooth,
  toothState,
  planItemsForTooth,
  toothHistory,
  conditions,
  catalog,
  doctors = [],
  defaultDoctorId = '',
  money,
  date,
  canEdit,
  saving,
  onSaveCurrent,
  onAddPlanned,
  onRemovePlanned,
  onUpdatePlanned,
  onBookPlanItem,
  onCompletePlanned,
  onSavePlan,
  planNotes,
  onPlanNotesChange,
  allPlanItems,
}) {
  const { t, i18n } = useTranslation();
  const conditionList = (conditions && conditions.length) ? conditions : TOOTH_CONDITIONS;
  const [currentCode, setCurrentCode] = useState(toothState?.current || 'HEALTHY');
  const [currentNotes, setCurrentNotes] = useState(toothState?.currentNotes || '');
  const [draftName, setDraftName] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [draftCatalogId, setDraftCatalogId] = useState('');
  const [draftCondition, setDraftCondition] = useState('');
  const [draftDoctorId, setDraftDoctorId] = useState(defaultDoctorId || '');
  const [addError, setAddError] = useState(null);

  useEffect(() => {
    setDraftDoctorId((prev) => prev || defaultDoctorId || '');
  }, [defaultDoctorId]);

  if (!tooth) return null;

  const planned = planItemsForTooth || [];

  function handleCatalogPick(item) {
    setDraftName(item.name);
    setDraftCost(String(item.price));
    setDraftCatalogId(item.id || '');
    setDraftCondition(item.condition_code || inferConditionFromName(item.name) || '');
  }

  function handleAddPlanned() {
    const name = draftName.trim();
    const cost = Number(draftCost);
    if (!name) return;
    if (!draftDoctorId) {
      setAddError(t('clinical_plan_doctor_required'));
      return;
    }
    const doctor = doctors.find((d) => d.id === draftDoctorId);
    const conditionCode = draftCondition
      || inferConditionFromName(name)
      || 'FILLING';
    setAddError(null);
    onAddPlanned({
      tooth: String(tooth),
      conditionCode,
      name,
      cost: Number.isFinite(cost) ? cost : 0,
      catalogId: draftCatalogId || undefined,
      doctorId: draftDoctorId,
      doctorName: doctor?.name || null,
    });
    setDraftName('');
    setDraftCost('');
    setDraftCatalogId('');
    setDraftCondition('');
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
            {conditionList.map((c) => {
              const code = c.code || c;
              return (
                <option key={code} value={code}>
                  {conditionLabel(c, t, i18n.language)}
                </option>
              );
            })}
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
              <span className="dc-tooth-plan-item-main">
                {canEdit && onUpdatePlanned ? (
                  <select
                    className="dc-tooth-plan-doctor-select"
                    value={item.doctorId ? String(item.doctorId) : ''}
                    onChange={(e) => {
                      const doctorId = e.target.value || '';
                      const doctor = doctors.find((d) => String(d.id) === String(doctorId));
                      onUpdatePlanned(item.id, {
                        doctorId: doctorId || null,
                        doctorName: doctor?.name || null,
                      });
                    }}
                    disabled={saving || item.status === 'COMPLETED'}
                    aria-label={t('clinical_select_doctor')}
                  >
                    <option value="">{t('clinical_select_doctor')}</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={String(d.id)}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="dc-tooth-plan-doctor-name">
                    {item.doctorName || t('clinical_select_doctor')}
                  </span>
                )}
                <strong className="dc-tooth-plan-treatment">{item.name}</strong>
                {item.status === 'IN_PROGRESS' && (
                  <span className="dc-plan-status-badge">{t('clinical_plan_status_in_progress')}</span>
                )}
                <span className="dc-money dc-tooth-plan-cost">
                  {Number(item.billedAmount) > 0
                    ? t('clinical_plan_remaining_of', {
                      remaining: money(item.remainingCost ?? item.cost),
                      total: money(item.cost),
                    })
                    : money(item.cost)}
                </span>
              </span>
              <span className="dc-tooth-plan-item-actions">
                {canEdit && onBookPlanItem && (item.status === 'PLANNED' || item.status === 'IN_PROGRESS') && (
                  <button
                    type="button"
                    className="dc-ghost"
                    title={t('clinical_plan_book_appointment')}
                    onClick={() => onBookPlanItem(item)}
                  >
                    <i className="fa-solid fa-calendar-plus" />
                  </button>
                )}
                {canEdit && onCompletePlanned && (item.status === 'PLANNED' || item.status === 'IN_PROGRESS')
                  && item.id && !String(item.id).startsWith('draft-') && (
                  <button
                    type="button"
                    className="dc-ghost"
                    title={t('clinical_plan_mark_complete')}
                    onClick={() => onCompletePlanned(item)}
                    disabled={saving}
                  >
                    <i className="fa-solid fa-check" />
                  </button>
                )}
                {canEdit && item.id && (
                  <button type="button" className="dc-danger" onClick={() => onRemovePlanned(item.id)}>×</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="dc-tooth-plan-add">
            {catalog.length > 0 && (
              <div className="dc-tooth-plan-catalog">
                {catalog.map((item) => (
                  <button key={item.id} type="button" className="dc-ghost-light" onClick={() => handleCatalogPick(item)}>
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            <div className="dc-form-row dc-tooth-plan-add-row">
              <select
                value={draftDoctorId}
                onChange={(e) => {
                  setDraftDoctorId(e.target.value);
                  setAddError(null);
                }}
                required
                aria-label={t('clinical_select_doctor')}
              >
                <option value="">{t('clinical_select_doctor')}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('clinical_treatment_name')}
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setDraftCatalogId('');
                  setDraftCondition('');
                }}
              />
              <ClinicNumberInput
                showCurrency
                className="dc-tooth-plan-cost-input"
                min="0"
                step="0.01"
                placeholder={t('clinical_treatment_cost')}
                value={draftCost}
                onChange={setDraftCost}
              />
              <button type="button" onClick={handleAddPlanned}>{t('tooth_panel_add_planned')}</button>
            </div>
            {addError && <p className="dc-error text-sm">{addError}</p>}
            <p className="dc-muted text-sm">{t('tooth_panel_planned_hint')}</p>
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
