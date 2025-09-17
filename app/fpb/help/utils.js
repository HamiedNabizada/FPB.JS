import {
  some,
  assign
} from 'min-dash';


export function isFpb(element) {
  return element && /^fpb:/.test(element.type);
}


export function is(element, type) {
  var bo = getBusinessObject(element);
  return bo && bo.$instanceOf && (typeof bo.$instanceOf === 'function') && bo.$instanceOf(type);
}


export function getBusinessObject(element) {
  return (element && element.businessObject) || element;
}

export function isAny(element, types) {
  return some(types, function (t) {
    return is(element, t);
  });
}

export function getParent(element, anyType) {

  if (typeof anyType === 'string') {
    anyType = [anyType];
  }

  while ((element = element.parent)) {
    if (isAny(element, anyType)) {
      return element;
    }
  }
  return null;
}

function getLabelAttr(semantic) {

  if (
    is(semantic, 'fpb:Energy') ||
    is(semantic, 'fpb:Information') ||
    is(semantic, 'fpb:Product') ||
    is(semantic, 'fpb:ProcessOperator') ||
    is(semantic, 'fpb:TechnicalResource') ||
    is(semantic, 'fpb:SystemLimit')
  ) {
    return 'name';
  }
}

export function getLabel(element) {
  var semantic = element.businessObject,
    attr = getLabelAttr(semantic);
  if (attr) {
    return semantic[attr] || '';
  }
}


export function setLabel(element, text, isExternal) {

  var semantic = element.businessObject,
    attr = getLabelAttr(semantic);
  if (attr) {
    semantic[attr] = text;
  }
  return element;
}


export var DEFAULT_LABEL_SIZE = {
  width: 50,
  height: 20
};

export var FLOW_LABEL_INDENT = 15;


export function isLabelExternal(semantic) {
  return is(semantic, 'fpb:State')
};


export function hasExternalLabel(element) {
  return isLabel(element.label);
}

/**
 * Get the position for sequence flow labels
 *
 * @param  {Array<Point>} waypoints
 * @return {Point} the label position
 */
/*
export function getFlowLabelPosition(waypoints) {

  // get the waypoints mid
  var mid = waypoints.length / 2 - 1;

  var first = waypoints[Math.floor(mid)];
  var second = waypoints[Math.ceil(mid + 0.01)];

  // get position
  var position = getWaypointsMid(waypoints);

  // calculate angle
  var angle = Math.atan((second.y - first.y) / (second.x - first.x));

  var x = position.x,
    y = position.y;

  if (Math.abs(angle) < Math.PI / 2) {
    y -= FLOW_LABEL_INDENT;
  } else {
    x += FLOW_LABEL_INDENT;
  }

  return { x: x, y: y };
}*/


/**
 * Get the middle of a number of waypoints
 *
 * @param  {Array<Point>} waypoints
 * @return {Point} the mid point
 */
/*
export function getWaypointsMid(waypoints) {

  var mid = waypoints.length / 2 - 1;

  var first = waypoints[Math.floor(mid)];
  var second = waypoints[Math.ceil(mid + 0.01)];

  return {
    x: first.x + (second.x - first.x) / 2,
    y: first.y + (second.y - first.y) / 2
  };
}*/


export function getExternalLabelMid(element) {
  //TODO: Richtige Labelposition finden

  return {
    x: element.x - element.width / 2,
    y: element.y - DEFAULT_LABEL_SIZE.height
  }
}


/**
 * Returns the bounds of an elements label, parsed from the elements DI or
 * generated from its bounds.
 *
 * @param {BpmnElement} semantic
 * @param {djs.model.Base} element
 */
export function getExternalLabelBounds(semantic, element) {

  var mid,
    size,
    bounds,
    di = semantic.di,
    label = di.label;

  if (label && label.bounds) {
    bounds = label.bounds;

    size = {
      width: Math.max(DEFAULT_LABEL_SIZE.width, bounds.width),
      height: bounds.height
    };

    mid = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  } else {

    mid = getExternalLabelMid(element);

    size = DEFAULT_LABEL_SIZE;
  }

  return assign({
    x: mid.x - size.width / 2,
    y: mid.y - size.height / 2
  }, size);
}

export function isLabel(element) {
  return element && element.labelTarget;
}

