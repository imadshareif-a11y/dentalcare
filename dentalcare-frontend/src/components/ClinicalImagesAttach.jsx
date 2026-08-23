import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import useEscapeClose from '../hooks/useEscapeClose';

function newItemKey() {
  return `xray-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ClinicalImagesAttach({
  items = [],
  onChange,
  aiAvailable = false,
  inputId = 'clinical-xray-files',
}) {
  const { t, i18n } = useTranslation();
  const [previews, setPreviews] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  useEscapeClose(lightboxIndex != null, () => setLightboxIndex(null));

  useEffect(() => {
    const urls = items.map((item) => URL.createObjectURL(item.file));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [items]);

  function addFiles(list) {
    const next = [...items];
    for (const file of list || []) {
      if (!file.type.startsWith('image/')) continue;
      next.push({ key: newItemKey(), file, aiReport: null, aiModel: null });
    }
    onChange(next.slice(0, 20));
  }

  function removeAt(index) {
    onChange(items.filter((_, i) => i !== index));
    setLightboxIndex((prev) => {
      if (prev == null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  }

  async function analyzeAt(index) {
    const item = items[index];
    if (!item?.file) return;
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append('file', item.file);
      form.append('locale', i18n.language);
      const result = await api.uploadForm('/clinical/ai/analyze-preview', form);
      onChange(items.map((row, i) => (
        i === index
          ? { ...row, aiReport: result.report || null, aiModel: result.model || null }
          : row
      )));
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setAnalyzing(false);
    }
  }

  const current = lightboxIndex != null ? items[lightboxIndex] : null;
  const currentUrl = lightboxIndex != null ? previews[lightboxIndex] : null;

  return (
    <div className="dc-clinical-images-attach">
      <div className="dc-check-images-title">
        <i className="fa-solid fa-x-ray" /> {t('clinical_xray_title')}
        <span className="dc-muted text-sm">{t('clinical_xray_hint')}</span>
      </div>
      {items.length > 0 && (
        <p className="dc-muted text-sm">{t('clinical_ai_analyze_before_hint')}</p>
      )}

      <div className="dc-clinical-images-previews">
        {previews.map((url, i) => (
          <div key={items[i]?.key || `${url}-${i}`} className="dc-clinical-img-preview-card">
            <button
              type="button"
              className={`dc-clinical-xray-thumb${items[i]?.aiReport ? ' has-report' : ''}`}
              onClick={() => setLightboxIndex(i)}
              title={t('clinical_xray_image')}
            >
              <img src={url} alt="" />
              {items[i]?.aiReport && <i className="fa-solid fa-robot dc-clinical-xray-ai-badge" />}
            </button>
            <button type="button" className="dc-danger" onClick={() => removeAt(i)}>×</button>
          </div>
        ))}
        <label htmlFor={inputId} className="dc-check-img-pick dc-clinical-img-add">
          <i className="fa-solid fa-camera" />
          <span>{t('clinical_xray_add')}</span>
        </label>
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        multiple
        className="dc-sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {current && currentUrl && (
        <div className="dc-check-lightbox dc-clinical-xray-lightbox" role="dialog" onClick={() => setLightboxIndex(null)}>
          <div className="dc-clinical-xray-lightbox-body" onClick={(e) => e.stopPropagation()}>
            <img src={currentUrl} alt="" />
            <div className="dc-clinical-xray-lightbox-side">
              <p className="dc-clinical-ai-disclaimer">{t('clinical_ai_disclaimer')}</p>
              <p className="dc-ai-privacy-note">{t('clinical_ai_privacy_note')}</p>
              {current.aiReport ? (
                <div className="dc-clinical-ai-report">
                  <h4>{t('clinical_ai_report_title')}</h4>
                  <pre>{current.aiReport}</pre>
                </div>
              ) : (
                <div className="dc-muted text-sm">{t('clinical_ai_no_report')}</div>
              )}
              <div className="dc-doc-view-actions">
                <button
                  type="button"
                  className="dc-success"
                  disabled={analyzing || !aiAvailable}
                  title={!aiAvailable ? t('clinical_ai_unavailable') : undefined}
                  onClick={() => analyzeAt(lightboxIndex)}
                >
                  {analyzing
                    ? t('clinical_ai_analyzing')
                    : (current.aiReport ? t('clinical_ai_reanalyze') : t('clinical_ai_analyze'))}
                </button>
                <button type="button" className="dc-danger" onClick={() => removeAt(lightboxIndex)}>
                  {t('clinical_xray_remove')}
                </button>
                <button type="button" className="dc-ghost" onClick={() => setLightboxIndex(null)}>
                  {t('close')}
                </button>
              </div>
              {!aiAvailable && (
                <div className="dc-muted text-sm">{t('clinical_ai_unavailable')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
