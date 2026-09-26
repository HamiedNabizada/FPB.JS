import { CAEXDocument } from 'amlengine-js';

import { DiagramInterchangeNames } from './mappings';
import { utcNow } from './environment';

/**
 * Port of DiagramInterchangeLibrary.cs: the language-agnostic OMG_DD
 * AttributeTypeLib (DD_Bounds, DD_Point, DD_Waypoint after the OMG Diagram
 * Definition), as a standalone document or embedded into one.
 */

const { LibName, Version, FileName } = DiagramInterchangeNames;

/** BuildDocument: the library as a standalone CAEX document */
export function buildDiagramInterchangeDocument() {
  const doc = CAEXDocument.new_CAEXDocument();
  const caex = doc.caexFile;
  caex.fileName = FileName;
  const sdi = firstOrAppend(caex.sourceDocumentInformation);
  sdi.originName = 'fpb-aml-mapper';
  sdi.originID = 'omg-dd-attributetypelib';
  sdi.originVersion = Version;
  sdi.lastWritingDateTime = utcNow();
  ensureDiagramInterchangeIn(caex);
  return doc;
}

/** EnsureIn: append the library to `caex` if it is not present */
export function ensureDiagramInterchangeIn(caex) {
  const existing = caex.attributeTypeLib.item(LibName);
  if (existing) {
    return existing;
  }

  const atl = caex.attributeTypeLib.append(LibName);
  atl.description = 'Language-agnostic diagram-interchange attribute types, structured after the OMG Diagram Definition (DD) specification: DD_Bounds (DC::Bounds), DD_Point (DC::Point), DD_Waypoint (DI::Waypoint). Referenced by the VDI_FPD and ISO_PT domain libraries.';
  atl.version = Version;

  const pointPath = LibName + '/DD_Point';

  const bounds = atl.attributeType.append('DD_Bounds');
  bounds.attributeDataType = 'xs:string';
  bounds.description = 'A rectangular area defined by a top-left (x, y) location and a size (width, height) along the x-y axes (cf. DC::Bounds).';
  bounds.version = Version;
  addPoint(bounds, 'position', pointPath);
  addDouble(bounds, 'width');
  addDouble(bounds, 'height');

  const wp = atl.attributeType.append('DD_Waypoint');
  wp.attributeDataType = 'xs:string';
  wp.description = 'A routing point along a connection path (cf. DI::Waypoint).';
  wp.version = Version;
  addPoint(wp, 'position', pointPath);

  const pt = atl.attributeType.append('DD_Point');
  pt.attributeDataType = 'xs:string';
  pt.description = 'A two-dimensional point in a coordinate system (cf. DC::Point).';
  pt.version = Version;
  addDouble(pt, 'x');
  addDouble(pt, 'y');

  return atl;
}

function addPoint(parent, name, pointPath) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:string';
  attr.refAttributeType = pointPath;
  addDouble(attr, 'x');
  addDouble(attr, 'y');
}

function addDouble(parent, name) {
  const attr = parent.attribute.append(name);
  attr.attributeDataType = 'xs:double';
}

/** `sequence.FirstOrDefault() ?? sequence.Append()` */
export function firstOrAppend(sequence) {
  for (const item of sequence) {
    return item;
  }
  return sequence.append();
}
