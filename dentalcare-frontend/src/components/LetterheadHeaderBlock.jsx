import { useTranslation } from 'react-i18next';
import {
  buildPrintHeaderClass,
  buildPrintHeaderStyle,
  getLogoImageStyle,
  mergeLetterheadLayout,
  renderHeaderText,
} from '../utils/letterheadLayout';

function HeaderText({ text, boldFirstLine }) {
  const parsed = renderHeaderText(text, boldFirstLine);
  if (typeof parsed === 'string' || !parsed?.first) {
    return text ? <div className="print-header-text">{text}</div> : null;
  }
  return (
    <div className="print-header-text">
      <strong>{parsed.first}</strong>
      {parsed.rest ? (
        <>
          <br />
          {parsed.rest}
        </>
      ) : null}
    </div>
  );
}

export default function LetterheadHeaderBlock({
  layout: layoutInput,
  letterheadUrl = null,
  isPdf = false,
  hasLetterhead = false,
  headerText = '',
  title = null,
  subtitle = null,
  dateLabel = null,
  showEmpty = false,
  emptyLabel = '',
  pdfNoteLabel = '',
  className = '',
}) {
  const layout = mergeLetterheadLayout(layoutInput);
  const hasText = Boolean(String(headerText || '').trim());
  const hasImage = hasLetterhead && letterheadUrl && !isPdf;
  const headerClass = buildPrintHeaderClass(layout);
  const headerStyle = buildPrintHeaderStyle(layout);
  const imgStyle = getLogoImageStyle(layout);

  const imageNode = hasImage ? (
    <img className="print-letterhead-img" src={letterheadUrl} alt="" style={imgStyle} />
  ) : null;

  const pdfNote = hasLetterhead && isPdf && pdfNoteLabel ? (
    <div className="print-muted print-header-pdf-note">{pdfNoteLabel}</div>
  ) : null;

  const textNode = hasText ? (
    <HeaderText text={headerText} boldFirstLine={layout.boldFirstLine} />
  ) : null;

  const emptyNode = showEmpty && !hasText && !hasLetterhead ? (
    <div className="dc-letterhead-paper-empty">{emptyLabel}</div>
  ) : null;

  const footer = (
    <>
      {layout.showDocumentTitle && title ? <h2 className="print-title">{title}</h2> : null}
      {subtitle ? <div className="print-subtitle">{subtitle}</div> : null}
      {layout.showPrintDate && dateLabel ? <div className="print-muted">{dateLabel}</div> : null}
    </>
  );

  function renderStackMain() {
    return (
      <>
        {layout.imageBeforeText ? imageNode : null}
        {layout.imageBeforeText ? pdfNote : null}
        {textNode}
        {!layout.imageBeforeText ? imageNode : null}
        {!layout.imageBeforeText ? pdfNote : null}
        {emptyNode}
      </>
    );
  }

  function renderRowMain() {
    return (
      <div className="print-header-main">
        <div className="print-header-logo-wrap">
          {imageNode || pdfNote}
        </div>
        <div className="print-header-text-wrap">
          {textNode}
          {emptyNode}
        </div>
      </div>
    );
  }

  function renderCornerMain() {
    return (
      <div className="print-header-main print-header-main--corner">
        {(imageNode || pdfNote) ? (
          <div className="print-header-logo-wrap">{imageNode || pdfNote}</div>
        ) : null}
        <div className="print-header-text-wrap">
          {textNode}
          {emptyNode}
        </div>
      </div>
    );
  }

  let main = renderStackMain();
  if (layout.imageLayout === 'row' && (hasImage || pdfNote || hasText || emptyNode)) {
    main = renderRowMain();
  } else if (layout.imageLayout === 'corner') {
    main = renderCornerMain();
  }

  return (
    <div
      className={`print-header ${headerClass} ${className}`.trim()}
      style={headerStyle}
    >
      {main}
      {footer}
    </div>
  );
}
