/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';

/**
 * A decomposed operator leads to its layer (016 "Open layer", 016b V6).
 * Switching layers changes nothing in the model, so it stays available in
 * read-only mode (027).
 */
export function DecompositionEntries() {
  return [{ id: 'openLayer', component: OpenLayer }];
}

function OpenLayer(props) {
  const { element, id } = props;
  const translate = useService('translate');
  const modeling = useService('modeling');

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <p class="fpb-characteristic-none">{translate('This operator is decomposed into a layer of its own.')}</p>
      <button type="button" class="fpb-field-button" onClick={() => modeling.switchProcess(element.businessObject.decomposedView)}>
        {translate('Open layer')}
      </button>
    </div>
  );
}
