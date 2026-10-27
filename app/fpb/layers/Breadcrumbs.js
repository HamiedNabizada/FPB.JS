/** @jsx h */
import { h, render } from '@bpmn-io/properties-panel/preact';

import { layerName } from './tree';
import './Breadcrumbs.css';

// room between the palette and the breadcrumbs
const GAP = 12;

function Crumbs(props) {
  const { path, open } = props;
  return (
    <ol>
      {path.map((process, index) => {
        const name = layerName(process);
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

  const update = function () {
    const show = fpbLayers.count() > 1 && !!fpbLayers.getCurrent();
    nav.hidden = !show;
    render(show ? <Crumbs path={fpbLayers.getPath()} open={(process) => fpbLayers.open(process)} /> : null, nav);
    place();
  };

  eventBus.on('layers.changed', update);
  eventBus.on('palette.changed', place);
  eventBus.on('diagram.destroy', function () {
    render(null, nav);
    nav.remove();
  });
  update();
}

Breadcrumbs.$inject = ['eventBus', 'canvas', 'fpbLayers', 'translate'];
