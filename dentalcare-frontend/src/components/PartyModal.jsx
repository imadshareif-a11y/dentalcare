import useEscapeClose from '../hooks/useEscapeClose';

export default function PartyModal({ open, title, onClose, children, wide = false, className = '' }) {
  useEscapeClose(open, onClose);

  if (!open) return null;
  return (
    <div className="dc-modal-backdrop" onClick={onClose}>
      <div
        className={`dc-modal${wide ? ' is-wide' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dc-appt-head">
          <h3>{title}</h3>
          <button type="button" className="dc-danger" onClick={onClose} aria-label="×">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
