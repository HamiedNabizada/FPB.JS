/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useRef, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';
import { faKeyboard } from '@fortawesome/free-solid-svg-icons/faKeyboard';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons/faCircleQuestion';

import DialogFrame from '../dialogs/DialogFrame';
import Icon from '../ui/Icon';
import { keyboardShortcuts } from './keyboardShortcuts';

const TABS = [
  { id: 'about', label: 'About', icon: faCircleInfo },
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

const PANELS = { about: About, shortcuts: Shortcuts, help: Help };

/**
 * About, keyboard shortcuts and help (016e V6): tabs on the left after the
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
