import { useTranslation } from 'react-i18next';
import ToothIcon from './ToothIcon';
import { FDI, isPrimaryTooth, toothTilt, toothType } from '../lib/fdiChart';
import { conditionCssClass, conditionColorStyle, conditionLabel } from '../lib/toothConditions';

function ToothButton({
  num,
  arch,
  side,
  index,
  count,
  selectedTooth,
  toothState,
  onSelect,
  selectEnabled = true,
  colorMap,
}) {
  const primary = isPrimaryTooth(num);
  const isSelected = selectedTooth === num;
  const current = toothState?.current;
  const hasPlanned = (toothState?.planned || []).length > 0;
  const condClass = conditionCssClass(current);
  const tilt = toothTilt(num, index, count, side, arch);
  const colorStyle = conditionColorStyle(current, colorMap) || {};

  return (
    <button
      type="button"
      className={[
        'dc-fdi-tooth',
        primary ? 'is-primary' : 'is-permanent',
        isSelected ? 'is-active' : '',
        condClass,
        current === 'MISSING' ? 'is-missing' : '',
        hasPlanned ? 'is-planned' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tooth-tilt': `${tilt}deg`, ...colorStyle }}
      onClick={() => onSelect(num)}
      disabled={!selectEnabled}
      title={num}
      aria-label={num}
      aria-pressed={isSelected}
    >
      {arch === 'upper' && <span className="dc-fdi-num">{num}</span>}
      <ToothIcon type={toothType(num)} size={primary ? 'sm' : 'lg'} />
      {arch === 'lower' && <span className="dc-fdi-num">{num}</span>}
    </button>
  );
}

function QuadRow({ teeth, arch, side, selectedTooth, toothStates, onSelect, variant, selectEnabled, colorMap }) {
  return (
    <div className={`dc-fdi-row dc-fdi-${variant}`}>
      {teeth.map((num, index) => (
        <ToothButton
          key={num}
          num={num}
          arch={arch}
          side={side}
          index={index}
          count={teeth.length}
          selectedTooth={selectedTooth}
          toothState={toothStates?.[num]}
          onSelect={onSelect}
          selectEnabled={selectEnabled}
          colorMap={colorMap}
        />
      ))}
    </div>
  );
}

function ArchHalf({ arch, side, perm, prim, selectedTooth, toothStates, onSelect, selectEnabled, colorMap }) {
  const permFirst = arch === 'upper';
  return (
    <div className={`dc-fdi-half dc-fdi-${side}`}>
      {permFirst && (
        <QuadRow
          teeth={perm}
          arch={arch}
          side={side}
          variant="perm"
          selectedTooth={selectedTooth}
          toothStates={toothStates}
          onSelect={onSelect}
          selectEnabled={selectEnabled}
          colorMap={colorMap}
        />
      )}
      <QuadRow
        teeth={prim}
        arch={arch}
        side={side}
        variant="prim"
        selectedTooth={selectedTooth}
        toothStates={toothStates}
        onSelect={onSelect}
        selectEnabled={selectEnabled}
        colorMap={colorMap}
      />
      {!permFirst && (
        <QuadRow
          teeth={perm}
          arch={arch}
          side={side}
          variant="perm"
          selectedTooth={selectedTooth}
          toothStates={toothStates}
          onSelect={onSelect}
          selectEnabled={selectEnabled}
          colorMap={colorMap}
        />
      )}
    </div>
  );
}

export default function DentalChart({
  selectedTooth,
  toothStates = {},
  onSelectTooth,
  selectEnabled = true,
  selectHint = '',
  conditions = [],
}) {
  const { t, i18n } = useTranslation();

  const colorMap = {};
  for (const c of conditions || []) {
    if (c?.code && c?.color) colorMap[c.code] = c.color;
  }

  const legendConditions = (conditions || []).filter(
    (c) => c.code && c.code !== 'HEALTHY' && c.is_active !== false
  );

  const halfProps = {
    selectedTooth,
    toothStates,
    onSelect: onSelectTooth,
    selectEnabled,
    colorMap,
  };

  return (
    <div className={`dc-fdi-chart${selectEnabled ? '' : ' is-select-disabled'}`} dir="ltr">
      <div className="dc-fdi-toolbar">
        <div>
          {t('clinical_selected_tooth')}: <strong>{selectedTooth || t('clinical_none_selected')}</strong>
        </div>
        <span className="dc-fdi-pill">{t('clinical_fdi')}</span>
      </div>

      {!selectEnabled && selectHint && (
        <p className="dc-clinical-tooth-hint dc-fdi-select-hint" role="status">
          <i className="fa-solid fa-user" aria-hidden="true" />
          {selectHint}
        </p>
      )}

      <div className="dc-fdi-arch-labels">
        <span>{t('clinical_upper_right')}</span>
        <span />
        <span>{t('clinical_upper_left')}</span>
      </div>

      <div className="dc-fdi-arch dc-fdi-upper">
        <ArchHalf
          arch="upper"
          side="right"
          perm={FDI.upperRightPerm}
          prim={FDI.upperRightPrim}
          {...halfProps}
        />
        <div className="dc-fdi-midline"><span>{t('clinical_midline')}</span></div>
        <ArchHalf
          arch="upper"
          side="left"
          perm={FDI.upperLeftPerm}
          prim={FDI.upperLeftPrim}
          {...halfProps}
        />
      </div>

      <div className="dc-fdi-occlusal" aria-hidden="true" />

      <div className="dc-fdi-arch dc-fdi-lower">
        <ArchHalf
          arch="lower"
          side="right"
          perm={FDI.lowerRightPerm}
          prim={FDI.lowerRightPrim}
          {...halfProps}
        />
        <div className="dc-fdi-midline" />
        <ArchHalf
          arch="lower"
          side="left"
          perm={FDI.lowerLeftPerm}
          prim={FDI.lowerLeftPrim}
          {...halfProps}
        />
      </div>

      <div className="dc-fdi-arch-labels dc-fdi-arch-labels-lower">
        <span>{t('clinical_lower_right')}</span>
        <span />
        <span>{t('clinical_lower_left')}</span>
      </div>

      <div className="dc-fdi-legend">
        <span><i className="dc-fdi-legend-dot is-perm" /> {t('clinical_permanent_teeth')}</span>
        <span><i className="dc-fdi-legend-dot is-prim" /> {t('clinical_primary_teeth')}</span>
        {legendConditions.slice(0, 6).map((c) => (
          <span key={c.code}>
            <i
              className={`dc-fdi-legend-dot ${conditionCssClass(c.code)}`}
              style={c.color ? { background: c.color } : undefined}
            />
            {' '}
            {conditionLabel(c, t, i18n.language)}
          </span>
        ))}
        <span><i className="dc-fdi-legend-dot is-planned" /> {t('tooth_legend_planned')}</span>
      </div>
    </div>
  );
}
