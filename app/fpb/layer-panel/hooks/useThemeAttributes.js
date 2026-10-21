import { useEffect, useState } from 'react';

/**
 * `data-theme` for dialogs: React renders them into <body>, outside the
 * containers a host themes (016c T5). Empty when the page itself carries the
 * theme, as in the web app.
 */
export function useThemeAttributes(modeler) {
  const theme = modeler ? modeler.get('fpbTheme', false) : null;
  const [attributes, setAttributes] = useState(() => (theme ? theme.attributes() : {}));

  useEffect(() => {
    if (!theme) {
      return undefined;
    }
    const update = () => setAttributes(theme.attributes());
    modeler.on('theme.changed', update);
    return () => modeler.off('theme.changed', update);
  }, [modeler, theme]);

  return attributes;
}
