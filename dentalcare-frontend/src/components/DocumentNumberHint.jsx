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

export function useDocumentNumberSample(sourceType) {
  const { settings } = useSettings();
  const sampleKey = SAMPLE_KEY[sourceType];
  return (sampleKey && settings?.[sampleKey]) || FALLBACK_SAMPLE[sourceType] || null;
}

export function DocumentNumberRow({ sourceType }) {
  const { t } = useTranslation();
  const sample = useDocumentNumberSample(sourceType);
  if (!sample) return null;

  return (
    <div className="dc-doc-number-row">
      <span className="dc-doc-number-label">{t('doc_number')}</span>
      <span className="dc-doc-number-value">{sample}</span>
      <span className="dc-doc-number-sep" aria-hidden="true">·</span>
      <span className="dc-doc-number-hint">{t('doc_number_auto_hint')}</span>
    </div>
  );
}

/** @deprecated استخدم DocumentNumberRow داخل رأس النموذج */
export default function DocumentNumberHint({ sourceType }) {
  return <DocumentNumberRow sourceType={sourceType} />;
}
