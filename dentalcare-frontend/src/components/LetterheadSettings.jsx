import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LetterheadHeaderBlock from './LetterheadHeaderBlock';
import { LogoPositionPicker } from './LogoPositionPicker';
import {
  composeHeaderText,
  mergeLetterheadLayout,
  parseHeaderFields,
} from '../utils/letterheadLayout';

const SAMPLE_LINES = [
  { code: '1101', name: 'صندوق الشيكل', memo: '—', debit: 0, credit: 1500 },
  { code: '1201', name: 'ذمة: أحمد محمد', memo: 'قبض علاج', debit: 1500, credit: 0 },
];

const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'];
const SPACING_OPTS = ['compact', 'normal', 'relaxed'];
const ALIGN_OPTS = ['start', 'center', 'end'];
const LOGO_LAYOUT_OPTS = ['stack', 'row', 'corner'];
const SIDE_OPTS = ['start', 'end'];

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="dc-letterhead-toggle-row">
      <span className="dc-letterhead-toggle-copy">
        <strong>{label}</strong>
        {hint ? <span className="dc-muted text-sm">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SegControl({ label, options, value, onChange, labelKeyPrefix }) {
  const { t } = useTranslation();
  return (
    <div className="dc-letterhead-control-block">
      <span className="dc-letterhead-control-label">{label}</span>
      <div className="dc-format-seg">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`dc-format-seg-btn${value === opt ? ' is-active' : ''}`}
            onClick={() => onChange(opt)}
          >
            {t(`${labelKeyPrefix}_${opt}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LetterheadSettings({
  headerText = '',
  onHeaderTextChange,
  letterheadLayout,
  onLayoutChange,
  onSave,
  saving = false,
  hasLetterhead = false,
  letterheadUrl = null,
  letterheadMime = null,
  onUpload,
  onRemove,
  formatMoney,
  formatDate,
  clinicName = '',
}) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const layout = mergeLetterheadLayout(letterheadLayout);
  const isPdf = (letterheadMime || '').includes('pdf');
  const trimmedText = String(headerText || '').trim();
  const hasText = Boolean(trimmedText);

  const [fields, setFields] = useState(() => parseHeaderFields(headerText, clinicName));

  useEffect(() => {
    setFields(parseHeaderFields(headerText, clinicName));
  }, [headerText, clinicName]);

  const templates = useMemo(() => ([
    {
      id: 'clinic',
      label: t('settings_letterhead_tpl_clinic'),
      fields: {
        name: clinicName || t('settings_letterhead_tpl_clinic_name'),
        address: t('settings_letterhead_tpl_address'),
        phone: t('settings_letterhead_tpl_phone'),
        email: '',
        taxId: '',
        extra: '',
      },
    },
    {
      id: 'minimal',
      label: t('settings_letterhead_tpl_minimal'),
      fields: {
        name: clinicName || t('settings_letterhead_tpl_clinic_name'),
        address: '',
        phone: '',
        email: '',
        taxId: '',
        extra: '',
      },
    },
    {
      id: 'full',
      label: t('settings_letterhead_tpl_full'),
      fields: {
        name: clinicName || t('settings_letterhead_tpl_clinic_name'),
        address: t('settings_letterhead_tpl_address'),
        phone: t('settings_letterhead_tpl_phone'),
        email: t('settings_letterhead_tpl_email'),
        taxId: t('settings_letterhead_tpl_tax'),
        extra: '',
      },
    },
  ]), [t, clinicName]);

  const sampleDate = formatDate?.(new Date().toISOString().slice(0, 10)) || '—';
  const sampleAmount = formatMoney?.(1500) || '1,500.00';

  function patchLayout(patch) {
    onLayoutChange?.({ ...layout, ...patch });
  }

  function updateField(key, value) {
    const next = { ...fields, [key]: value };
    setFields(next);
    onHeaderTextChange?.(composeHeaderText(next));
  }

  function applyTemplate(tplFields) {
    setFields(tplFields);
    onHeaderTextChange?.(composeHeaderText(tplFields));
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload?.(e);
    e.target.value = '';
  }

  const fieldRows = [
    { key: 'name', label: t('settings_letterhead_field_name'), placeholder: t('settings_letterhead_tpl_clinic_name') },
    { key: 'address', label: t('settings_letterhead_field_address'), placeholder: t('settings_letterhead_tpl_address') },
    { key: 'phone', label: t('settings_letterhead_field_phone'), placeholder: t('settings_letterhead_tpl_phone') },
    { key: 'email', label: t('settings_letterhead_field_email'), placeholder: t('settings_letterhead_tpl_email') },
    { key: 'taxId', label: t('settings_letterhead_field_tax'), placeholder: t('settings_letterhead_tpl_tax') },
  ];

  return (
    <section className="dc-settings-panel dc-letterhead-panel">
      <div className="dc-letterhead-intro">
        <h4>{t('settings_letterhead_title')}</h4>
        <p className="dc-muted text-sm">{t('settings_letterhead_hint')}</p>
      </div>

      <div className="dc-letterhead-workspace">
        <div className="dc-letterhead-controls">
          <article className="dc-letterhead-card">
            <header className="dc-letterhead-card-head">
              <span className="dc-letterhead-card-icon tone-sky">
                <i className="fa-solid fa-building" aria-hidden />
              </span>
              <div>
                <h5>{t('settings_letterhead_text_section')}</h5>
                <p className="dc-muted text-sm">{t('settings_letterhead_text_section_hint')}</p>
              </div>
            </header>

            <div className="dc-letterhead-templates">
              <span className="dc-letterhead-templates-label">{t('settings_letterhead_templates')}</span>
              <div className="dc-letterhead-template-row">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="dc-format-chip"
                    onClick={() => applyTemplate(tpl.fields)}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="dc-letterhead-fields-grid">
              {fieldRows.map((row) => (
                <label key={row.key} className="dc-letterhead-field">
                  <span>{row.label}</span>
                  <input
                    type="text"
                    value={fields[row.key]}
                    placeholder={row.placeholder}
                    onChange={(e) => updateField(row.key, e.target.value)}
                  />
                </label>
              ))}
              <label className="dc-letterhead-field dc-letterhead-field-wide">
                <span>{t('settings_letterhead_field_extra')}</span>
                <textarea
                  rows={2}
                  value={fields.extra}
                  placeholder={t('settings_letterhead_field_extra_ph')}
                  onChange={(e) => updateField('extra', e.target.value)}
                />
              </label>
            </div>
          </article>

          <article className="dc-letterhead-card">
            <header className="dc-letterhead-card-head">
              <span className="dc-letterhead-card-icon tone-emerald">
                <i className="fa-solid fa-sliders" aria-hidden />
              </span>
              <div>
                <h5>{t('settings_letterhead_layout_section')}</h5>
                <p className="dc-muted text-sm">{t('settings_letterhead_layout_section_hint')}</p>
              </div>
            </header>

            <SegControl
              label={t('settings_letterhead_text_align')}
              options={ALIGN_OPTS}
              value={layout.textAlign}
              onChange={(v) => patchLayout({ textAlign: v })}
              labelKeyPrefix="settings_letterhead_align"
            />
            <SegControl
              label={t('settings_letterhead_text_size')}
              options={TEXT_SIZES}
              value={layout.textSize}
              onChange={(v) => patchLayout({ textSize: v })}
              labelKeyPrefix="settings_letterhead_size"
            />
            <SegControl
              label={t('settings_letterhead_spacing')}
              options={SPACING_OPTS}
              value={layout.spacing}
              onChange={(v) => patchLayout({ spacing: v })}
              labelKeyPrefix="settings_letterhead_spacing"
            />
            <ToggleRow
              label={t('settings_letterhead_bold_first')}
              checked={layout.boldFirstLine}
              onChange={(v) => patchLayout({ boldFirstLine: v })}
            />
          </article>

          <article className="dc-letterhead-card">
            <header className="dc-letterhead-card-head">
              <span className="dc-letterhead-card-icon tone-amber">
                <i className="fa-solid fa-eye" aria-hidden />
              </span>
              <div>
                <h5>{t('settings_letterhead_display_section')}</h5>
                <p className="dc-muted text-sm">{t('settings_letterhead_display_section_hint')}</p>
              </div>
            </header>

            <ToggleRow
              label={t('settings_letterhead_show_border')}
              checked={layout.showBorder}
              onChange={(v) => patchLayout({ showBorder: v })}
            />
            <ToggleRow
              label={t('settings_letterhead_show_title')}
              checked={layout.showDocumentTitle}
              onChange={(v) => patchLayout({ showDocumentTitle: v })}
            />
            <ToggleRow
              label={t('settings_letterhead_show_date')}
              checked={layout.showPrintDate}
              onChange={(v) => patchLayout({ showPrintDate: v })}
            />
          </article>

          <article className="dc-letterhead-card">
            <header className="dc-letterhead-card-head">
              <span className="dc-letterhead-card-icon tone-violet">
                <i className="fa-solid fa-image" aria-hidden />
              </span>
              <div>
                <h5>{t('settings_letterhead_image_section')}</h5>
                <p className="dc-muted text-sm">{t('settings_letterhead_image_hint')}</p>
              </div>
            </header>

            <div
              className={`dc-letterhead-dropzone${hasLetterhead ? ' has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="dc-sr-only"
                onChange={handleFilePick}
              />
              {hasLetterhead && letterheadUrl && !isPdf && (
                <img
                  className="dc-letterhead-dropzone-thumb"
                  src={letterheadUrl}
                  alt=""
                  style={{ maxHeight: layout.imageMaxHeight }}
                />
              )}
              {hasLetterhead && isPdf && (
                <div className="dc-letterhead-dropzone-pdf">
                  <i className="fa-solid fa-file-pdf" aria-hidden />
                  <span>{t('print_pdf_letterhead_note')}</span>
                </div>
              )}
              {!hasLetterhead && (
                <>
                  <i className="fa-solid fa-cloud-arrow-up dc-letterhead-dropzone-icon" aria-hidden />
                  <strong>{t('settings_letterhead_file')}</strong>
                  <span className="dc-muted text-sm">{t('settings_letterhead_file_types')}</span>
                </>
              )}
              {hasLetterhead && (
                <span className="dc-letterhead-dropzone-replace">{t('settings_letterhead_replace')}</span>
              )}
            </div>

            {hasLetterhead && (
              <div className="dc-letterhead-file-actions">
                {letterheadUrl && isPdf && (
                  <a href={letterheadUrl} target="_blank" rel="noreferrer" className="dc-ghost-light">
                    <i className="fa-solid fa-up-right-from-square" /> {t('settings_letterhead_open_pdf')}
                  </a>
                )}
                <button type="button" className="dc-danger" onClick={onRemove}>
                  <i className="fa-solid fa-trash-can" /> {t('settings_letterhead_remove')}
                </button>
              </div>
            )}

            {hasLetterhead && !isPdf && (
              <div className="dc-letterhead-logo-controls">
                <LogoPositionPicker layout={layout} onChange={patchLayout} />

                <SegControl
                  label={t('settings_letterhead_logo_layout_mode')}
                  options={LOGO_LAYOUT_OPTS}
                  value={layout.imageLayout}
                  onChange={(v) => patchLayout({ imageLayout: v })}
                  labelKeyPrefix="settings_letterhead_logo_layout"
                />

                {layout.imageLayout === 'stack' && (
                  <>
                    <SegControl
                      label={t('settings_letterhead_image_align')}
                      options={ALIGN_OPTS}
                      value={layout.imageAlign}
                      onChange={(v) => patchLayout({ imageAlign: v })}
                      labelKeyPrefix="settings_letterhead_align"
                    />
                    <ToggleRow
                      label={t('settings_letterhead_image_first')}
                      hint={t('settings_letterhead_image_first_hint')}
                      checked={layout.imageBeforeText}
                      onChange={(v) => patchLayout({ imageBeforeText: v })}
                    />
                  </>
                )}

                {layout.imageLayout === 'row' && (
                  <>
                    <SegControl
                      label={t('settings_letterhead_logo_side')}
                      options={SIDE_OPTS}
                      value={layout.imageSide}
                      onChange={(v) => patchLayout({ imageSide: v })}
                      labelKeyPrefix="settings_letterhead_logo_side"
                    />
                    <SegControl
                      label={t('settings_letterhead_logo_valign')}
                      options={ALIGN_OPTS}
                      value={layout.imageValign}
                      onChange={(v) => patchLayout({ imageValign: v })}
                      labelKeyPrefix="settings_letterhead_align"
                    />
                  </>
                )}

                {layout.imageLayout === 'corner' && (
                  <SegControl
                    label={t('settings_letterhead_logo_corner')}
                    options={SIDE_OPTS}
                    value={layout.imageSide}
                    onChange={(v) => patchLayout({ imageSide: v })}
                    labelKeyPrefix="settings_letterhead_logo_corner"
                  />
                )}

                <div className="dc-letterhead-slider-block">
                  <label className="dc-letterhead-slider-label">
                    <span>{t('settings_letterhead_image_height')}</span>
                    <strong>{layout.imageMaxHeight}px</strong>
                  </label>
                  <input
                    type="range"
                    min={40}
                    max={200}
                    step={5}
                    value={layout.imageMaxHeight}
                    onChange={(e) => patchLayout({ imageMaxHeight: Number(e.target.value) })}
                  />
                </div>

                <div className="dc-letterhead-slider-block">
                  <label className="dc-letterhead-slider-label">
                    <span>{t('settings_letterhead_image_width')}</span>
                    <strong>{layout.imageMaxWidth}%</strong>
                  </label>
                  <input
                    type="range"
                    min={25}
                    max={100}
                    step={5}
                    value={layout.imageMaxWidth}
                    onChange={(e) => patchLayout({ imageMaxWidth: Number(e.target.value) })}
                  />
                </div>

                <div className="dc-letterhead-slider-block">
                  <label className="dc-letterhead-slider-label">
                    <span>{t('settings_letterhead_logo_gap')}</span>
                    <strong>{layout.imageGap}px</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={2}
                    value={layout.imageGap}
                    onChange={(e) => patchLayout({ imageGap: Number(e.target.value) })}
                  />
                </div>

                <div className="dc-letterhead-slider-block">
                  <label className="dc-letterhead-slider-label">
                    <span>{t('settings_letterhead_logo_margin_top')}</span>
                    <strong>{layout.imageMarginTop}px</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={2}
                    value={layout.imageMarginTop}
                    onChange={(e) => patchLayout({ imageMarginTop: Number(e.target.value) })}
                  />
                </div>

                <div className="dc-letterhead-slider-block">
                  <label className="dc-letterhead-slider-label">
                    <span>{t('settings_letterhead_logo_margin_bottom')}</span>
                    <strong>{layout.imageMarginBottom}px</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={2}
                    value={layout.imageMarginBottom}
                    onChange={(e) => patchLayout({ imageMarginBottom: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </article>

          <div className="dc-letterhead-save-bar">
            <button type="button" className="dc-success" onClick={onSave} disabled={saving}>
              {saving ? t('ledger_loading') : t('settings_save_letterhead')}
            </button>
            {(hasText || Object.values(fields).some(Boolean)) && (
              <button
                type="button"
                className="dc-ghost-light"
                onClick={() => applyTemplate({ name: '', address: '', phone: '', email: '', taxId: '', extra: '' })}
              >
                {t('settings_letterhead_clear_text')}
              </button>
            )}
          </div>
        </div>

        <aside className="dc-letterhead-preview-pane">
          <div className="dc-letterhead-preview-head">
            <i className="fa-solid fa-file-lines" aria-hidden />
            <strong>{t('settings_letterhead_report_preview')}</strong>
          </div>
          <p className="dc-muted text-sm">{t('settings_letterhead_report_preview_hint')}</p>

          <div className="dc-letterhead-paper" aria-label={t('settings_letterhead_report_preview')}>
            <LetterheadHeaderBlock
              className="dc-letterhead-paper-header"
              layout={layout}
              letterheadUrl={letterheadUrl}
              isPdf={isPdf}
              hasLetterhead={hasLetterhead}
              headerText={headerText}
              title={t('nav_receipt')}
              subtitle={t('settings_letterhead_sample_memo')}
              dateLabel={sampleDate}
              showEmpty
              emptyLabel={t('settings_letterhead_empty')}
              pdfNoteLabel={t('print_pdf_letterhead_note')}
            />

            <div className="print-summary dc-doc-print-meta">
              <div><strong>{t('voucher_date')}:</strong> {sampleDate}</div>
              <div><strong>{t('doc_created_by')}:</strong> {t('settings_letterhead_sample_user')}</div>
              <div><strong>{t('doc_number')}:</strong> RCP-00042</div>
            </div>

            <table className="w-full text-sm print-table dc-letterhead-sample-table">
              <thead>
                <tr>
                  <th>{t('trial_balance_col_code')}</th>
                  <th>{t('trial_balance_col_name')}</th>
                  <th>{t('ledger_col_details')}</th>
                  <th>{t('voucher_debit')}</th>
                  <th>{t('voucher_credit')}</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_LINES.map((row) => (
                  <tr key={row.code}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>{row.memo}</td>
                    <td className="dc-money">{row.debit > 0 ? formatMoney?.(row.debit) : '—'}</td>
                    <td className="dc-money">{row.credit > 0 ? formatMoney?.(row.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>{t('settings_letterhead_sample_total')}</strong></td>
                  <td className="dc-money"><strong>{sampleAmount}</strong></td>
                  <td className="dc-money"><strong>{sampleAmount}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </aside>
      </div>
    </section>
  );
}
