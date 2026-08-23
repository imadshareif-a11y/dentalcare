import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import useEscapeClose from '../hooks/useEscapeClose';

export default function DocumentAttachmentViewer({
  entryId,
  hasAttachment = false,
  attachmentMime = null,
  canUpload = false,
  onUploaded,
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);
  const [mime, setMime] = useState(attachmentMime);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEscapeClose(lightbox, () => setLightbox(false));

  useEffect(() => {
    setMime(attachmentMime);
  }, [attachmentMime]);

  useEffect(() => {
    if (!hasAttachment || !entryId) {
      setUrl(null);
      return undefined;
    }
    let revoked = false;
    let objectUrl = null;
    (async () => {
      try {
        objectUrl = await api.fetchBlobUrl(`/journal-entries/${entryId}/attachment`);
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
        setError(null);
      } catch (err) {
        if (!revoked) {
          setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
        }
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entryId, hasAttachment, t]);

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.uploadForm(`/journal-entries/${entryId}/attachment`, form);
      onUploaded?.(result);
      setMime(result.attachmentMime || file.type);
      // refresh preview
      if (url) URL.revokeObjectURL(url);
      const nextUrl = await api.fetchBlobUrl(`/journal-entries/${entryId}/attachment`);
      setUrl(nextUrl);
      setError(null);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setUploading(false);
    }
  }

  if (!hasAttachment && !canUpload) return null;

  const isPdf = (mime || '').includes('pdf');

  return (
    <div className="dc-doc-attach-view no-print">
      <div className="dc-check-images-title">
        <i className="fa-solid fa-file-image" /> {t('doc_attachment_view')}
      </div>

      {hasAttachment && url && !isPdf && (
        <button type="button" className="dc-check-img-thumb" onClick={() => setLightbox(true)}>
          <img src={url} alt={t('doc_attachment_view')} />
          <span>{t('doc_attachment_open')}</span>
        </button>
      )}

      {hasAttachment && url && isPdf && (
        <a className="dc-doc-attach-pdf-link" href={url} target="_blank" rel="noreferrer">
          <i className="fa-solid fa-file-pdf" /> {t('doc_attachment_open_pdf')}
        </a>
      )}

      {hasAttachment && !url && !error && (
        <div className="dc-muted text-sm">{t('ledger_loading')}</div>
      )}
      {error && <div className="dc-muted text-sm">{error}</div>}

      {canUpload && (
        <label className="dc-check-img-pick" style={{ marginTop: 8 }}>
          <i className="fa-solid fa-camera" />
          <span>
            {uploading
              ? t('ledger_loading')
              : (hasAttachment ? t('check_image_replace') : t('doc_attachment_attach'))}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*,application/pdf"
            capture="environment"
            className="dc-sr-only"
            disabled={uploading}
            onChange={(e) => {
              uploadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {lightbox && url && (
        <div className="dc-check-lightbox" role="dialog" onClick={() => setLightbox(false)}>
          <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="dc-ghost" onClick={() => setLightbox(false)}>
            {t('close')}
          </button>
        </div>
      )}
    </div>
  );
}
