export const DEFAULT_LETTERHEAD_LAYOUT = {
  textAlign: 'start',
  imageAlign: 'start',
  imageMaxHeight: 90,
  imageMaxWidth: 100,
  imageBeforeText: true,
  imageLayout: 'stack',
  imageSide: 'start',
  imageValign: 'center',
  imageMarginTop: 0,
  imageMarginBottom: 0,
  imageGap: 12,
  textSize: 'md',
  spacing: 'normal',
  showBorder: true,
  showPrintDate: true,
  showDocumentTitle: true,
  boldFirstLine: true,
};

export const LOGO_LAYOUTS = ['stack', 'row', 'corner'];
export const LOGO_POSITION_PRESETS = [
  { id: 'above-start', layout: 'stack', before: true, align: 'start', side: 'start' },
  { id: 'above-center', layout: 'stack', before: true, align: 'center', side: 'start' },
  { id: 'above-end', layout: 'stack', before: true, align: 'end', side: 'start' },
  { id: 'below-start', layout: 'stack', before: false, align: 'start', side: 'start' },
  { id: 'below-center', layout: 'stack', before: false, align: 'center', side: 'start' },
  { id: 'below-end', layout: 'stack', before: false, align: 'end', side: 'start' },
  { id: 'beside-start', layout: 'row', before: true, align: 'start', side: 'start' },
  { id: 'beside-end', layout: 'row', before: true, align: 'start', side: 'end' },
  { id: 'corner-start', layout: 'corner', before: true, align: 'start', side: 'start' },
  { id: 'corner-end', layout: 'corner', before: true, align: 'start', side: 'end' },
];

const ALIGN_OPTS = ['start', 'center', 'end'];
const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'];
const SPACING = ['compact', 'normal', 'relaxed'];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function mergeLetterheadLayout(input) {
  const base = { ...DEFAULT_LETTERHEAD_LAYOUT };
  if (!input || typeof input !== 'object') return base;
  const imageLayout = LOGO_LAYOUTS.includes(input.imageLayout) ? input.imageLayout : base.imageLayout;
  return {
    ...base,
    ...input,
    textAlign: ALIGN_OPTS.includes(input.textAlign) ? input.textAlign : base.textAlign,
    imageAlign: ALIGN_OPTS.includes(input.imageAlign) ? input.imageAlign : base.imageAlign,
    imageValign: ALIGN_OPTS.includes(input.imageValign) ? input.imageValign : base.imageValign,
    imageSide: ['start', 'end'].includes(input.imageSide) ? input.imageSide : base.imageSide,
    imageLayout,
    textSize: TEXT_SIZES.includes(input.textSize) ? input.textSize : base.textSize,
    spacing: SPACING.includes(input.spacing) ? input.spacing : base.spacing,
    imageMaxHeight: clamp(Number(input.imageMaxHeight) || base.imageMaxHeight, 40, 200),
    imageMaxWidth: clamp(Number(input.imageMaxWidth) || base.imageMaxWidth, 25, 100),
    imageMarginTop: clamp(Number(input.imageMarginTop) || 0, 0, 48),
    imageMarginBottom: clamp(Number(input.imageMarginBottom) || 0, 0, 48),
    imageGap: clamp(Number(input.imageGap) || base.imageGap, 0, 40),
    imageBeforeText: input.imageBeforeText !== false,
    showBorder: input.showBorder !== false,
    showPrintDate: input.showPrintDate !== false,
    showDocumentTitle: input.showDocumentTitle !== false,
    boldFirstLine: input.boldFirstLine !== false,
  };
}

export function buildPrintHeaderClass(layout) {
  const l = mergeLetterheadLayout(layout);
  const parts = [
    `print-header--align-${l.textAlign}`,
    `print-header--img-align-${l.imageAlign}`,
    `print-header--text-${l.textSize}`,
    `print-header--spacing-${l.spacing}`,
    `print-header--layout-${l.imageLayout}`,
    `print-header--logo-side-${l.imageSide}`,
    `print-header--logo-valign-${l.imageValign}`,
  ];
  if (!l.showBorder) parts.push('print-header--no-border');
  if (!l.imageBeforeText) parts.push('print-header--img-after');
  if (l.boldFirstLine) parts.push('print-header--bold-first');
  return parts.join(' ');
}

export function buildPrintHeaderStyle(layout) {
  const l = mergeLetterheadLayout(layout);
  return {
    '--print-logo-gap': `${l.imageGap}px`,
    '--print-logo-mt': `${l.imageMarginTop}px`,
    '--print-logo-mb': `${l.imageMarginBottom}px`,
  };
}

export function getLogoImageStyle(layout) {
  const l = mergeLetterheadLayout(layout);
  return {
    maxHeight: `${l.imageMaxHeight}px`,
    maxWidth: l.imageLayout === 'row' ? `${Math.min(l.imageMaxWidth, 55)}%` : `${l.imageMaxWidth}%`,
    marginTop: `${l.imageMarginTop}px`,
    marginBottom: `${l.imageMarginBottom}px`,
  };
}

export function detectLogoPreset(layout) {
  const l = mergeLetterheadLayout(layout);
  return LOGO_POSITION_PRESETS.find((p) => (
    p.layout === l.imageLayout
    && p.side === l.imageSide
    && (p.layout !== 'stack' || p.before === l.imageBeforeText)
    && (p.layout === 'stack' ? p.align === l.imageAlign : true)
  ))?.id || null;
}

export function applyLogoPreset(presetId) {
  const preset = LOGO_POSITION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    imageLayout: preset.layout,
    imageSide: preset.side,
    imageBeforeText: preset.before,
    imageAlign: preset.align,
  };
}

export function parseHeaderFields(text = '', clinicName = '') {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return {
    name: lines[0] || clinicName || '',
    address: lines[1] || '',
    phone: lines[2] || '',
    email: lines[3] || '',
    taxId: lines[4] || '',
    extra: lines.slice(5).join('\n'),
  };
}

export function composeHeaderText(fields) {
  const rows = [
    fields.name,
    fields.address,
    fields.phone,
    fields.email,
    fields.taxId,
    fields.extra,
  ];
  return rows.map((r) => String(r || '').trim()).filter(Boolean).join('\n');
}

export function renderHeaderText(text, boldFirstLine = true) {
  const lines = String(text || '').split('\n');
  if (!boldFirstLine || !lines.length) return text;
  const [first, ...rest] = lines;
  if (!first?.trim()) return text;
  return { first: first.trim(), rest: rest.join('\n') };
}
