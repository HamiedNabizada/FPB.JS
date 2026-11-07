/**
 * The links of an AML file a host keeps (016f E4, T10): per layer and element,
 * the InternalLinks the host removes from its file when the element is
 * deleted there. The plugin AMLFPB.js sets them through setAmlLinks; the
 * delete question (FpbDelete) names them. The web app builds the same list
 * from the file it keeps (amlSupport.getLinks, B19), which goes first. An
 * import leaves the host's list alone: only the host sets it.
 */
export default function AmlLinks() {
  this._links = null;
}

const isText = (value) => typeof value === 'string';

/** @param {Array<{ processId, elementId, name, link, owner }>|null} links */
AmlLinks.prototype.set = function (links) {
  this._links = Array.isArray(links)
    ? links
      .filter((l) => l && isText(l.processId) && isText(l.elementId) && isText(l.link))
      .map((l) => ({
        processId: l.processId, elementId: l.elementId,
        name: isText(l.name) ? l.name : '', link: l.link, owner: isText(l.owner) ? l.owner : ''
      }))
    : null;
};

/** Whether a host has set a list (an empty one included) */
AmlLinks.prototype.isSet = function () {
  return this._links !== null;
};

/** The entries of the element on any of the layers */
AmlLinks.prototype.of = function (elementId, processIds) {
  return (this._links || []).filter((l) => l.elementId === elementId && processIds.indexOf(l.processId) !== -1);
};
