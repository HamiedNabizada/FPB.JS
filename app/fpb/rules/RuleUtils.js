/**
 * FPB Rule Utilities
 * 
 * Helper functions for FPB modeling rules
 */

/**
 * Checks if a shape can be placed within SystemLimit boundaries
 */
export function checkIfItsWithinSystemLimits(shape, target, position) {
  const DEBUG = process.env.NODE_ENV === 'development';
  
  if (DEBUG) {
    console.log('RuleUtils: checkIfItsWithinSystemLimits', {
      shape: { type: shape?.type, size: `${shape?.width}x${shape?.height}` },
      target: { type: target?.type, size: `${target?.width}x${target?.height}`, pos: `${target?.x},${target?.y}` },
      position: `${position?.x},${position?.y}`
    });
  }
  
  const limit_x_1 = target.x - target.width / 2;
  const limit_x_2 = target.x + target.width / 2;
  const limit_y_1 = target.y - target.height / 2;
  const limit_y_2 = target.y + target.height / 2;

  const shape_x_1 = position.x - shape.width / 2;
  const shape_x_2 = position.x + shape.width / 2;
  const shape_y_1 = position.y - shape.height / 2;
  const shape_y_2 = position.y + shape.height / 2;

  const xWithin = shape_x_1 >= limit_x_1 || shape_x_2 <= limit_x_2;
  const yWithin = shape_y_1 >= limit_y_1 || shape_y_2 <= limit_y_2;
  const isWithin = xWithin && yWithin;
  
  if (DEBUG && !isWithin) {
    console.warn('SystemLimit bounds check failed', {
      targetBounds: { x1: limit_x_1, x2: limit_x_2, y1: limit_y_1, y2: limit_y_2 },
      shapeBounds: { x1: shape_x_1, x2: shape_x_2, y1: shape_y_1, y2: shape_y_2 },
      xWithin, yWithin
    });
  }

  return isWithin;
}

/**
 * Checks if a SystemLimit would overlap with a TechnicalResource
 */
export function moveOnTechnicalResource(systemLimit, technicalResource, position) {
  const x1 = position.x - systemLimit.width / 2;
  const x2 = position.x + systemLimit.width / 2;
  const y1 = position.y - systemLimit.height / 2;
  const y2 = position.y + systemLimit.height / 2;
  
  let errorX = technicalResource.x;
  const errorY = technicalResource.y + technicalResource.height / 2;
  
  if (position.x > technicalResource.x) {
    // Approaching from right
    errorX += technicalResource.width;
  }

  if ((x1 <= errorX) && (errorX <= x2)) {
    if ((y1 <= errorY) && (errorY <= y2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determines connection type based on flow hints
 */
export function getConnectionType(source, flowHint) {
  if (!flowHint) {
    return { type: 'fpb:Flow' };
  }
  
  switch (flowHint) {
    case 'Parallel':
      return { type: 'fpb:ParallelFlow' };
    case 'Alternative':
      return { type: 'fpb:AlternativeFlow' };
    case 'Usage':
      return { type: 'fpb:Usage' };
    default:
      return { type: 'fpb:Flow' };
  }
}

/**
 * Checks if two elements are already connected
 */
export function areAlreadyConnected(source, target) {
  return source.outgoing && source.outgoing.some(connection => 
    connection.businessObject.targetRef.id === target.id
  );
}