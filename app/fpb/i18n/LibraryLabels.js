import { markText } from './markText';

// texts of diagram-js-minimap; it translates them only when it opens or closes
const OPEN = markText('Open minimap');
const CLOSE = markText('Close minimap');

/**
 * Texts of modules from outside FPB.js that do not follow a change of the
 * language by themselves (016h V3): the button of the minimap shows its
 * title as its text and gets it again here.
 */
export default function LibraryLabels(eventBus, injector, translate) {
  eventBus.on('i18n.changed', function () {
    const minimap = injector.get('minimap', false);
    // _toggle: the minimap keeps its button there and has no method to name it
    const toggle = minimap && minimap._toggle;
    if (toggle) {
      toggle.setAttribute('title', translate(minimap.isOpen() ? CLOSE : OPEN));
    }
  });
}

LibraryLabels.$inject = ['eventBus', 'injector', 'translate'];
