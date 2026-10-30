/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';

/**
 * A Font Awesome icon as inline SVG for the Preact parts of FPB.js; `icon`
 * is a definition from @fortawesome/free-solid-svg-icons. Without a label
 * it is decoration and hidden from screen readers.
 */
export default function Icon(props) {
  const { icon, className, label } = props;
  const [width, height, , , path] = icon.icon;
  const paths = Array.isArray(path) ? path : [path];
  return (
    <svg
      class={className ? 'fpb-icon ' + className : 'fpb-icon'}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {paths.map((d, index) => <path key={index} fill="currentColor" d={d} />)}
    </svg>
  );
}
