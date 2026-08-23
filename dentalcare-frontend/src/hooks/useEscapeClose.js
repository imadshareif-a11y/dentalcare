import { useEffect } from 'react';

/** Stack so nested modals close one at a time (topmost first). */
const escapeStack = [];

/**
 * Close a modal/popup when Escape is pressed.
 * Only the most recently opened handler receives the key.
 */
export default function useEscapeClose(open, onClose) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return undefined;

    const entry = { onClose };
    escapeStack.push(entry);

    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== entry) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      const idx = escapeStack.lastIndexOf(entry);
      if (idx >= 0) escapeStack.splice(idx, 1);
    };
  }, [open, onClose]);
}
