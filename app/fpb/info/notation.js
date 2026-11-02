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
    name: 'Product',
    symbol: 'icon-fpb-product',
    text: 'The generic term for materials and substances, including their streams.'
  },
  {
    id: 'energy',
    name: 'Energy',
    symbol: 'icon-fpb-energy',
    text: 'Energy as part of a state that a process operator takes in or gives off.'
  },
  {
    id: 'information',
    name: 'Information',
    symbol: 'icon-fpb-information',
    text: 'Information as part of a state that a process operator takes in or gives off.'
  },
  {
    id: 'processOperator',
    name: 'Process operator',
    symbol: 'icon-fpb-processoperator',
    text: 'Converts products, energies and information into new ones; only process operators can be decomposed.'
  },
  {
    id: 'technicalResource',
    name: 'Technical resource',
    symbol: 'icon-fpb-technicalresource',
    text: 'The asset with which a process operator carries out its conversion.'
  },
  {
    id: 'systemLimit',
    name: 'System limit',
    symbol: 'icon-fpb-systemlimit',
    text: 'Encloses the process under consideration; states on it cross the limit.'
  },
  {
    id: 'flow',
    name: 'Flow',
    symbol: 'arrow',
    text: 'Connects states and process operators in the direction of the process.'
  },
  {
    id: 'usage',
    name: 'Usage',
    symbol: 'double-arrow',
    text: 'Connects a technical resource with the process operator that uses it.'
  }
];

/** Section 4.2: parallel and alternative processes need no symbols of their own */
export const NOTATION_FLOWS = 'No symbols of their own: parallel flows share part of their way, alternative flows run apart.';
