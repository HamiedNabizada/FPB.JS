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

export default function FpbLayouter(elementRegistry) {
  this._elementRegistry = elementRegistry;
}

inherits(FpbLayouter, BaseLayouter);

FpbLayouter.$inject = [ 'elementRegistry' ];


FpbLayouter.prototype.layoutConnection = function (connection, hints) {

  hints = hints || {};
  const source = connection.source;
  const target = connection.target;
  // After a type change the route has to be built anew: repairConnection would
  // keep the points of the old type (a straight alternative flow stays straight
  // even though a parallel flow bends onto the bar of its tandem).
  const { fpbRelayout, ...manhattanHints } = hints;
  let waypoints = fpbRelayout ? [] : connection.waypoints;
  let manhattanOptions,
    updatedWaypoints;

  // Default docking: bottom-center of source, top-center of target (vertical flow)
  let start = getMid(source);
  let end = getMid(target);
  start.y = start.y + source.height / 2;
  end.y = end.y - target.height / 2;

  if (is(connection, 'fpb:Usage')) {
    // Logic to check if TechnicalResource was placed on the left or right side.
    // The docking side of the Usage is changed accordingly.
    let sourceMid = getMid(source);
    let targetMid = getMid(target);

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
    manhattanOptions = assign(manhattanOptions, manhattanHints);
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
      preferredLayouts: ['v:v']
    };
    manhattanOptions = assign(manhattanOptions, manhattanHints);

    updatedWaypoints =
      withoutRedundantPoints(
        repairConnection(
          source, target,
          start, end,
          waypoints,
          manhattanOptions
        )
      );
    const partnerWaypoints = is(connection, 'fpb:ParallelFlow') ? this._getPartnerWaypoints(connection) : null;

    if (partnerWaypoints) {
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

/**
 * Waypoints of the first tandem partner of a ParallelFlow, or null.
 *
 * Prefers the live connection shape: di.waypoint is only written on
 * connection.layout/move/updateWaypoints, so a partner that came in via
 * JSON import and was never touched has a DI edge without waypoints.
 * inTandemWith may also still hold a plain id if the importer could not
 * resolve the partner.
 */
FpbLayouter.prototype._getPartnerWaypoints = function (connection) {
  const tandem = connection.businessObject.inTandemWith;
  const partner = tandem && tandem[0];

  if (!partner) {
    return null;
  }

  const partnerId = typeof partner === 'string' ? partner : partner.id;
  const partnerShape = partnerId && this._elementRegistry.get(partnerId);
  const waypoints = (partnerShape && partnerShape.waypoints) || (partner.di && partner.di.waypoint);

  return waypoints && waypoints.length > 1 ? waypoints : null;
};
