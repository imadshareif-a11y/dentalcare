import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import LetterheadHeaderBlock from './LetterheadHeaderBlock';

export default function PrintHeader({ title, subtitle }) {
  const { t } = useTranslation();
  const { settings, letterheadUrl, date } = useSettings();
  const isPdf = (settings.letterheadMime || '').includes('pdf');

  return (
    <LetterheadHeaderBlock
      layout={settings.letterheadLayout}
      letterheadUrl={letterheadUrl}
      isPdf={isPdf}
      hasLetterhead={settings.hasLetterhead}
      headerText={settings.printHeaderText}
      title={title}
      subtitle={subtitle}
      dateLabel={date(new Date().toISOString().slice(0, 10))}
      pdfNoteLabel={t('print_pdf_letterhead_note')}
    />
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
