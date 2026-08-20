import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function DocumentImageAttach({
  file,
  onChange,
  titleKey = 'doc_attachment_title',
  hintKey = 'doc_attachment_hint',
  inputId = 'doc-attachment',
}) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState(null);
  const isPdf = Boolean(file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')));

  useEffect(() => {
    if (!file || isPdf) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isPdf]);

  return (
    <div className="dc-doc-attach">
      <div className="dc-check-images-title">
        <i className="fa-solid fa-file-image" /> {t(titleKey)}
        <span className="dc-muted text-sm">{t(hintKey)}</span>
      </div>
      <div className="dc-check-img-slot">
        <div className="dc-check-img-slot-head">
          <span>{t('doc_attachment_file')}</span>
          {file && (
            <button type="button" className="dc-ghost" onClick={() => onChange(null)}>
              {t('check_image_clear')}
            </button>
          )}
        </div>
        {previewUrl ? (
          <img src={previewUrl} alt="" className="dc-check-img-preview" />
        ) : file && isPdf ? (
          <div className="dc-doc-attach-pdf">
            <i className="fa-solid fa-file-pdf" />
            <span>{file.name || t('doc_attachment_pdf')}</span>
          </div>
        ) : (
          <label htmlFor={inputId} className="dc-check-img-pick">
            <i className="fa-solid fa-camera" />
            <span>{t('check_image_pick')}</span>
          </label>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*,application/pdf"
          capture="environment"
          className="dc-sr-only"
          onChange={(e) => {
            onChange(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
        {file && (
          <label htmlFor={inputId} className="dc-check-img-replace">
            {t('check_image_replace')}
          </label>
        )}
      </div>
    </div>
  );
}
