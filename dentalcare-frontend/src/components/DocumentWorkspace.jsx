import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import PartyModal from './PartyModal';
import DocumentPrintView from './DocumentPrintView';
import FormattedDateInput from './FormattedDateInput';
import { DocumentWorkspaceContext } from '../context/DocumentWorkspaceContext';

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

function formatDraftWhen(iso, dateFn) {
  if (!iso) return '—';
  try {
    return dateFn(iso.slice(0, 10));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function DocumentWorkspace({
  sourceType,
  titleKey,
  successKey,
  children,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { money, date, reload: reloadSettings } = useSettings();
  const [browseMode, setBrowseMode] = useState(null);
  const [fromDate, setFromDate] = useState(monthStartIso);
  const [toDate, setToDate] = useState(todayIso);
  const [rows, setRows] = useState([]);
  const [draftRows, setDraftRows] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [printDocs, setPrintDocs] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [draftHandlers, setDraftHandlers] = useState(null);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [loadedDraft, setLoadedDraft] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const browseOpen = browseMode !== null;

  const loadPostedList = useCallback(async () => {
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

  const loadDraftList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/document-drafts', { sourceType });
      setDraftRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      setDraftRows([]);
    } finally {
      setLoading(false);
    }
  }, [sourceType, t]);

  useEffect(() => {
    setRows([]);
    setDraftRows([]);
    setViewDoc(null);
    setBrowseMode(null);
    setPrintDocs(null);
    setError(null);
    setActiveDraftId(null);
    setLoadedDraft(null);
    setDraftHandlers(null);
  }, [user?.tenantId, sourceType]);

  const filteredPostedRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.entryNumber,
        row.partyNames,
        row.memo,
        row.id,
        row.createdByName,
        row.amount,
        date(row.date),
        money(row.amount),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchText, date, money]);

  const filteredDraftRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return draftRows;
    return draftRows.filter((row) => {
      const hay = [
        row.summary,
        row.createdByName,
        formatDraftWhen(row.updatedAt, date),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [draftRows, searchText, date]);

  useEffect(() => {
    if (!browseOpen) return;
    setViewDoc(null);
    if (browseMode === 'posted') loadPostedList();
    else if (browseMode === 'pending') loadDraftList();
  }, [browseOpen, browseMode, loadPostedList, loadDraftList]);

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
      setBrowseMode(null);
      setViewDoc(null);
      setPrintDocs(docs);
      setTimeout(() => window.print(), 120);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function clearActiveDraft() {
    if (!activeDraftId) return;
    try {
      await api.delete(`/document-drafts/${activeDraftId}`);
    } catch (err) {
      console.error('Deleting draft after post failed:', err);
    }
    setActiveDraftId(null);
    setLoadedDraft(null);
  }

  async function handlePosted(result) {
    await clearActiveDraft();
    alert(t(successKey));
    reloadSettings?.();
    const ids = collectEntryIds(result);
    if (ids.length === 0) return;
    const shouldPrint = window.confirm(t('doc_print_confirm'));
    if (shouldPrint) openPrint(ids);
  }

  async function savePendingDraft() {
    if (!draftHandlers?.getPayload) {
      alert(t('doc_draft_nothing_to_save'));
      return;
    }
    const payload = draftHandlers.getPayload();
    const summary = draftHandlers.getSummary?.() || '';
    setSavingDraft(true);
    setError(null);
    try {
      if (activeDraftId) {
        await api.put(`/document-drafts/${activeDraftId}`, { summary, payload });
      } else {
        const created = await api.post('/document-drafts', { sourceType, summary, payload });
        setActiveDraftId(created.id);
        setLoadedDraft(created);
      }
      alert(t('doc_draft_saved'));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSavingDraft(false);
    }
  }

  function openDraftForEdit(draft) {
    setLoadedDraft(draft);
    setActiveDraftId(draft.id);
    setBrowseMode(null);
    setSearchText('');
  }

  async function deleteDraft(id) {
    if (!window.confirm(t('doc_draft_delete_confirm'))) return;
    try {
      await api.delete(`/document-drafts/${id}`);
      if (activeDraftId === id) {
        setActiveDraftId(null);
        setLoadedDraft(null);
      }
      setDraftRows((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  function closeBrowse() {
    setBrowseMode(null);
    setViewDoc(null);
    setSearchText('');
  }

  const child = typeof children === 'function'
    ? children({
      onPosted: handlePosted,
      draft: loadedDraft,
      registerDraftHandlers: setDraftHandlers,
      activeDraftId,
    })
    : children;

  const modalTitle = browseMode === 'pending'
    ? `${t('doc_pending_title')} — ${t(titleKey)}`
    : viewDoc
      ? `${t('doc_view_readonly')} — ${t(titleKey)}`
      : `${t('doc_browse_title')} — ${t(titleKey)}`;

  return (
    <div className="dc-doc-workspace">
      <div className="dc-doc-browse-group no-print">
        <button
          type="button"
          className="dc-doc-browse-btn"
          onClick={() => setBrowseMode('posted')}
          title={t('doc_browse_title')}
        >
          <i className="fa-solid fa-folder-open" />
          <span>{t('doc_browse')}</span>
        </button>
        <button
          type="button"
          className="dc-doc-browse-btn dc-doc-pending-btn"
          onClick={() => setBrowseMode('pending')}
          title={t('doc_pending_title')}
        >
          <i className="fa-solid fa-clock" />
          <span>{t('doc_pending')}</span>
        </button>
        <button
          type="button"
          className="dc-doc-save-draft-btn"
          onClick={savePendingDraft}
          disabled={savingDraft}
          title={t('doc_draft_save')}
        >
          <i className="fa-solid fa-floppy-disk" />
          <span>{savingDraft ? t('doc_draft_saving') : t('doc_draft_save')}</span>
        </button>
      </div>

      {activeDraftId && (
        <div className="dc-doc-draft-banner no-print">
          <span className="dc-badge dc-badge-amber">{t('doc_draft_editing')}</span>
        </div>
      )}

      <DocumentWorkspaceContext.Provider value={{ sourceType }}>
        {child}
      </DocumentWorkspaceContext.Provider>

      <PartyModal
        open={browseOpen}
        wide
        title={modalTitle}
        onClose={closeBrowse}
      >
        <div className="dc-doc-browse">
          {browseMode === 'posted' && viewDoc ? (
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
          ) : browseMode === 'posted' ? (
            <>
              <p className="dc-muted text-sm no-print">{t('doc_browse_readonly_hint')}</p>
              <div className="dc-doc-browse-filters no-print">
                <label className="dc-doc-browse-search">
                  <span>{t('doc_search')}</span>
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={t('doc_search_placeholder')}
                  />
                </label>
                <label>
                  <span>{t('doc_filter_from')}</span>
                  <FormattedDateInput value={fromDate} onChange={setFromDate} />
                </label>
                <label>
                  <span>{t('doc_filter_to')}</span>
                  <FormattedDateInput value={toDate} onChange={setToDate} />
                </label>
                <button type="button" className="dc-doc-browse-refresh" onClick={loadPostedList} disabled={loading}>
                  {loading ? t('ledger_loading') : t('ledger_show')}
                </button>
              </div>
              {error && <div className="dc-error">{error}</div>}
              {viewLoading && <div>{t('ledger_loading')}</div>}
              {!loading && !viewLoading && rows.length === 0 && (
                <div className="dc-muted">{t('doc_browse_empty')}</div>
              )}
              {!loading && !viewLoading && rows.length > 0 && filteredPostedRows.length === 0 && (
                <div className="dc-muted">{t('doc_browse_no_results')}</div>
              )}
              {filteredPostedRows.length > 0 && (
                <div className="dc-doc-browse-table-wrap">
                  <table className="dc-doc-browse-table text-sm">
                    <thead>
                      <tr>
                        <th>{t('doc_col_number')}</th>
                        <th>{t('voucher_date')}</th>
                        <th>{t('doc_col_summary')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('doc_created_by')}</th>
                        <th className="no-print">{t('doc_attachment_col')}</th>
                        <th>{t('check_col_actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPostedRows.map((row) => (
                        <tr
                          key={row.id}
                          className="dc-doc-browse-row"
                          onClick={() => loadDocument(row.id)}
                        >
                          <td className="dc-doc-browse-number">{row.entryNumber || '—'}</td>
                          <td className="dc-doc-browse-date">{date(row.date)}</td>
                          <td className="dc-doc-browse-summary">
                            <div className="dc-doc-browse-summary-main">
                              {row.partyNames || row.memo || '—'}
                            </div>
                            {row.partyNames && row.memo && (
                              <div className="dc-muted text-sm">{row.memo}</div>
                            )}
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
          ) : (
            <>
              <p className="dc-muted text-sm no-print">{t('doc_pending_hint')}</p>
              <div className="dc-doc-browse-filters no-print">
                <label className="dc-doc-browse-search">
                  <span>{t('doc_search')}</span>
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={t('doc_search_placeholder')}
                  />
                </label>
                <button type="button" className="dc-doc-browse-refresh" onClick={loadDraftList} disabled={loading}>
                  {loading ? t('ledger_loading') : t('ledger_show')}
                </button>
              </div>
              {error && <div className="dc-error">{error}</div>}
              {!loading && draftRows.length === 0 && (
                <div className="dc-muted">{t('doc_pending_empty')}</div>
              )}
              {!loading && draftRows.length > 0 && filteredDraftRows.length === 0 && (
                <div className="dc-muted">{t('doc_pending_no_results')}</div>
              )}
              {filteredDraftRows.length > 0 && (
                <div className="dc-doc-browse-table-wrap">
                  <table className="dc-doc-browse-table text-sm">
                    <thead>
                      <tr>
                        <th>{t('doc_col_summary')}</th>
                        <th>{t('doc_draft_updated')}</th>
                        <th>{t('doc_created_by')}</th>
                        <th>{t('check_col_actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDraftRows.map((row) => (
                        <tr key={row.id} className="dc-doc-browse-row">
                          <td className="dc-doc-browse-summary">
                            <div className="dc-doc-browse-summary-main">
                              {row.summary || t('doc_draft_untitled')}
                            </div>
                          </td>
                          <td className="dc-doc-browse-date">{formatDraftWhen(row.updatedAt, date)}</td>
                          <td>{row.createdByName || '—'}</td>
                          <td>
                            <div className="dc-doc-view-actions">
                              <button type="button" onClick={() => openDraftForEdit(row)}>
                                {t('doc_draft_continue')}
                              </button>
                              <button type="button" className="dc-ghost-light" onClick={() => deleteDraft(row.id)}>
                                {t('doc_draft_delete')}
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
