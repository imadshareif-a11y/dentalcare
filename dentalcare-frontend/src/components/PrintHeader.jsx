import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';

export default function PrintHeader({ title, subtitle }) {
  const { t } = useTranslation();
  const { settings, letterheadUrl, date } = useSettings();
  const isPdf = (settings.letterheadMime || '').includes('pdf');

  return (
    <div className="print-header">
      {letterheadUrl && !isPdf && (
        <img className="print-letterhead-img" src={letterheadUrl} alt="" />
      )}
      {letterheadUrl && isPdf && (
        <div className="print-muted">{t('print_pdf_letterhead_note')}</div>
      )}
      {settings.printHeaderText && (
        <div className="print-header-text">{settings.printHeaderText}</div>
      )}
      <h2 className="print-title">{title}</h2>
      {subtitle ? <div className="print-subtitle">{subtitle}</div> : null}
      <div className="print-muted">{date(new Date().toISOString().slice(0, 10))}</div>
    </div>
  );
}

export function PrintButton() {
  const { t } = useTranslation();
  return (
    <button type="button" className="no-print" onClick={() => window.print()}>
      {t('print')}
    </button>
  );
}
