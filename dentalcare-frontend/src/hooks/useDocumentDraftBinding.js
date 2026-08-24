import { useEffect, useRef } from 'react';

/**
 * يربط نموذج المستند بنظام المسودات في DocumentWorkspace.
 */
export function useDocumentDraftBinding({
  registerDraftHandlers,
  draft,
  getPayload,
  applyPayload,
  getSummary,
}) {
  const appliedDraftId = useRef(null);

  useEffect(() => {
    if (!registerDraftHandlers) return undefined;
    registerDraftHandlers({ getPayload, applyPayload, getSummary });
    return () => registerDraftHandlers(null);
  }, [registerDraftHandlers, getPayload, applyPayload, getSummary]);

  useEffect(() => {
    if (!draft?.id || !draft?.payload) {
      appliedDraftId.current = null;
      return;
    }
    if (appliedDraftId.current === draft.id) return;
    appliedDraftId.current = draft.id;
    applyPayload(draft.payload);
  }, [draft?.id, draft?.payload, applyPayload]);
}
