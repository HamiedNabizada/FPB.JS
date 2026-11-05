import { markText } from '../i18n/markText';

/**
 * The notation of VDI 3682 Blatt 1 (2015), section 4.1 and figure 3, for the
 * tab "Notation" of "Information" (016e V14). The shapes use the symbols of
 * the palette, so they follow the colour scheme; flow and usage are lines.
 * The sentences stay close to the guideline, see the plan of D3, "Abgleich
 * mit VDI 3682"; Phase F translates them.
 */
export const NOTATION = [
  {
    id: 'product',
    name: markText('Product'),
    symbol: 'icon-fpb-product',
    text: markText('The generic term under which streams of materials, substances and the like can also be described.')
  },
  {
    id: 'energy',
    name: markText('Energy'),
    symbol: 'icon-fpb-energy',
    text: markText('Energy as part of a state that a process operator takes in or gives off.')
  },
  {
    id: 'information',
    name: markText('Information'),
    symbol: 'icon-fpb-information',
    text: markText('Information as part of a state that a process operator takes in or gives off.')
  },
  {
    id: 'processOperator',
    name: markText('Process operator'),
    symbol: 'icon-fpb-processoperator',
    text: markText('Converts products, energies and information into new ones; only process operators can be decomposed.')
  },
  {
    id: 'technicalResource',
    name: markText('Technical resource'),
    symbol: 'icon-fpb-technicalresource',
    text: markText('An asset with which a process operator carries out its conversion.')
  },
  {
    id: 'systemLimit',
    name: markText('System limit'),
    symbol: 'icon-fpb-systemlimit',
    text: markText('Marks the limit of the process under consideration with a dashed frame.')
  },
  {
    id: 'flow',
    name: markText('Flow'),
    symbol: 'arrow',
    text: markText('Connects states and process operators in the direction of the process.')
  },
  {
    id: 'usage',
    name: markText('Usage'),
    symbol: 'double-arrow',
    text: markText('Connects a technical resource with the process operator that uses it.')
  }
];

/** Section 4.2: parallel and alternative processes need no symbols of their own */
export const NOTATION_FLOWS = markText('Parallel and alternative flows have no symbols of their own: parallel flows share part of their way, alternative flows run apart.');
