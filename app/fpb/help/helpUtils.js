import { is } from './utils';



/**
 * Creates a copy of relevant StateShapes when new layers are created
 * @param {*} elementFactory
 * @param {*} type
 * @param {*} businessObject
 */
export function createStateShapeForNewLayer(elementFactory, type, businessObject) {
    /*
    let stateShape = elementFactory.create('shape', {
        type: type,
        businessObject: businessObject
    });*/
    let stateShape = elementFactory.create('shape', {
        type: type,
        id: businessObject.id,

    });
    stateShape.businessObject.name = businessObject.name;
    stateShape.businessObject.identification = businessObject.identification;
    stateShape.businessObject.isAssignedTo = [];
    stateShape.businessObject.incoming = [];
    stateShape.businessObject.outgoing = [];
    return stateShape;
}

/**
 * Checks if a state lies on the system boundary and if so, on which one.
 * @param {*} systemLimit
 * @param {*} state
 */

export function checkIfOnSystemBorder(systemLimit, state) {
    // Tolerance: State center must be close to the SystemLimit edge
    // A state "on the boundary" has its center on the edge (±30 pixel tolerance)
    const tolerance = 30;
    const stateCenter = state.y + (state.height || 50) / 2;
    const upperEdge = systemLimit.y;
    const bottomEdge = systemLimit.y + systemLimit.height;

    if (Math.abs(stateCenter - upperEdge) <= tolerance) {
        return 'onUpperBorder';
    }
    if (Math.abs(stateCenter - bottomEdge) <= tolerance) {
        return 'onBottomBorder';
    }
    return '';
}


/**
 * Retrieves elements of a given type from an elements container
 * @param {Array} elementsContainer
 * @param {*} type
 */
export function getElementsFromElementsContainer(elementsContainer, type) {
    const elements = [];
    elementsContainer.forEach(function (element) {
        if (is(element, type)) {
            elements.push(element);
        }
    })
    return elements;
}
/**
 * Retrieves BusinessObjects of a given type from an elements container
 * @param {*} elementsContainer
 * @param {*} type
 */
export function getBusinessObjectFromElementsContainer(elementsContainer, type) {
    let elements = getElementsFromElementsContainer(elementsContainer, type);
    let businessObjects = [];
    if (elements.length === 0) {
        return businessObjects;
    }
    elements.forEach((element) => {
        businessObjects.push(element.businessObject);
    })
    return businessObjects;
};

/**
 * Returns the number of Usage connections present
 * @param {*} connectionContainer
 */

export function noOfUsageConnections(connectionContainer) {
    let no = 0;
    if (connectionContainer.length === 0) {
        return no;
    }
    connectionContainer.forEach((con) => {
        if (is(con, 'fpb:Usage')) {
            no++;
        }
    })
    return no;

}


export function getElementById(elementsContainer, id) {
    let returnElement = null;
    elementsContainer.forEach(function (element) {
        if (element.businessObject.id === id) {
            returnElement = element;
        }
    })
    return returnElement;
}