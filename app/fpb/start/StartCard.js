/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

/**
 * The card on an empty canvas (016e V12): draw with the tools, open a file
 * or start with an example. Only its buttons take a click; the rest of the
 * card lets clicks through to the canvas, so the first element can be put
 * anywhere.
 */
export default function StartCard(props) {
  const { translate, canOpen, ctrlKey, onOpen, onNotation } = props;
  return (
    <div class="fpb-start-card">
      <h2 class="fpb-start-title">{translate('Start a model')}</h2>
      <p class="fpb-start-draw">{translate('Draw it with the tools on the left, beginning with a system limit.')}</p>
      {canOpen && (
        <p class="fpb-start-file">
          <button type="button" class="fpb-button fpb-button--primary fpb-start-open" onClick={onOpen}>
            {translate('Open a file')} <kbd>{ctrlKey}+O</kbd>
          </button>
          <span class="fpb-start-drop">{translate('or drop a file here')}</span>
        </p>
      )}
      <button type="button" class="fpb-button fpb-button--quiet fpb-start-notation" onClick={onNotation}>
        {translate('Symbols of VDI 3682')}
      </button>
    </div>
  );
}
