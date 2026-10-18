/**
 * Setpoint and actual values of a characteristic. VDI 3682 Blatt 2 §5.2: a
 * value is "metrisch, nicht metrisch, deterministisch oder stochastisch", so
 * a field takes a number or a text (016b V2). A number with point or comma is
 * stored as a number; anything else, also a number with a thousands
 * separator, stays text. An empty field removes the value.
 */
const NUMBER = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

export function parseValue(text) {
  const trimmed = text === undefined || text === null ? '' : String(text).trim();
  if (trimmed === '') {
    return undefined;
  }
  if (NUMBER.test(trimmed)) {
    return Number(trimmed.replace(',', '.'));
  }
  return trimmed;
}

export function formatValue(value) {
  return value === undefined || value === null ? '' : String(value);
}
