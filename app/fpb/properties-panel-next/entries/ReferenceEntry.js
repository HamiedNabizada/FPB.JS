/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

import { useService } from '../context';

const nameOf = (bo) => (bo && ((bo.identification && bo.identification.shortName) || bo.name)) || (bo && bo.id) || '';

/**
 * Elements a connection points to, as buttons that select the element on the
 * canvas (016b V4). Accepts shapes or business objects.
 */
export function ReferenceEntry(props) {
  const { id, label, targets } = props;
  const translate = useService('translate');
  const registry = useService('elementRegistry');
  const selection = useService('selection');
  const canvas = useService('canvas');

  const shapes = (targets || []).map((target) => (target && target.businessObject ? target : registry.get(target && target.id))).filter(Boolean);
  const choose = (shape) => {
    canvas.scrollToElement(shape);
    selection.select(shape);
  };

  return (
    <div class="bio-properties-panel-entry fpb-reference-entry" data-entry-id={id}>
      <div class="bio-properties-panel-label">{translate(label)}</div>
      {shapes.length ? shapes.map((shape) => (
        <button type="button" class="fpb-link-button fpb-reference" onClick={() => choose(shape)}>{nameOf(shape.businessObject)}</button>
      )) : <span class="fpb-characteristic-none">{translate('None')}</span>}
    </div>
  );
}
