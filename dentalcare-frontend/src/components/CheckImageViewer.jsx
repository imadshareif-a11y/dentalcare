import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import useEscapeClose from '../hooks/useEscapeClose';

function SideThumb({ checkId, side, label, open, onOpen }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    (async () => {
      try {
        objectUrl = await api.fetchBlobUrl(`/checks/${checkId}/images/${side}`);
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setUrl(objectUrl);
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
  }, [checkId, side, t]);

  if (error) return <div className="dc-muted text-sm">{error}</div>;
  if (!url) return <div className="dc-muted text-sm">{t('ledger_loading')}</div>;

  return (
    <button
      type="button"
      className={`dc-check-img-thumb${open ? ' is-open' : ''}`}
      onClick={() => onOpen(side, url)}
      title={label}
    >
      <img src={url} alt={label} />
      <span>{label}</span>
    </button>
  );
}

export default function CheckImageViewer({
  checkId,
  hasFrontImage = false,
  hasBackImage = false,
  canUpload = false,
  onUploaded,
}) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  useEscapeClose(Boolean(lightbox), () => setLightbox(null));

  if (!hasFrontImage && !hasBackImage && !canUpload) return null;

  async function uploadSide(side, file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append(side, file);
      await api.uploadForm(`/checks/${checkId}/images`, form);
      onUploaded?.(side);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dc-check-images-view no-print">
      <div className="dc-check-images-title">
        <i className="fa-solid fa-images" /> {t('check_images_view')}
      </div>
      <div className="dc-check-images-grid">
        {hasFrontImage ? (
          <SideThumb
            checkId={checkId}
            side="front"
            label={t('check_image_front')}
            open={lightbox?.side === 'front'}
            onOpen={(side, url) => setLightbox({ side, url })}
          />
        ) : canUpload ? (
          <label className="dc-check-img-pick">
            <i className="fa-solid fa-camera" />
            <span>{uploading ? t('ledger_loading') : t('check_image_attach_front')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              className="dc-sr-only"
              disabled={uploading}
              onChange={(e) => {
                uploadSide('front', e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        ) : null}

        {hasBackImage ? (
          <SideThumb
            checkId={checkId}
            side="back"
            label={t('check_image_back')}
            open={lightbox?.side === 'back'}
            onOpen={(side, url) => setLightbox({ side, url })}
          />
        ) : canUpload ? (
          <label className="dc-check-img-pick">
            <i className="fa-solid fa-camera" />
            <span>{uploading ? t('ledger_loading') : t('check_image_attach_back')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              className="dc-sr-only"
              disabled={uploading}
              onChange={(e) => {
                uploadSide('back', e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        ) : null}
      </div>

      {lightbox && (
        <div className="dc-check-lightbox" role="dialog" onClick={() => setLightbox(null)}>
          <img
            src={lightbox.url}
            alt={lightbox.side === 'front' ? t('check_image_front') : t('check_image_back')}
            onClick={(e) => e.stopPropagation()}
          />
          <button type="button" className="dc-ghost" onClick={() => setLightbox(null)}>
            {t('close')}
          </button>
        </div>
      )}
    </div>
  );
}
