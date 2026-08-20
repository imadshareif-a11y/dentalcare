import { useTranslation } from 'react-i18next';
import ToothIcon from './ToothIcon';
import { FDI, isPrimaryTooth, toothTilt, toothType } from '../lib/fdiChart';

function ToothButton({
  num,
  arch,
  side,
  index,
  count,
  selectedTooth,
  treated,
  onSelect,
}) {
  const primary = isPrimaryTooth(num);
  const isSelected = selectedTooth === num;
  const isTreated = treated.has(num);
  const tilt = toothTilt(num, index, count, side, arch);

  return (
    <button
      type="button"
      className={[
        'dc-fdi-tooth',
        primary ? 'is-primary' : 'is-permanent',
        isSelected ? 'is-active' : '',
        isTreated && !isSelected ? 'is-treated' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tooth-tilt': `${tilt}deg` }}
      onClick={() => onSelect(num)}
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

function QuadRow({ teeth, arch, side, selectedTooth, treated, onSelect, variant }) {
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
          treated={treated}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ArchHalf({ arch, side, perm, prim, selectedTooth, treated, onSelect }) {
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
          treated={treated}
          onSelect={onSelect}
        />
      )}
      <QuadRow
        teeth={prim}
        arch={arch}
        side={side}
        variant="prim"
        selectedTooth={selectedTooth}
        treated={treated}
        onSelect={onSelect}
      />
      {!permFirst && (
        <QuadRow
          teeth={perm}
          arch={arch}
          side={side}
          variant="perm"
          selectedTooth={selectedTooth}
          treated={treated}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

export default function DentalChart({ selectedTooth, treatedTeeth = [], onSelectTooth }) {
  const { t } = useTranslation();
  const treated = new Set(treatedTeeth);

  return (
    <div className="dc-fdi-chart" dir="ltr">
      <div className="dc-fdi-toolbar">
        <div>
          {t('clinical_selected_tooth')}: <strong>{selectedTooth || t('clinical_none_selected')}</strong>
        </div>
        <span className="dc-fdi-pill">{t('clinical_fdi')}</span>
      </div>

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
          selectedTooth={selectedTooth}
          treated={treated}
          onSelect={onSelectTooth}
        />
        <div className="dc-fdi-midline"><span>{t('clinical_midline')}</span></div>
        <ArchHalf
          arch="upper"
          side="left"
          perm={FDI.upperLeftPerm}
          prim={FDI.upperLeftPrim}
          selectedTooth={selectedTooth}
          treated={treated}
          onSelect={onSelectTooth}
        />
      </div>

      <div className="dc-fdi-occlusal" aria-hidden="true" />

      <div className="dc-fdi-arch dc-fdi-lower">
        <ArchHalf
          arch="lower"
          side="right"
          perm={FDI.lowerRightPerm}
          prim={FDI.lowerRightPrim}
          selectedTooth={selectedTooth}
          treated={treated}
          onSelect={onSelectTooth}
        />
        <div className="dc-fdi-midline" />
        <ArchHalf
          arch="lower"
          side="left"
          perm={FDI.lowerLeftPerm}
          prim={FDI.lowerLeftPrim}
          selectedTooth={selectedTooth}
          treated={treated}
          onSelect={onSelectTooth}
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
      </div>
    </div>
  );
}
