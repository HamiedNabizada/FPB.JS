/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';
import { faKeyboard } from '@fortawesome/free-solid-svg-icons/faKeyboard';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons/faCircleQuestion';
import { faShapes } from '@fortawesome/free-solid-svg-icons/faShapes';

import DialogFrame from '../dialogs/DialogFrame';
import Icon from '../ui/Icon';
import { keyboardShortcuts } from './keyboardShortcuts';
import { NOTATION, NOTATION_FLOWS } from './notation';

const TABS = [
  { id: 'about', label: 'About', icon: faCircleInfo },
  { id: 'notation', label: 'Notation', icon: faShapes },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: faKeyboard },
  { id: 'help', label: 'Help', icon: faCircleQuestion }
];

function About(props) {
  const { translate } = props;
  return [
    <h3 key="h">FPB.js</h3>,
    <p key="p" class="fpb-info-muted">
      {translate('A JavaScript library for creating formalized process descriptions according to VDI/VDE 3682 standard.')}
    </p>
  ];
}

/** The symbol of an element: the icon of the palette, or a line for the connections */
function NotationSymbol(props) {
  const { symbol } = props;
  if (symbol === 'arrow' || symbol === 'double-arrow') {
    const both = symbol === 'double-arrow';
    return (
      <span class="fpb-notation-symbol fpb-notation-line" aria-hidden="true">
        <svg viewBox="0 0 46 46" width="32" height="32">
          <line
            x1={both ? 11 : 4}
            y1="23"
            x2="35"
            y2="23"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray={both ? '4 3' : undefined}
          />
          <path d="M34 17 L43 23 L34 29 Z" fill="currentColor" />
          {both && <path d="M12 17 L3 23 L12 29 Z" fill="currentColor" />}
        </svg>
      </span>
    );
  }
  return <span class={'fpb-notation-symbol ' + symbol} aria-hidden="true" />;
}

/** The notation of VDI 3682 Blatt 1 (016e V14) */
function Notation(props) {
  const { translate } = props;
  return [
    <h3 key="h">{translate('Symbols of VDI 3682')}</h3>,
    <dl key="l" class="fpb-notation">
      {NOTATION.map((entry) => (
        <div key={entry.id} class="fpb-notation-entry" data-id={entry.id}>
          <NotationSymbol symbol={entry.symbol} />
          <dt>{translate(entry.name)}</dt>
          <dd>{translate(entry.text)}</dd>
        </div>
      ))}
    </dl>,
    <p key="f" class="fpb-notation-flows">{translate(NOTATION_FLOWS)}</p>,
    <p key="s" class="fpb-info-muted fpb-notation-source">{translate('Source: VDI 3682 Blatt 1 (2015), section 4.')}</p>
  ];
}

function Shortcuts(props) {
  const { translate } = props;
  return [
    <h3 key="h">{translate('Available Keyboard Shortcuts')}</h3>,
    <p key="p" class="fpb-info-muted">{translate('Use these keyboard shortcuts to navigate:')}</p>,
    ...keyboardShortcuts.map((section) => (
      <section key={section.category} class="fpb-info-section">
        <h4>{translate(section.category)}</h4>
        <table class="fpb-info-shortcuts">
          <thead>
            <tr>
              <th scope="col">{translate('Key Combination')}</th>
              <th scope="col">{translate('Description')}</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((item, index) => (
              <tr key={index}>
                <td>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</td>
                <td>{translate(item.description)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ))
  ];
}

function Help(props) {
  const { translate } = props;
  return [
    <h3 key="h">{translate('Report Issues')}</h3>,
    <p key="p">{translate('Found a bug or have a feature request? Please report it on our GitHub repository:')}</p>,
    <p key="a">
      <a href="https://github.com/hamiedNabizada/fpb.js/issues" target="_blank" rel="noopener noreferrer">
        {translate('GitHub Issues')}
      </a>
    </p>
  ];
}

const PANELS = { about: About, notation: Notation, shortcuts: Shortcuts, help: Help };

/**
 * About, notation, keyboard shortcuts and help (016e V6, V14): tabs on the left after the
 * WAI-ARIA tabs pattern, the arrow keys move between them and select.
 */
export default function InfoDialog(props) {
  const { close, titleId, translate, initialTab, onTab } = props;
  const [tab, setTab] = useState(initialTab);
  const tabRefs = useRef({});
  const id = (kind, tabId) => `${titleId}-${kind}-${tabId}`;

  const select = (tabId, focus) => {
    setTab(tabId);
    onTab(tabId);
    if (focus && tabRefs.current[tabId]) {
      tabRefs.current[tabId].focus();
    }
  };

  const onKeyDown = (event) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next = {
      ArrowDown: (index + 1) % TABS.length,
      ArrowUp: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1
    }[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    select(TABS[next].id, true);
  };

  return (
    <DialogFrame title={translate('FPB.js Information')} titleId={titleId} onClose={() => close()} closeLabel={translate('Close information')}>
      <div class="fpb-info">
        <div class="fpb-info-tabs" role="tablist" aria-orientation="vertical" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(node) => {
                tabRefs.current[t.id] = node;
              }}
              type="button"
              role="tab"
              id={id('tab', t.id)}
              class={t.id === tab ? 'fpb-info-tab is-selected' : 'fpb-info-tab'}
              aria-selected={t.id === tab ? 'true' : 'false'}
              aria-controls={id('panel', t.id)}
              tabIndex={t.id === tab ? 0 : -1}
              onClick={() => select(t.id, false)}
            >
              <Icon icon={t.icon} />
              {translate(t.label)}
            </button>
          ))}
        </div>
        {TABS.map((t) => {
          const Panel = PANELS[t.id];
          return (
            <div
              key={t.id}
              role="tabpanel"
              id={id('panel', t.id)}
              class="fpb-info-panel"
              aria-labelledby={id('tab', t.id)}
              hidden={t.id !== tab}
            >
              {t.id === tab && <Panel translate={translate} />}
            </div>
          );
        })}
      </div>
    </DialogFrame>
  );
}
