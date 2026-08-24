import { useTranslation } from 'react-i18next';
import { useDocumentWorkspace } from '../context/DocumentWorkspaceContext';
import { DocumentNumberRow } from './DocumentNumberHint';

const VARIANT_META = {
  receipt: { icon: 'fa-solid fa-file-invoice-dollar', tone: 'receipt' },
  payment: { icon: 'fa-solid fa-money-bill-transfer', tone: 'payment' },
  purchase: { icon: 'fa-solid fa-cart-shopping', tone: 'purchase' },
  credit: { icon: 'fa-solid fa-file-circle-minus', tone: 'credit' },
  debit: { icon: 'fa-solid fa-file-circle-plus', tone: 'debit' },
  bank: { icon: 'fa-solid fa-building-columns', tone: 'bank' },
  journal: { icon: 'fa-solid fa-book', tone: 'journal' },
};

export function DocSection({ title, hint, children, className = '' }) {
  return (
    <section className={`dc-doc-section${className ? ` ${className}` : ''}`}>
      {(title || hint) && (
        <header className="dc-doc-section-head">
          {title && <h4 className="dc-doc-section-title">{title}</h4>}
          {hint && <p className="dc-doc-section-hint">{hint}</p>}
        </header>
      )}
      <div className="dc-doc-section-body">{children}</div>
    </section>
  );
}

export function DocToggle({
  checked,
  onChange,
  label,
  icon,
  activeLabel,
}) {
  return (
    <button
      type="button"
      className={`dc-doc-toggle${checked ? ' is-on' : ''}`}
      aria-pressed={checked}
      onClick={() => onChange?.(!checked)}
    >
      {icon && <i className={icon} aria-hidden="true" />}
      <span>{checked && activeLabel ? activeLabel : label}</span>
      <span className="dc-doc-toggle-switch" aria-hidden="true" />
    </button>
  );
}

export function DocTotalBar({ items = [], highlight }) {
  if (!items.length && highlight == null) return null;
  return (
    <div className="dc-doc-total-bar" aria-live="polite">
      <div className="dc-doc-total-items">
        {items.map((item) => (
          <div key={item.label} className="dc-doc-total-item">
            <span className="dc-doc-total-label">{item.label}</span>
            <strong className="dc-doc-total-value">{item.value}</strong>
          </div>
        ))}
      </div>
      {highlight != null && (
        <div className="dc-doc-total-highlight">
          <span className="dc-doc-total-label">{highlight.label}</span>
          <strong className="dc-doc-total-value is-hero">{highlight.value}</strong>
        </div>
      )}
    </div>
  );
}

export default function DocumentFormShell({
  variant = 'receipt',
  title,
  subtitle,
  onSubmit,
  children,
  error,
  footerExtra,
  submitLabel,
  submittingLabel,
  submitting = false,
  submitDisabled = false,
  submitClassName,
  totals,
}) {
  const { t } = useTranslation();
  const workspace = useDocumentWorkspace();
  const meta = VARIANT_META[variant] || VARIANT_META.receipt;
  const btnClass = submitClassName
    || (variant === 'payment' ? 'dc-danger' : 'dc-success');

  return (
    <form
      onSubmit={onSubmit}
      className={`dc-doc-form tone-${meta.tone}`}
    >
      <header className="dc-doc-form-hero">
        <div className="dc-doc-form-hero-icon" aria-hidden="true">
          <i className={meta.icon} />
        </div>
        <div className="dc-doc-form-hero-text">
          <h3 className="dc-doc-form-title">{title}</h3>
          {subtitle && <p className="dc-doc-form-subtitle">{subtitle}</p>}
          {workspace?.sourceType && (
            <DocumentNumberRow sourceType={workspace.sourceType} />
          )}
        </div>
      </header>

      <div className="dc-doc-form-body">
        {children}
      </div>

      {totals}

      {error && <div className="dc-error dc-doc-form-error">{error}</div>}

      <footer className="dc-doc-form-footer">
        {footerExtra}
        <button
          type="submit"
          className={`dc-doc-form-submit ${btnClass}`}
          disabled={submitting || submitDisabled}
        >
          {submitting ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
              {submittingLabel || t('saving_voucher')}
            </>
          ) : (
            <>
              <i className="fa-solid fa-check" aria-hidden="true" />
              {submitLabel || t('save_voucher')}
            </>
          )}
        </button>
      </footer>
    </form>
  );
}
