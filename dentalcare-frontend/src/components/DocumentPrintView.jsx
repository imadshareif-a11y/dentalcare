import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from './PrintHeader';
import CheckImageViewer from './CheckImageViewer';
import DocumentAttachmentViewer from './DocumentAttachmentViewer';

const SOURCE_TITLE_KEY = {
  RECEIPT: 'nav_receipt',
  PAYMENT: 'nav_payment',
  JOURNAL: 'nav_voucher',
  BANK_ENTRY: 'nav_bank_entry',
  PURCHASE_INVOICE: 'nav_purchase_invoice',
  CREDIT_NOTE: 'nav_credit_note',
  DEBIT_NOTE: 'nav_debit_note',
};

export default function DocumentPrintView({ document: doc, showPrintButton = true, onAttachmentChange }) {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  if (!doc) return null;

  const title = t(SOURCE_TITLE_KEY[doc.sourceType] || 'nav_voucher');
  const canAttachPurchase = doc.sourceType === 'PURCHASE_INVOICE';
  const showForeignCols = doc.lines.some(
    (line) => (line.foreignDebit > 0 || line.foreignCredit > 0)
      && (line.currencyCode || line.exchangeRate > 1)
  );

  return (
    <div className="print-document dc-doc-print">
      <div className="dc-doc-print-toolbar no-print">
        {showPrintButton && <PrintButton />}
      </div>
      <PrintHeader title={title} subtitle={doc.memo || undefined} />
      <div className="print-summary dc-doc-print-meta">
        <div><strong>{t('voucher_date')}:</strong> {date(doc.date)}</div>
        {doc.createdByName && (
          <div><strong>{t('doc_created_by')}:</strong> {doc.createdByName}</div>
        )}
        {doc.currencyCode && (
          <div><strong>{t('currency_symbol')}:</strong> {doc.currencySymbol || doc.currencyCode}</div>
        )}
        <div><strong>{t('doc_number')}:</strong> {doc.entryNumber || `#${String(doc.id).slice(0, 8)}`}</div>
      </div>

      <table className="w-full text-sm print-table">
        <thead>
          <tr>
            <th>{t('trial_balance_col_code')}</th>
            <th>{t('trial_balance_col_name')}</th>
            <th>{t('ledger_col_details')}</th>
            {showForeignCols && (
              <>
                <th>{t('voucher_debit_foreign')}</th>
                <th>{t('voucher_credit_foreign')}</th>
                <th>{t('voucher_line_currency')}</th>
                <th>{t('voucher_exchange_rate')}</th>
              </>
            )}
            <th>{t('voucher_debit')}</th>
            <th>{t('voucher_credit')}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, i) => (
            <tr key={i}>
              <td>{line.accountCode}</td>
              <td>
                {line.accountName}
                {line.partyName ? ` (${line.partyName})` : ''}
              </td>
              <td>{line.lineMemo || '—'}</td>
              {showForeignCols && (
                <>
                  <td className="dc-money">
                    {line.foreignDebit > 0
                      ? `${Number(line.foreignDebit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${line.currencySymbol || line.currencyCode || ''}`.trim()
                      : '—'}
                  </td>
                  <td className="dc-money">
                    {line.foreignCredit > 0
                      ? `${Number(line.foreignCredit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${line.currencySymbol || line.currencyCode || ''}`.trim()
                      : '—'}
                  </td>
                  <td>{line.currencyCode || '—'}</td>
                  <td className="dc-num">{line.exchangeRate != null ? Number(line.exchangeRate).toFixed(4) : '—'}</td>
                </>
              )}
              <td className="dc-money">{line.debit > 0 ? money(line.debit) : '—'}</td>
              <td className="dc-money">{line.credit > 0 ? money(line.credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={showForeignCols ? 7 : 3}>{t('trial_balance_totals')}</td>
            <td className="dc-money">{money(doc.totalDebit)}</td>
            <td className="dc-money">{money(doc.totalCredit)}</td>
          </tr>
        </tfoot>
      </table>

      {(doc.hasAttachment || canAttachPurchase) && (
        <DocumentAttachmentViewer
          entryId={doc.id}
          hasAttachment={Boolean(doc.hasAttachment)}
          attachmentMime={doc.attachmentMime}
          canUpload={canAttachPurchase}
          onUploaded={(result) => onAttachmentChange?.(result)}
        />
      )}

      {Array.isArray(doc.checks) && doc.checks.length > 0 && (
        <div className="dc-doc-print-checks">
          <h4>{t('doc_checks_section')}</h4>
          <table className="w-full text-sm print-table">
            <thead>
              <tr>
                <th>{t('check_col_number')}</th>
                <th>{t('check_col_bank')}</th>
                <th>{t('check_col_due')}</th>
                <th>{t('check_drawer')}</th>
                <th>{t('check_col_amount')}</th>
              </tr>
            </thead>
            <tbody>
              {doc.checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.checkNumber}</td>
                  <td>{c.bankName}</td>
                  <td>{date(c.dueDate)}</td>
                  <td>{c.drawerName || '—'}</td>
                  <td className="dc-money">{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dc-doc-check-images no-print">
            {doc.checks.map((c) => (
              (c.hasFrontImage || c.hasBackImage) ? (
                <div key={`img-${c.id}`} className="dc-doc-check-images-block">
                  <div className="dc-muted text-sm">
                    {t('check_col_number')}: <strong>{c.checkNumber}</strong>
                  </div>
                  <CheckImageViewer
                    checkId={c.id}
                    hasFrontImage={c.hasFrontImage}
                    hasBackImage={c.hasBackImage}
                  />
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { SOURCE_TITLE_KEY };
