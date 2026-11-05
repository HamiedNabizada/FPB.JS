import { markText } from './markText';

/**
 * The element types as the code writes them without "fpb:" (context pad,
 * screen readers, hints when a move is refused). In English they read as
 * before (ProcessOperator); the catalog gives the terms of VDI 3682.
 */
const TYPE_KEYS = {
  Product: markText('Product'),
  Energy: markText('Energy'),
  Information: markText('Information'),
  ProcessOperator: markText('ProcessOperator'),
  TechnicalResource: markText('TechnicalResource'),
  SystemLimit: markText('SystemLimit'),
  Flow: markText('Flow'),
  ParallelFlow: markText('ParallelFlow'),
  AlternativeFlow: markText('AlternativeFlow'),
  Usage: markText('Usage'),
  Process: markText('Process'),
  label: markText('label')
};

/** The name of an element type ('fpb:ProcessOperator') in the language of translate */
export function typeName(type, translate) {
  const short = String(type || '').replace(/^fpb:/, '');
  const key = Object.prototype.hasOwnProperty.call(TYPE_KEYS, short) ? TYPE_KEYS[short] : null;
  return key && translate ? translate(key) : short;
}
