/**
 * Small pictures for the popup menus (type change, append): element types in
 * the colors of the shapes (Product #ed2028, Energy #6e9ad1,
 * Information #3050a2, ProcessOperator #13ae4d) and the two branchings.
 */
const svg = (inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">' + inner + '</svg>';

export const ELEMENT_ICONS = {
  'fpb:Product': svg('<circle cx="10" cy="10" r="8" fill="#ed2028" stroke="#000"/>'),
  'fpb:Energy': svg('<path d="M10 2l8 8-8 8-8-8z" fill="#6e9ad1" stroke="#000"/>'),
  'fpb:Information': svg('<path d="M5.5 2.5h9L19 10l-4.5 7.5h-9L1 10z" fill="#3050a2" stroke="#000"/>'),
  'fpb:ProcessOperator': svg('<rect x="1.5" y="5" width="17" height="10" fill="#13ae4d" stroke="#000"/>')
};

export const BRANCH_ICONS = {
  // one flow splitting into two, arrows at the ends
  'fpb:ParallelFlow': svg('<g fill="none" stroke="#000" stroke-width="1.3"><path d="M10 2v5"/><path d="M4 7h12"/><path d="M4 7v8"/><path d="M16 7v8"/></g><path d="M4 18l-2-3.5h4z"/><path d="M16 18l-2-3.5h4z"/>'),
  // two diverging flows
  'fpb:AlternativeFlow': svg('<g fill="none" stroke="#000" stroke-width="1.3"><path d="M10 2L4.5 14"/><path d="M10 2l5.5 12"/></g><path d="M3.5 17.5l-.6-3.9 3.5.6z"/><path d="M16.5 17.5l-2.9-3.3 3.5-.6z"/>')
};
