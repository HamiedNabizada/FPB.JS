/**
 * Path Calculator
 * 
 * Calculates SVG paths for FPB shapes and connections for hit detection and export
 */
import { componentsToPath } from 'diagram-js/lib/util/RenderUtil';

export class PathCalculator {
  
  /**
   * Calculates path for FPB Product (circle)
   */
  getProductPath(shape) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const radius = shape.width / 2;

    const pathComponents = [
      ['M', cx, cy],
      ['m', 0, -radius],
      ['a', radius, radius, 0, 1, 1, 0, 2 * radius],
      ['a', radius, radius, 0, 1, 1, 0, -2 * radius],
      ['z']
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for FPB Energy (diamond)
   */
  getEnergyPath(element) {
    const { x, y, width, height } = element;
    
    const pathComponents = [
      ['M', x + width / 2, y],           // Start at top point
      ['l', width / 2, height / 2],      // Line to right point
      ['l', -(width / 2), height / 2],   // Line to bottom point
      ['l', -(width / 2), -(height / 2)], // Line to left point
      ['z']                              // Close path
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for FPB Information (hexagon)
   */
  getInformationPath(element) {
    const { x, y, width, height } = element;

    const pathComponents = [
      ['M', x + width / 4, y],           // Start at top-left
      ['l', width / 2, 0],               // Top edge
      ['l', width / 4, height / 2],      // Top-right diagonal
      ['l', -(width / 4), height / 2],   // Bottom-right diagonal
      ['l', -(width / 2), 0],            // Bottom edge
      ['l', -(width / 4), -(height / 2)], // Bottom-left diagonal
      ['z']                              // Close path
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for FPB ProcessOperator (rectangle)
   */
  getProcessOperatorPath(element) {
    const { x, y, width, height } = element;

    const pathComponents = [
      ['M', x, y],
      ['l', width, 0],
      ['l', 0, height],
      ['l', -width, 0],
      ['z']
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for FPB TechnicalResource (rounded rectangle)
   * Note: This is a simplified rectangular path. For true rounded corners,
   * would need more complex arc calculations.
   */
  getTechnicalResourcePath(element) {
    const { x, y, width, height } = element;

    // For now, simplified to rectangle. Could be enhanced with proper rounded corners.
    const pathComponents = [
      ['M', x, y],
      ['l', width, 0],
      ['l', 0, height],
      ['l', -width, 0],
      ['z']
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for FPB SystemLimit (rectangle)
   */
  getSystemLimitPath(element) {
    const { x, y, width, height } = element;

    const pathComponents = [
      ['M', x, y],
      ['l', width, 0],
      ['l', 0, height],
      ['l', -width, 0],
      ['z']
    ];

    return componentsToPath(pathComponents);
  }

  /**
   * Calculates path for connections (waypoints)
   */
  getConnectionPath(connection) {
    const waypoints = connection.waypoints.map(p => p.original || p);
    
    if (waypoints.length < 2) {
      return '';
    }

    const pathComponents = [
      ['M', waypoints[0].x, waypoints[0].y]
    ];

    waypoints.slice(1).forEach(waypoint => {
      pathComponents.push(['L', waypoint.x, waypoint.y]);
    });

    return componentsToPath(pathComponents);
  }
}