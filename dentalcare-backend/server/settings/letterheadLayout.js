const ALIGN = ['start', 'center', 'end'];
const TEXT_SIZE = ['sm', 'md', 'lg', 'xl'];
const SPACING = ['compact', 'normal', 'relaxed'];
const LOGO_SIDE = ['start', 'end'];
const LOGO_LAYOUTS = ['stack', 'row', 'corner'];

const DEFAULT_LETTERHEAD_LAYOUT = {
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

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeLetterheadLayout(input) {
  const base = { ...DEFAULT_LETTERHEAD_LAYOUT };
  if (!input || typeof input !== 'object') return base;

  const imageLayout = LOGO_LAYOUTS.includes(input.imageLayout) ? input.imageLayout : base.imageLayout;

  return {
    textAlign: ALIGN.includes(input.textAlign) ? input.textAlign : base.textAlign,
    imageAlign: ALIGN.includes(input.imageAlign) ? input.imageAlign : base.imageAlign,
    imageMaxHeight: clamp(Number(input.imageMaxHeight) || base.imageMaxHeight, 40, 200),
    imageMaxWidth: clamp(Number(input.imageMaxWidth) || base.imageMaxWidth, 25, 100),
    imageBeforeText: input.imageBeforeText !== false,
    imageLayout,
    imageSide: LOGO_SIDE.includes(input.imageSide) ? input.imageSide : base.imageSide,
    imageValign: ALIGN.includes(input.imageValign) ? input.imageValign : base.imageValign,
    imageMarginTop: clamp(Number(input.imageMarginTop) || 0, 0, 48),
    imageMarginBottom: clamp(Number(input.imageMarginBottom) || 0, 0, 48),
    imageGap: clamp(Number(input.imageGap) || base.imageGap, 0, 40),
    textSize: TEXT_SIZE.includes(input.textSize) ? input.textSize : base.textSize,
    spacing: SPACING.includes(input.spacing) ? input.spacing : base.spacing,
    showBorder: input.showBorder !== false,
    showPrintDate: input.showPrintDate !== false,
    showDocumentTitle: input.showDocumentTitle !== false,
    boldFirstLine: input.boldFirstLine !== false,
  };
}

function letterheadLayoutFromRow(row) {
  const raw = row?.letterhead_layout;
  if (!raw) return normalizeLetterheadLayout(null);
  if (typeof raw === 'object') return normalizeLetterheadLayout(raw);
  try {
    return normalizeLetterheadLayout(JSON.parse(raw));
  } catch {
    return normalizeLetterheadLayout(null);
  }
}

module.exports = {
  ALIGN,
  TEXT_SIZE,
  SPACING,
  LOGO_SIDE,
  LOGO_LAYOUTS,
  DEFAULT_LETTERHEAD_LAYOUT,
  normalizeLetterheadLayout,
  letterheadLayoutFromRow,
};
