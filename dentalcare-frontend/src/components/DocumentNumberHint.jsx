import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';

const SAMPLE_KEY = {
  RECEIPT: 'receiptsSample',
  PAYMENT: 'paymentsSample',
  JOURNAL: 'journalDocsSample',
  BANK_ENTRY: 'bankEntriesSample',
  PURCHASE_INVOICE: 'purchaseInvoicesSample',
  CREDIT_NOTE: 'creditNotesSample',
  DEBIT_NOTE: 'debitNotesSample',
};

export default function DocumentNumberHint({ sourceType }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const sampleKey = SAMPLE_KEY[sourceType];
  const sample = sampleKey ? settings?.[sampleKey] : null;
  if (!sample) return null;

  return (
    <label className="dc-field-doc-number">
      <span>{t('doc_number')}</span>
      <input type="text" value={sample} readOnly disabled aria-readonly="true" />
      <span className="dc-muted text-sm">{t('doc_number_auto_hint')}</span>
    </label>
  );
}
