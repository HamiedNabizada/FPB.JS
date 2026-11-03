// tests/types/sheets.ts: checked with tsc, not run (016g G6)
// npx tsc --noEmit --strict tests/types/sheets.ts
import type { FpbSheets, FpbEventMap, FpbNotifications } from '../../types/fpbjs';

declare const sheets: FpbSheets;
declare const notifications: FpbNotifications;

// the title is optional
sheets.open('properties');
sheets.toggle('layers');
sheets.toggle('check', { title: 'Model check (VDI 3682)' });

// the events of the parts of 2.0 have their payloads
const changed: FpbEventMap['sheets.changed'] = { active: true, current: 'properties', body: null };
const notes: FpbEventMap['notifications.changed'] = { notes: notifications.list() };
const check: FpbEventMap['fpbValidation.panelChanged'] = { open: true };

// a cross used with the keyboard hands the focus on (016g D3)
notifications.close('import.error', { restoreFocus: true });

export { changed, notes, check };
