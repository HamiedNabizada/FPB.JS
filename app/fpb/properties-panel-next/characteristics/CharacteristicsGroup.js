/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { ArrowIcon, CreateIcon, useLayoutState } from '@bpmn-io/properties-panel';

import { cloneModdle } from '../../help/moddleClone';
import { nextCharacteristicNumber } from '../../help/characteristicsNumbering';
import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { formatValue } from '../values';
import { newCharacteristic, withField, withoutCharacteristic, asList } from './model';
import { CharacteristicDetail } from './CharacteristicDetail';

/**
 * Characteristics as a compact table (name, setpoint, unit, actual value)
 * plus a detail area for the chosen one (016 E7, 016b V1). The library has
 * no table and no button in a group head, so this group draws itself with
 * the library's classes and keeps its open state in the same layout.
 */
export function CharacteristicsGroup(props) {
  const { element, id, label } = props;
  const translate = useService('translate');
  const modeling = useService('modeling');
  const fpbFactory = useService('fpbFactory');
  const readOnly = usePanelReadOnly();
  const [open, setOpen] = useLayoutState(['groups', id, 'open'], true);
  const [selected, setSelected] = useState(null);
  const list = asList(element.businessObject.get('characteristics'));

  // the chosen row does not carry over to another element
  useEffect(() => setSelected(null), [element]);

  // undo or an edit elsewhere may shrink the list under the open detail
  const index = selected !== null && selected < list.length ? selected : null;

  const tools = { clone: (value) => cloneModdle(fpbFactory, value), create: (type, attrs) => fpbFactory.create(type, attrs) };
  const write = (next) => modeling.updateProperties(element, { characteristics: next });

  const add = (event) => {
    if (event) {
      event.stopPropagation();
    }
    const number = nextCharacteristicNumber(list);
    write(list.concat(newCharacteristic(tools.create, element.businessObject.id, number)));
    setSelected(list.length);
    setOpen(true);
  };

  const remove = () => {
    write(withoutCharacteristic(list, index));
    setSelected(null);
  };

  const setField = (position) => (path, value) => write(withField(list, position, path, value, tools));
  const addLabel = translate('Add characteristic');

  return (
    <div class="bio-properties-panel-group" data-group-id={'group-' + id}>
      <div class={'bio-properties-panel-group-header' + (list.length ? '' : ' empty') + (open ? ' open' : '')} onClick={() => setOpen(!open)}>
        <div class="bio-properties-panel-group-header-title">{translate(label)}</div>
        <div class="bio-properties-panel-group-header-buttons">
          {!readOnly && (
            <button type="button" class="bio-properties-panel-group-header-button bio-properties-panel-add-entry" title={addLabel} aria-label={addLabel} onClick={add}>
              <CreateIcon />
              {/* In an empty group the library's CSS shrinks the button's margin
                  on hover to make room for this label, as in its ListGroup;
                  without it the button jumped away from the pointer */}
              {!list.length && <span class="bio-properties-panel-add-entry-label">{translate('Create')}</span>}
            </button>
          )}
          <button type="button" class="bio-properties-panel-group-header-button bio-properties-panel-arrow" title={translate('Toggle section')} aria-expanded={open}>
            <ArrowIcon class={open ? 'bio-properties-panel-arrow-down' : 'bio-properties-panel-arrow-right'} />
          </button>
        </div>
      </div>
      <div class={'bio-properties-panel-group-entries' + (open ? ' open' : '')}>
        {list.length ? (
          <CharacteristicsTable list={list} selected={index} onSelect={setSelected} translate={translate} />
        ) : (
          <p class="fpb-characteristics-empty">
            {translate('No characteristics yet.')}
            {!readOnly && <button type="button" class="fpb-link-button" onClick={add}>{addLabel}</button>}
          </p>
        )}
        {index !== null && (
          <CharacteristicDetail
            key={'characteristic-' + index}
            element={element}
            characteristic={list[index]}
            index={index}
            setField={setField(index)}
            onRemove={remove}
          />
        )}
      </div>
    </div>
  );
}

function CharacteristicsTable(props) {
  const { list, selected, onSelect, translate } = props;

  return (
    <table class="fpb-characteristics-table">
      <thead>
        <tr>
          <th scope="col">{translate('Name')}</th>
          <th scope="col">{translate('Setpoint')}</th>
          <th scope="col">{translate('Unit')}</th>
          <th scope="col">{translate('Actual')}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((characteristic, position) => {
          const category = characteristic.category || {};
          const descriptive = characteristic.descriptiveElement || {};
          const setpoint = descriptive.setpointValue || {};
          const actuals = asList(descriptive.actualValues);
          const name = category.shortName || ('C_' + (position + 1));
          const chosen = position === selected;
          return (
            <tr class={chosen ? 'selected' : ''} data-index={position}>
              <th scope="row">
                <button type="button" class="fpb-characteristic-select" aria-pressed={chosen} title={category.longName || name} onClick={() => onSelect(chosen ? null : position)}>
                  {name}{category.longName ? ' ' + category.longName : ''}
                </button>
              </th>
              <td>{formatValue(setpoint.value)}</td>
              <td>{setpoint.unit || ''}</td>
              <td>{actuals.length ? formatValue(actuals[0].value) + (actuals.length > 1 ? ' (+' + (actuals.length - 1) + ')' : '') : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
