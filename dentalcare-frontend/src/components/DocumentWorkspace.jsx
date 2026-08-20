import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PartyModal from './PartyModal';
import DocumentPrintView from './DocumentPrintView';
import FormattedDateInput from './FormattedDateInput';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function collectEntryIds(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.journalEntryIds) && result.journalEntryIds.length > 0) {
    return result.journalEntryIds.filter(Boolean);
  }
  if (result.journalEntryId) return [result.journalEntryId];
  return [];
}

export default function DocumentWorkspace({
  sourceType,
  titleKey,
  successKey,
  children,
}) {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [printDocs, setPrintDocs] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/journal-entries', {
        sourceType,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 100,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [sourceType, fromDate, toDate, t]);

  useEffect(() => {
    if (browseOpen) {
      setViewDoc(null);
      loadList();
    }
  }, [browseOpen, loadList]);

  useEffect(() => {
    if (!printDocs) return undefined;
    const done = () => setPrintDocs(null);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, [printDocs]);

  async function loadDocument(id) {
    setViewLoading(true);
    setError(null);
    try {
      const doc = await api.get(`/journal-entries/${id}`);
      setViewDoc(doc);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      setViewDoc(null);
    } finally {
      setViewLoading(false);
    }
  }

  async function openPrint(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return;
    try {
      const docs = [];
      for (const id of unique) {
        docs.push(await api.get(`/journal-entries/${id}`));
      }
      setBrowseOpen(false);
      setViewDoc(null);
      setPrintDocs(docs);
      setTimeout(() => window.print(), 120);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  function handlePosted(result) {
    alert(t(successKey));
    const ids = collectEntryIds(result);
    if (ids.length === 0) return;
    const shouldPrint = window.confirm(t('doc_print_confirm'));
    if (shouldPrint) openPrint(ids);
  }

  function closeBrowse() {
    setBrowseOpen(false);
    setViewDoc(null);
  }

  const child = typeof children === 'function'
    ? children({ onPosted: handlePosted })
    : children;

  return (
    <div className="dc-doc-workspace">
      <button
        type="button"
        className="dc-doc-browse-btn no-print"
        onClick={() => setBrowseOpen(true)}
        title={t('doc_browse_title')}
      >
        <i className="fa-solid fa-folder-open" />
        <span>{t('doc_browse')}</span>
      </button>

      {child}

      <PartyModal
        open={browseOpen}
        wide
        title={viewDoc
          ? `${t('doc_view_readonly')} — ${t(titleKey)}`
          : `${t('doc_browse_title')} — ${t(titleKey)}`}
        onClose={closeBrowse}
      >
        <div className="dc-doc-browse">
          {viewDoc ? (
            <div className="dc-doc-view-readonly">
              <div className="dc-doc-view-banner no-print">
                <span className="dc-badge dc-badge-amber">{t('doc_view_readonly')}</span>
                <div className="dc-doc-view-actions">
                  <button type="button" onClick={() => openPrint([viewDoc.id])}>
                    {t('print')}
                  </button>
                  <button type="button" className="dc-ghost-light" onClick={() => setViewDoc(null)}>
                    {t('doc_back_to_list')}
                  </button>
                </div>
              </div>
              <DocumentPrintView
                document={viewDoc}
                showPrintButton={false}
                onAttachmentChange={(result) => {
                  setViewDoc((prev) => (prev ? {
                    ...prev,
                    hasAttachment: Boolean(result?.hasAttachment ?? true),
                    attachmentMime: result?.attachmentMime || prev.attachmentMime,
                  } : prev));
                  setRows((prev) => prev.map((r) => (
                    r.id === viewDoc.id
                      ? { ...r, hasAttachment: Boolean(result?.hasAttachment ?? true) }
                      : r
                  )));
                }}
              />
            </div>
          ) : (
            <>
              <p className="dc-muted text-sm no-print">{t('doc_browse_readonly_hint')}</p>
              <div className="dc-doc-browse-filters no-print">
                <label>
                  <span>{t('doc_filter_from')}</span>
                  <FormattedDateInput value={fromDate} onChange={setFromDate} />
                </label>
                <label>
                  <span>{t('doc_filter_to')}</span>
                  <FormattedDateInput value={toDate} onChange={setToDate} />
                </label>
                <button type="button" className="dc-doc-browse-refresh" onClick={loadList} disabled={loading}>
                  {loading ? t('ledger_loading') : t('ledger_show')}
                </button>
              </div>
              {error && <div className="dc-error">{error}</div>}
              {viewLoading && <div>{t('ledger_loading')}</div>}
              {!loading && !viewLoading && rows.length === 0 && (
                <div className="dc-muted">{t('doc_browse_empty')}</div>
              )}
              {rows.length > 0 && (
                <div className="dc-doc-browse-table-wrap">
                  <table className="dc-doc-browse-table text-sm">
                    <thead>
                      <tr>
                        <th>{t('voucher_date')}</th>
                        <th>{t('doc_col_summary')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('doc_created_by')}</th>
                        <th className="no-print">{t('doc_attachment_col')}</th>
                        <th>{t('check_col_actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          className="dc-doc-browse-row"
                          onClick={() => loadDocument(row.id)}
                        >
                          <td className="dc-doc-browse-date">{date(row.date)}</td>
                          <td className="dc-doc-browse-summary">
                            <div className="dc-doc-browse-summary-main">
                              {row.partyNames || row.memo || '—'}
                            </div>
                            {row.partyNames && row.memo && (
                              <div className="dc-muted text-sm">{row.memo}</div>
                            )}
                            <div className="dc-muted text-sm">#{String(row.id).slice(0, 8)}</div>
                          </td>
                          <td className="dc-money">{money(row.amount)}</td>
                          <td>{row.createdByName || '—'}</td>
                          <td className="no-print">
                            {row.hasAttachment
                              ? (
                                <span className="dc-check-img-badge" title={t('doc_attachment_view')}>
                                  <i className="fa-solid fa-paperclip" />
                                </span>
                              )
                              : <span className="dc-muted">—</span>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="dc-doc-view-actions">
                              <button type="button" onClick={() => loadDocument(row.id)}>
                                {t('doc_view')}
                              </button>
                              <button type="button" onClick={() => openPrint([row.id])}>
                                {t('print')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </PartyModal>

      {printDocs && (
        <div className="dc-print-sheet">
          {printDocs.map((doc) => (
            <DocumentPrintView key={doc.id} document={doc} showPrintButton={false} />
          ))}
        </div>
      )}
    </div>
  );
}
