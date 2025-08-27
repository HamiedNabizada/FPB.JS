/**
 * Context Pad Utilities
 * 
 * Helper functions for FPB Context Pad operations
 */
import { some, filter } from 'min-dash';
import { getMid } from 'diagram-js/lib/layout/LayoutUtil';
import { is } from '../help/utils';
import { getElementsFromElementsContainer } from '../help/helpUtils';
import { ELEMENT_TYPES, FLOW_TYPES, LAYOUT_CONSTANTS } from './ContextPadConstants';

/**
 * Context helper to get commonly needed element collections
 */
export class ContextHelper {
  constructor(canvas) {
    this.canvas = canvas;
  }

  /**
   * Gets the current process context with element collections
   */
  getProcessContext() {
    const process = this.canvas.getRootElement();
    
    try {
      const systemLimit = getElementsFromElementsContainer(
        process.businessObject.elementsContainer, 
        ELEMENT_TYPES.SYSTEM_LIMIT
      )[0];
      
      const processOperators = getElementsFromElementsContainer(
        systemLimit.businessObject.elementsContainer, 
        ELEMENT_TYPES.PROCESS_OPERATOR
      );
      
      const states = getElementsFromElementsContainer(
        systemLimit.businessObject.elementsContainer, 
        'fpb:State'
      );
      
      const technicalResources = getElementsFromElementsContainer(
        process.businessObject.elementsContainer, 
        ELEMENT_TYPES.TECHNICAL_RESOURCE
      );

      return {
        process,
        systemLimit,
        processOperators,
        states,
        technicalResources
      };
    } catch (error) {
      // Fallback for edge cases (e.g., TR placed first)
      return {
        process,
        systemLimit: null,
        processOperators: [],
        states: [],
        technicalResources: []
      };
    }
  }
}

/**
 * Connection utilities for context pad
 */
export class ConnectionUtils {
  /**
   * Determines flow hint from event source element
   */
  static getFlowHintFromEvent(event) {
    let className;
    
    // Handle different event types (click vs touch)
    if (event.type === 'click' || event.type === 'dragstart') {
      className = event.srcElement.className;
    } else {
      className = event.srcEvent.srcElement.className;
    }

    // Determine flow type from CSS class
    if (className.search('parallel') !== -1) {
      return 'Parallel';
    } else if (className.search('alternative') !== -1) {
      return 'Alternative';
    } else if (className.search('usage') !== -1) {
      return 'Usage';
    }
    
    return 'Flow';
  }

  /**
   * Calculates source position for connection start
   */
  static getConnectionSourcePosition(element) {
    const sourcePos = getMid(element);
    
    if (is(element, ELEMENT_TYPES.STATE)) {
      sourcePos.y += element.width / LAYOUT_CONSTANTS.HALF_ELEMENT_OFFSET;
    } else if (is(element, 'fpb:Object')) {
      sourcePos.x += element.width / LAYOUT_CONSTANTS.HALF_ELEMENT_OFFSET;
    } else {
      sourcePos.x -= element.width / LAYOUT_CONSTANTS.HALF_ELEMENT_OFFSET;
    }
    
    return sourcePos;
  }
}

/**
 * Element validation utilities
 */
export class ElementValidationUtils {
  /**
   * Checks if there are any outgoing flows of a specific type
   */
  static anyOutgoingFlowOfType(element, flowType) {
    if (!element.outgoing) return true;
    
    for (const flow of element.outgoing) {
      if (flow.type === flowType) {
        return false;
      }
    }
    return true;
  }

  /**
   * Counts elements under a source element at minimum distance
   */
  static countElementsUnderSource(source, container, minDistance = LAYOUT_CONSTANTS.MIN_DISTANCE) {
    if (!container || container.length === 0) {
      return 0;
    }

    // Only consider elements that are not already connected
    const notConnectedElements = container.filter(element => {
      return !some(element.incoming, connection => 
        connection.businessObject.sourceRef.id === source.id
      );
    });

    // Count elements below the source with minimum distance
    return notConnectedElements.filter(element => 
      element.y > (source.y + minDistance)
    ).length;
  }

  /**
   * Checks if technical resources are available for connection
   */
  static technicalResourcesAvailable(source, technicalResources) {
    if (!technicalResources || technicalResources.length === 0) {
      return false;
    }

    // If source has no assignments, any technical resource is available
    if (!source.businessObject.isAssignedTo || source.businessObject.isAssignedTo.length === 0) {
      return true;
    }

    // Check if there are unassigned technical resources
    const freeTechnicalResources = filter(technicalResources, tr => {
      return !tr.isAssignedTo || !tr.isAssignedTo.id || tr.isAssignedTo.id !== source.id;
    });

    return freeTechnicalResources.length > 0;
  }
}

/**
 * Utility for element type checking and processing
 */
export class ElementTypeUtils {
  /**
   * Gets clean element type name (removes fpb: prefix)
   */
  static getCleanElementType(element) {
    return element.type ? element.type.replace('fpb:', '') : '';
  }

  /**
   * Checks if element is a specific FPB type
   */
  static isElementType(element, type) {
    return is(element, type);
  }

  /**
   * Checks if element can have decompose functionality
   */
  static canDecompose(element, noOfUsageConnections) {
    const inputCount = element.incoming.length - noOfUsageConnections(element.incoming);
    const outputCount = element.outgoing.length - noOfUsageConnections(element.outgoing);
    
    return inputCount > 0 && outputCount > 0;
  }
}