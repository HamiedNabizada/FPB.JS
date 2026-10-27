import { createContext } from '@bpmn-io/properties-panel/preact';

/**
 * Findings of the model check per entry id: { [entryId]: { severity, message } }.
 * Filled by PanelRoot from the model check; empty without it.
 */
export const FindingsContext = createContext({});
