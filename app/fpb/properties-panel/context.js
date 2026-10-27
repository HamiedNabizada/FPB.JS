import { createContext } from '@bpmn-io/properties-panel/preact';
import { useContext } from '@bpmn-io/properties-panel/preact/hooks';

/**
 * Gives entries access to the modeler's services, as bpmn-js does with
 * useService. Uses the Preact copy of @bpmn-io/properties-panel: hooks only
 * work within one Preact instance.
 */
export const ServicesContext = createContext({
  getService() {
    return null;
  }
});

export function useService(name, strict) {
  const { getService } = useContext(ServicesContext);

  return getService(name, strict);
}
