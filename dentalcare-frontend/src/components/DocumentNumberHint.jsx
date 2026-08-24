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

/** احتياطي إذا فشل /settings — حتى لا يختفي حقل رقم المستند على الإنتاج */
const FALLBACK_SAMPLE = {
  RECEIPT: 'RC00001',
  PAYMENT: 'PY00001',
  JOURNAL: 'JV00001',
  BANK_ENTRY: 'BE00001',
  PURCHASE_INVOICE: 'PI00001',
  CREDIT_NOTE: 'CN00001',
  DEBIT_NOTE: 'DN00001',
};

export default function DocumentNumberHint({ sourceType }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const sampleKey = SAMPLE_KEY[sourceType];
  const sample = (sampleKey && settings?.[sampleKey]) || FALLBACK_SAMPLE[sourceType] || null;
  if (!sample) return null;

  return (
    <label className="dc-field-doc-number">
      <span>{t('doc_number')}</span>
      <input type="text" value={sample} readOnly disabled aria-readonly="true" />
      <span className="dc-muted text-sm">{t('doc_number_auto_hint')}</span>
    </label>
  );
}
