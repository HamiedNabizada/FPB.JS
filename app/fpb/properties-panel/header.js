/** @jsx h */
import { markText } from '../i18n/markText';
import { fill } from '../i18n/language';

import { h } from '@bpmn-io/properties-panel/preact';

import { is } from '../help/utils';
import { colors } from '../core/colorScheme';

/**
 * Head of the properties panel: symbol, type and name of the element, so it
 * is clear what is being edited. The symbols are the VDI 3682 shapes in the
 * active color scheme.
 */

const TYPES = [
  ['fpb:Product', markText('Product')],
  ['fpb:Energy', markText('Energy')],
  ['fpb:Information', markText('Information')],
  ['fpb:ProcessOperator', markText('Process operator')],
  ['fpb:TechnicalResource', markText('Technical resource')],
  ['fpb:SystemLimit', markText('System limit')],
  ['fpb:ParallelFlow', markText('Parallel flow')],
  ['fpb:AlternativeFlow', markText('Alternative flow')],
  ['fpb:Usage', markText('Usage')],
  ['fpb:Flow', markText('Flow')],
  ['fpb:Process', markText('Process')]
];

export function getTypeLabel(element) {
  const match = TYPES.find(([type]) => is(element, type));

  return match ? match[1] : (element && element.type) || '';
}

/** Name of the element; a layer is named by its operator, in the language of translate */
export function getElementLabel(element, translate = fill) {
  const bo = element && element.businessObject;
  if (!bo) {
    return '';
  }

  if (is(element, 'fpb:Process')) {
    const operator = bo.isDecomposedProcessOperator;
    return operator ? translate('Decomposition of {name}', { name: nameOf(operator) }) : translate('Top level');
  }

  return nameOf(bo);
}

function nameOf(bo) {
  return (bo.identification && bo.identification.shortName) || bo.name || '';
}

function Svg(props) {
  return (
    <svg viewBox="0 0 32 32" width={props.width || 32} height={props.height || 32} aria-hidden="true">
      {props.children}
    </svg>
  );
}

// outline of the filled symbols, dark as on the canvas
const STROKE = '#222';
// symbols drawn as lines take the text colour of the head, light or dark
const LINE = 'currentColor';

function shapeFor(element) {
  const c = colors();

  if (is(element, 'fpb:Product')) {
    return <circle cx="16" cy="16" r="11" fill={c.FPB_PRODUCT} stroke={STROKE} stroke-width="1.5" />;
  }
  if (is(element, 'fpb:Energy')) {
    return <polygon points="16,4 28,16 16,28 4,16" fill={c.FPB_ENERGY} stroke={STROKE} stroke-width="1.5" />;
  }
  if (is(element, 'fpb:Information')) {
    return <polygon points="9,5 23,5 29,16 23,27 9,27 3,16" fill={c.FPB_INFORMATION} stroke={STROKE} stroke-width="1.5" />;
  }
  if (is(element, 'fpb:ProcessOperator')) {
    return <rect x="4" y="8" width="24" height="16" fill={c.FPB_PROCESS_OPERATOR} stroke={STROKE} stroke-width="1.5" />;
  }
  if (is(element, 'fpb:TechnicalResource')) {
    return <rect x="4" y="8" width="24" height="16" rx="6" fill={c.FPB_TECHNICAL_RESOURCE} stroke={STROKE} stroke-width="1.5" />;
  }
  if (is(element, 'fpb:SystemLimit')) {
    return <rect x="4" y="5" width="24" height="22" fill="none" stroke={LINE} stroke-width="1.5" stroke-dasharray="3 2" />;
  }
  if (is(element, 'fpb:Usage')) {
    return <line x1="4" y1="16" x2="28" y2="16" stroke={LINE} stroke-width="1.5" stroke-dasharray="3 2" />;
  }
  if (element && element.waypoints) {
    return [
      <line x1="4" y1="16" x2="25" y2="16" stroke={LINE} stroke-width="1.5" />,
      <polygon points="28,16 22,12 22,20" fill={LINE} />
    ];
  }
  // process: two stacked layers
  return [
    <rect x="8" y="5" width="18" height="14" fill="none" stroke={LINE} stroke-width="1.5" />,
    <rect x="5" y="12" width="18" height="14" class="fpb-icon-sheet" stroke={LINE} stroke-width="1.5" />
  ];
}

export function getElementIcon(element) {
  return function ElementIcon(props) {
    return <Svg width={props.width} height={props.height}>{shapeFor(element)}</Svg>;
  };
}

/**
 * Head of the panel as a card (016c, variant B): symbol, name, type and the
 * layer the element is on. Type and layer are text, not pills: what is only
 * shown must not look like a button (016c decision 2).
 */
export function PanelHeader(props) {
  const { element, root, translate = (text) => text } = props;
  if (!element || Array.isArray(element)) {
    return null;
  }
  const Icon = getElementIcon(element);
  const isProcess = is(element, 'fpb:Process');

  return (
    <div class="fpb-panel-header">
      <span class="fpb-panel-header-icon"><Icon width={40} height={40} /></span>
      <div class="fpb-panel-header-text">
        <div class="fpb-panel-header-name">{getElementLabel(element, translate) || translate('Unnamed')}</div>
        <div class="fpb-panel-header-meta">
          <span class="fpb-chip fpb-chip-type">{translate(getTypeLabel(element))}</span>
          {!isProcess && root && <span class="fpb-chip fpb-chip-layer">{getElementLabel(root, translate)}</span>}
        </div>
      </div>
    </div>
  );
}

export const headerProvider = {
  getElementLabel,
  getTypeLabel,
  getElementIcon,
  getDocumentationRef: () => null
};
