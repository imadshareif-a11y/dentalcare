import { useTranslation } from 'react-i18next';
import { applyLogoPreset, mergeLetterheadLayout } from '../utils/letterheadLayout';

const GRID_PRESETS = [
  ['above-start', 'above-center', 'above-end'],
  ['beside-start', null, 'beside-end'],
  ['below-start', 'below-center', 'below-end'],
];

const CORNER_PRESETS = ['corner-start', 'corner-end'];

function isPresetActive(layout, presetId) {
  const l = mergeLetterheadLayout(layout);
  if (presetId.startsWith('above-')) {
    const align = presetId.replace('above-', '');
    return l.imageLayout === 'stack' && l.imageBeforeText && l.imageAlign === align;
  }
  if (presetId.startsWith('below-')) {
    const align = presetId.replace('below-', '');
    return l.imageLayout === 'stack' && !l.imageBeforeText && l.imageAlign === align;
  }
  if (presetId === 'beside-start') return l.imageLayout === 'row' && l.imageSide === 'start';
  if (presetId === 'beside-end') return l.imageLayout === 'row' && l.imageSide === 'end';
  if (presetId === 'corner-start') return l.imageLayout === 'corner' && l.imageSide === 'start';
  if (presetId === 'corner-end') return l.imageLayout === 'corner' && l.imageSide === 'end';
  return false;
}

export function LogoPositionPicker({ layout, onChange, disabled = false }) {
  const { t } = useTranslation();

  function pick(id) {
    const patch = applyLogoPreset(id);
    if (patch) onChange(patch);
  }

  return (
    <div className="dc-logo-position-picker">
      <span className="dc-letterhead-control-label">{t('settings_letterhead_logo_position')}</span>
      <p className="dc-muted text-sm">{t('settings_letterhead_logo_position_desc')}</p>
      <div className="dc-logo-position-grid" role="group" aria-label={t('settings_letterhead_logo_position')}>
        {GRID_PRESETS.map((row, rowIdx) => (
          <div key={rowIdx} className="dc-logo-position-row">
            {row.map((presetId, colIdx) => {
              if (presetId === null) {
                return (
                  <div key={colIdx} className="dc-logo-position-cell dc-logo-position-cell-mid">
                    {CORNER_PRESETS.map((cornerId) => (
                      <button
                        key={cornerId}
                        type="button"
                        className={`dc-logo-position-btn dc-logo-position-btn-mini${isPresetActive(layout, cornerId) ? ' is-active' : ''}`}
                        disabled={disabled}
                        title={t(`settings_letterhead_logo_pos_${cornerId}`)}
                        onClick={() => pick(cornerId)}
                      >
                        <span className={`dc-logo-position-icon pos-${cornerId}`} aria-hidden />
                        <span className="dc-logo-position-mini-label">{t(`settings_letterhead_logo_pos_${cornerId}`)}</span>
                      </button>
                    ))}
                  </div>
                );
              }

              return (
                <button
                  key={presetId}
                  type="button"
                  className={`dc-logo-position-btn${isPresetActive(layout, presetId) ? ' is-active' : ''}`}
                  disabled={disabled}
                  title={t(`settings_letterhead_logo_pos_${presetId}`)}
                  onClick={() => pick(presetId)}
                >
                  <span className={`dc-logo-position-icon pos-${presetId}`} aria-hidden />
                  <span className="dc-logo-position-label">{t(`settings_letterhead_logo_pos_${presetId}`)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
