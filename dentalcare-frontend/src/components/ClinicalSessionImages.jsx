import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

function Thumb({ sessionId, image, onOpen }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    (async () => {
      try {
        objectUrl = await api.fetchBlobUrl(`/clinical/sessions/${sessionId}/images/${image.id}`);
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
      } catch {
        if (!revoked) setUrl(null);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, image.id]);

  return (
    <button
      type="button"
      className={`dc-clinical-xray-thumb${image.hasAiReport ? ' has-report' : ''}`}
      onClick={() => onOpen(image, url)}
      title={image.label || t('clinical_xray_image')}
    >
      {url ? <img src={url} alt="" /> : <span className="dc-muted">…</span>}
      {image.hasAiReport && <i className="fa-solid fa-robot dc-clinical-xray-ai-badge" />}
    </button>
  );
}

export default function ClinicalSessionImages({
  sessionId,
  images = [],
  canEdit = false,
  aiAvailable = false,
  onChanged,
}) {
  const { t, i18n } = useTranslation();
  const [lightbox, setLightbox] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadMore(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      await api.uploadForm(`/clinical/sessions/${sessionId}/images`, form);
      onChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId) {
    if (!confirm(t('clinical_xray_remove_confirm'))) return;
    try {
      await api.delete(`/clinical/sessions/${sessionId}/images/${imageId}`);
      setLightbox(null);
      onChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function analyzeImage(image) {
    setAnalyzing(true);
    try {
      const result = await api.post(
        `/clinical/sessions/${sessionId}/images/${image.id}/analyze`,
        { locale: i18n.language }
      );
      setLightbox((prev) => (prev ? {
        ...prev,
        image: result.image || { ...image, ...result.image },
      } : prev));
      onChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setAnalyzing(false);
    }
  }

  const current = lightbox?.image;

  return (
    <div className="dc-clinical-session-images no-print">
      <div className="dc-clinical-images-strip">
        {images.map((img) => (
          <Thumb
            key={img.id}
            sessionId={sessionId}
            image={img}
            onOpen={(image, url) => setLightbox({ image, url })}
          />
        ))}
        {canEdit && (
          <label className="dc-clinical-xray-add-mini">
            <i className="fa-solid fa-plus" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              multiple
              className="dc-sr-only"
              disabled={uploading}
              onChange={(e) => {
                uploadMore(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {lightbox && (
        <div className="dc-check-lightbox dc-clinical-xray-lightbox" role="dialog" onClick={() => setLightbox(null)}>
          <div className="dc-clinical-xray-lightbox-body" onClick={(e) => e.stopPropagation()}>
            {lightbox.url && <img src={lightbox.url} alt="" />}
            <div className="dc-clinical-xray-lightbox-side">
              <p className="dc-clinical-ai-disclaimer">{t('clinical_ai_disclaimer')}</p>
              <p className="dc-ai-privacy-note">{t('clinical_ai_privacy_note')}</p>
              {current?.aiReport ? (
                <div className="dc-clinical-ai-report">
                  <h4>{t('clinical_ai_report_title')}</h4>
                  <pre>{current.aiReport}</pre>
                </div>
              ) : (
                <div className="dc-muted text-sm">{t('clinical_ai_no_report')}</div>
              )}
              <div className="dc-doc-view-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="dc-success"
                    disabled={analyzing || !aiAvailable}
                    title={!aiAvailable ? t('clinical_ai_unavailable') : undefined}
                    onClick={() => analyzeImage(current)}
                  >
                    {analyzing
                      ? t('clinical_ai_analyzing')
                      : (current?.hasAiReport || current?.aiReport
                        ? t('clinical_ai_reanalyze')
                        : t('clinical_ai_analyze'))}
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="dc-danger" onClick={() => removeImage(current.id)}>
                    {t('clinical_xray_remove')}
                  </button>
                )}
                <button type="button" className="dc-ghost" onClick={() => setLightbox(null)}>
                  {t('close')}
                </button>
              </div>
              {!aiAvailable && canEdit && (
                <div className="dc-muted text-sm">{t('clinical_ai_unavailable')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
