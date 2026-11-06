/**
 * Findings of the model check for the properties panel (024 point 5, 016b V7).
 * A finding names one element and its layer; the layer itself (A2) has no
 * element and shows when the process is shown.
 *
 * A finding about a field shows at that field in the colour of its severity:
 * a missing name is a warning, not an error (016b V7 as settled in plan B1,
 * task 11; since 031 rule D7, which took over D3 to D5).
 */

/** Rules about one field of the panel: the entry id they belong to */
export const FIELD_OF_RULE = { D7: 'shortName' };

export function findingsFor(issues, element, root) {
  if (!element || Array.isArray(element)) {
    return [];
  }
  const isLayer = element === root;
  return (issues || []).filter((issue) => {
    const sameLayer = issue.process === root || (issue.process && root && issue.process.id === root.id);
    if (!sameLayer) {
      return false;
    }
    return isLayer ? !issue.elementId : issue.elementId === element.id;
  });
}

export function fieldFindings(findings) {
  const byField = {};
  (findings || []).forEach((issue) => {
    const field = FIELD_OF_RULE[issue.rule];
    if (field && !byField[field]) {
      byField[field] = { severity: issue.severity, message: issue.message };
    }
  });
  return byField;
}
