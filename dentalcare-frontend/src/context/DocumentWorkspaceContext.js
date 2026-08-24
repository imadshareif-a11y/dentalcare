import { createContext, useContext } from 'react';

export const DocumentWorkspaceContext = createContext(null);

export function useDocumentWorkspace() {
  return useContext(DocumentWorkspaceContext);
}
