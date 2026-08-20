import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function ImageSlot({ label, file, previewUrl, onPick, onClear, inputId }) {
  const { t } = useTranslation();
  return (
    <div className="dc-check-img-slot">
      <div className="dc-check-img-slot-head">
        <span>{label}</span>
        {file && (
          <button type="button" className="dc-ghost" onClick={onClear}>
            {t('check_image_clear')}
          </button>
        )}
      </div>
      {previewUrl ? (
        <img src={previewUrl} alt={label} className="dc-check-img-preview" />
      ) : (
        <label htmlFor={inputId} className="dc-check-img-pick">
          <i className="fa-solid fa-camera" />
          <span>{t('check_image_pick')}</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="dc-sr-only"
        onChange={(e) => {
          const next = e.target.files?.[0] || null;
          onPick(next);
          e.target.value = '';
        }}
      />
      {previewUrl && (
        <label htmlFor={inputId} className="dc-check-img-replace">
          {t('check_image_replace')}
        </label>
      )}
    </div>
  );
}

export default function CheckImageAttach({ check, onChange }) {
  const { t } = useTranslation();
  const [frontUrl, setFrontUrl] = useState(null);
  const [backUrl, setBackUrl] = useState(null);

  useEffect(() => {
    if (!check.imageFront) {
      setFrontUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(check.imageFront);
    setFrontUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [check.imageFront]);

  useEffect(() => {
    if (!check.imageBack) {
      setBackUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(check.imageBack);
    setBackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [check.imageBack]);

  const baseId = check.idempotencyKey || 'check';

  return (
    <div className="dc-check-images-attach">
      <div className="dc-check-images-title">
        <i className="fa-solid fa-image" /> {t('check_images_title')}
        <span className="dc-muted text-sm">{t('check_images_hint')}</span>
      </div>
      <div className="dc-check-images-grid">
        <ImageSlot
          label={t('check_image_front')}
          file={check.imageFront}
          previewUrl={frontUrl}
          inputId={`${baseId}-front`}
          onPick={(file) => onChange({ ...check, imageFront: file })}
          onClear={() => onChange({ ...check, imageFront: null })}
        />
        <ImageSlot
          label={t('check_image_back')}
          file={check.imageBack}
          previewUrl={backUrl}
          inputId={`${baseId}-back`}
          onPick={(file) => onChange({ ...check, imageBack: file })}
          onClear={() => onChange({ ...check, imageBack: null })}
        />
      </div>
    </div>
  );
}
