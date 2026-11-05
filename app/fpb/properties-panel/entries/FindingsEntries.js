/** @jsx h */
import { markText } from '../../i18n/markText';
import { translateMessage } from '../../i18n/language';

import { h } from '@bpmn-io/properties-panel/preact';
import { useShowEntryEvent } from '@bpmn-io/properties-panel';

import { RULES } from '../../validation/ModelChecker';
import { useService } from '../context';

const SEVERITY_LABEL = { error: markText('Error'), warning: markText('Warning'), info: markText('Note') };

/** Findings of the shown element, worst first (016b V7) */
export function FindingsEntries(findings) {
  return [{ id: 'findings', component: Findings, findings }];
}

function Findings(props) {
  const { id, findings } = props;
  const translate = useService('translate');
  const ref = useShowEntryEvent(id);

  return (
    <div class="bio-properties-panel-entry" data-entry-id={id}>
      <ul class="fpb-findings" tabIndex={-1} ref={ref}>
        {findings.map((issue) => (
          <li class={'fpb-finding fpb-finding-' + issue.severity}>
            <div class="fpb-finding-head">{translate(SEVERITY_LABEL[issue.severity]) + ' · ' + issue.rule + ' ' + translate(RULES[issue.rule].title)}</div>
            <div class="fpb-finding-text">{translateMessage(translate, issue)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
