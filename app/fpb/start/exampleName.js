// the endings the dialog "Open" takes
const KNOWN = /\.(json|xml|aml)$/i;

/** The path of a URL, without query and fragment */
function pathOf(url) {
  return String(url || '').split(/[?#]/)[0];
}

/** Is the example an AutomationML file? By its path, not query or fragment */
export function isAmlUrl(url) {
  return /\.aml$/i.test(pathOf(url));
}

/**
 * The file name an example opens with (016g F4): the last part of its path,
 * decoded where that works; without one of the endings .json, .xml, .aml
 * one from the content, as the dialog "Open" checks the ending.
 *
 * @param {string} url
 * @param {string} text the loaded content
 * @return {string}
 */
export function exampleName(url, text) {
  const last = pathOf(url).split('/').pop();
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch (error) {
    // a broken escape: the name stays as it stands in the URL
  }
  if (KNOWN.test(name)) {
    return name;
  }
  const start = String(text || '').replace(/^﻿/, '').trimStart();
  let ending = '.json';
  if (/<CAEXFile\b/.test(start.slice(0, 4000))) {
    ending = '.aml';
  } else if (start.startsWith('<')) {
    ending = '.xml';
  }
  return (name || 'example') + ending;
}
