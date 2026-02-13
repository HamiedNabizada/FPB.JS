import inherits from 'inherits';

import {
  assign
} from 'min-dash';

import BaseLayouter from 'diagram-js/lib/layout/BaseLayouter';

import {
  repairConnection,
  withoutRedundantPoints
} from 'diagram-js/lib/layout/ManhattanLayout';

import {
  getMid
} from 'diagram-js/lib/layout/LayoutUtil';

import { is } from '../help/utils';

export default function FpbLayouter() {
}

inherits(FpbLayouter, BaseLayouter);


FpbLayouter.prototype.layoutConnection = function (connection, hints) {

  hints = hints || {};
  const source = connection.source;
  const target = connection.target;
  let waypoints = connection.waypoints;
  let start = hints.connectionStart;
  let end = hints.connectionEnd;
  let manhattanOptions,
    updatedWaypoints;

  if (!start) {
    start = getConnectionDocking(waypoints && waypoints[0], source);
  }

  if (!end) {
    end = getConnectionDocking(waypoints && waypoints[waypoints.length - 1], target);
  }
  start = getMid(source);
  end = getMid(target);
  start.y = start.y + source.height / 2;
  end.y = end.y - target.height / 2;
  if (is(connection, 'fpb:Usage')) {
    // Logic to check if TechnicalResource was placed on the left or right side.
    // The docking side of the Usage is changed accordingly.
    let sourceMid = getMid(source)
    let targetMid = getMid(target)

    if (sourceMid.x > targetMid.x) { // Source element is on the right side
      start.x = sourceMid.x - source.width / 2;
      end.x = targetMid.x + target.width / 2;
    } else {

      start.x = sourceMid.x + source.width / 2;
      end.x = targetMid.x - target.width / 2;
    }
    // y always at the center;
    start.y = sourceMid.y;
    end.y = targetMid.y;
    manhattanOptions = {
      preferredLayouts: ['h:h']
    };
    waypoints = undefined; // Reset, otherwise they prevent regeneration.
    manhattanOptions = assign(manhattanOptions, hints);
    updatedWaypoints =
      withoutRedundantPoints(
        repairConnection(
          source, target,
          start, end,
          waypoints,
          manhattanOptions
        )
      );
  }
  else if (is(connection, 'fpb:AlternativeFlow')) {
    start = getMid(source);
    end = getMid(target);
    start.y = start.y + source.height / 2;
    end.y = end.y - target.height / 2;
    updatedWaypoints = [start, end];
  }
  else if (is(connection, 'fpb:Flow')) {
    manhattanOptions = {
      //preferredLayouts: ['straight', 'v:v']
      preferredLayouts: ['v:v']
    };
    manhattanOptions = assign(manhattanOptions, hints);
    // Should have the same bend as its partner flow

    updatedWaypoints =
      withoutRedundantPoints(
        repairConnection(
          source, target,
          start, end,
          waypoints,
          manhattanOptions
        )
      );
    if (is(connection, 'fpb:ParallelFlow') && connection.businessObject.inTandemWith[0] && connection.businessObject.inTandemWith[0].di) {
      let partnerWaypoints = connection.businessObject.inTandemWith[0].di.waypoint;
      
      if (target.y > partnerWaypoints[1].y && updatedWaypoints.length > 2) { // Only if shape is placed below the bend and connection has a bend

        if (partnerWaypoints.length > 2) { // Only if partner shape has a bend
          updatedWaypoints[1].y = partnerWaypoints[1].y;
          updatedWaypoints[2].y = partnerWaypoints[2].y;
        }
        else {
          let newWaypoint = (partnerWaypoints[0].y + partnerWaypoints[1].y) / 2;
          updatedWaypoints[1].y = newWaypoint;
          updatedWaypoints[2].y = newWaypoint;
        }

      }
    }
  }


  return updatedWaypoints || [start, end];
};

function getConnectionDocking(point, shape) {

  return point ? (point.original || point) : getMid(shape);
}
