/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import { layerName } from './tree';
import './Breadcrumbs.css';

// room between the palette and the breadcrumbs
const GAP = 12;

function Crumbs(props) {
  const { path, open, translate } = props;
  return (
    <ol>
      {path.map((process, index) => {
        const name = layerName(process, Infinity, translate);
        const last = index === path.length - 1;
        return (
          <li key={process.id}>
            {index > 0 && <span class="fpb-breadcrumb-separator" aria-hidden="true">›</span>}
            {last
              ? <span class="fpb-breadcrumb-current" aria-current="page" title={name}>{name}</span>
              : <button type="button" class="fpb-breadcrumb" title={name} onClick={() => open(process)}>{name}</button>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The path from the top layer to the current one, on the canvas next to the
 * palette (016d V1): earlier layers open on a click, the current one is
 * text. Only for models with more than one layer; usable in read-only mode,
 * as switching layers changes nothing.
 */
export default function Breadcrumbs(eventBus, canvas, fpbLayers, translate) {
  const container = canvas.getContainer();
  const nav = this._nav = document.createElement('nav');
  nav.className = 'fpb-breadcrumbs';
  nav.setAttribute('aria-label', translate('Layer path'));
  nav.hidden = true;
  container.appendChild(nav);

  const place = function () {
    const palette = container.querySelector('.djs-palette');
    if (palette) {
      nav.style.left = (palette.offsetLeft + palette.offsetWidth + GAP) + 'px';
    }
  };

  // the crumb turns into text; the focus goes to the canvas, where Alt+Arrow
  // and the other keys work
  const open = function (process) {
    fpbLayers.open(process);
    canvas.focus();
  };

  const update = function () {
    const show = fpbLayers.count() > 1 && !!fpbLayers.getCurrent();
    nav.hidden = !show;
    render(show ? <Crumbs path={fpbLayers.getPath()} open={open} translate={translate} /> : null, nav);
    place();
  };

  eventBus.on('layers.changed', update);
  // the path and its name in the new language (016h V3)
  eventBus.on('i18n.changed', function () {
    nav.setAttribute('aria-label', translate('Layer path'));
    update();
  });
  eventBus.on('palette.changed', place);
  eventBus.on('diagram.destroy', function () {
    render(null, nav);
    nav.remove();
  });
  update();
}

Breadcrumbs.$inject = ['eventBus', 'canvas', 'fpbLayers', 'translate'];
