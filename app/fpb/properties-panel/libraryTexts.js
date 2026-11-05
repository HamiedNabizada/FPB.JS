import { markText } from '../i18n/markText';

/**
 * Texts of @bpmn-io/properties-panel that the panel of FPB.js shows (the
 * groups get translate as a property, PanelRoot). Marked here so that the
 * catalog test asks for their German (016h T13); nothing imports this list.
 */
export const LIBRARY_TEXTS = [
  markText('Toggle section'),
  markText('Section contains edits'),
  markText('Section contains an error')
];
