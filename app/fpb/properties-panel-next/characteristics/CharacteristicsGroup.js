/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { ArrowIcon, CreateIcon, useLayoutState } from '@bpmn-io/properties-panel';

import { cloneModdle } from '../../help/moddleClone';
import { nextCharacteristicNumber } from '../../help/characteristicsNumbering';
import { useService } from '../context';
import { usePanelReadOnly } from '../hooks';
import { formatValue } from '../values';
import { newCharacteristic, withField, withoutCharacteristic, asList, withNewActualValue, withoutActualValue } from './model';
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
  // the chosen row belongs to its element: it neither carries over to another
  // one nor shows there for the one render before the reset below
  const [selected, setSelected] = useState(null);
  const choose = (position) => setSelected(position === null ? null : { element, index: position });
  const list = asList(element.businessObject.get('characteristics'));

  useEffect(() => setSelected(null), [element]);

  // undo or an edit elsewhere may shrink the list under the open detail
  const index = selected && selected.element === element && selected.index < list.length ? selected.index : null;

  // writes read the list when they run: a pending input of the detail may
  // land just before or after "+" or remove (final review of B1)
  const current = () => asList(element.businessObject.get('characteristics'));
  const tools = { clone: (value) => cloneModdle(fpbFactory, value), create: (type, attrs) => fpbFactory.create(type, attrs) };
  const write = (next) => modeling.updateProperties(element, { characteristics: next });

  const add = (event) => {
    if (event) {
      event.stopPropagation();
    }
    const now = current();
    write(now.concat(newCharacteristic(tools.create, element.businessObject.id, nextCharacteristicNumber(now))));
    choose(now.length);
    setOpen(true);
  };

  const remove = () => {
    write(withoutCharacteristic(current(), index));
    choose(null);
  };

  // validity limits: `fn` makes the new list from the current one (016c T9)
  const updateLimits = (position) => (fn) => {
    const now = current();
    if (position < now.length) {
      const descriptive = now[position].descriptiveElement || {};
      write(withField(now, position, ['descriptiveElement', 'validityLimits'], fn(descriptive.validityLimits), tools));
    }
  };

  const addActual = (position) => () => {
    const now = current();
    if (position < now.length) {
      write(withNewActualValue(now, position, tools));
    }
  };
  const removeActual = (position) => (n) => {
    const now = current();
    if (position < now.length) {
      write(withoutActualValue(now, position, n, tools));
    }
  };

  const setField = (position) => (path, value) => {
    const now = current();
    // the characteristic was removed while the input waited
    if (position < now.length) {
      write(withField(now, position, path, value, tools));
    }
  };
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
          <CharacteristicsList list={list} selected={index} onSelect={choose} />
        ) : (
          <p class="fpb-characteristics-empty">
            {translate('No characteristics yet.')}
            {!readOnly && ' '}
            {!readOnly && <button type="button" class="fpb-link-button" onClick={add}>{addLabel}</button>}
          </p>
        )}
        {index !== null && (
          <CharacteristicDetail
            key={element.id + '-' + index}
            element={element}
            characteristic={list[index]}
            index={index}
            setField={setField(index)}
            updateLimits={updateLimits(index)}
            addActual={addActual(index)}
            removeActual={removeActual(index)}
            onRemove={remove}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One row per characteristic (016c decision 7): name on the left, setpoint
 * with unit and the first actual value on the right, "(+n)" for further ones.
 */
function CharacteristicsList(props) {
  const { list, selected, onSelect } = props;

  return (
    <ul class="fpb-characteristics-list">
      {list.map((characteristic, position) => {
        const category = characteristic.category || {};
        const descriptive = characteristic.descriptiveElement || {};
        const setpoint = descriptive.setpointValue || {};
        const actuals = asList(descriptive.actualValues);
        const name = category.shortName || ('C_' + (position + 1));
        const chosen = position === selected;
        const setpointText = [formatValue(setpoint.value), setpoint.unit || ''].filter(Boolean).join(' ');
        const actualText = actuals.length
          ? formatValue(actuals[0].value) + (actuals.length > 1 ? ' (+' + (actuals.length - 1) + ')' : '')
          : '';
        return (
          <li key={position}>
            <button
              type="button"
              class={'fpb-characteristic-row' + (chosen ? ' selected' : '')}
              data-index={position}
              aria-pressed={chosen ? 'true' : 'false'}
              title={category.longName || name}
              onClick={() => onSelect(chosen ? null : position)}
            >
              <span class="fpb-characteristic-row-name">
                <strong>{name}</strong>{category.longName ? ' ' + category.longName : ''}
              </span>
              <span class="fpb-characteristic-row-summary">{[setpointText, actualText].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
