import { is } from './utils';



/**
 * Bei Erstellung von neuen Layern wird Kopie von relevanten StateShapes erstellt
 * @param {*} elementFactory 
 * @param {*} type 
 * @param {*} businessObject 
 */
export function createStateShapeForNewLayer(elementFactory, type, businessObject) {
    let stateShape = elementFactory.create('shape', {
        type: type,
        businessObject: businessObject
    });
    stateShape.businessObject.isAssignedTo = [];
    stateShape.businessObject.incoming = [];
    stateShape.businessObject.outgoing = [];
    return stateShape;
}

/**
 * Prüft ob State auf der SystemGrenze liegt und wenn ja, auf welcher.
 * @param {*} systemLimit 
 * @param {*} state 
 */

export function checkIfOnSystemBorder(systemLimit, state) {
    let upperBorder_1 = systemLimit.y - state.height + 1;
    let upperBorder_2 = systemLimit.y + state.height - 1;

    let bottomBorder_1 = systemLimit.y + systemLimit.height - state.height + 1;
    let bottomBorder_2 = systemLimit.y + systemLimit.height + state.height - 1;

    if (state.y >= upperBorder_1 && state.y <= upperBorder_2) {
        return 'onUpperBorder';
    };
    if (state.y >= bottomBorder_1 && state.y <= bottomBorder_2) {
        return 'onBottomBorder';
    }
    return '';
}


/**
 * 
 * Funktion um Elemente eines Types aus einem ElementsContainer zu erhalten
 * @param {Array} elementsContainer 
 * @param {*} type 
 */
export function getElementsFromElementsContainer(elementsContainer, type) {
    var elements = [];
    elementsContainer.forEach(function (element) {
        if (is(element, type)) {
            elements.push(element);
        }
    })
    return elements;
}
/**
 * Funktion um BusinessObjects eines Types aus einem ElementsContainer zu erhalten
 * @param {*} elementsContainer 
 * @param {*} type 
 */
export function getBusinessObjectFromElementsContainer(elementsContainer, type) {
    let elements = getElementsFromElementsContainer(elementsContainer, type);
    let businessObjects = [];
    if (elements.length == 0) {
        return businessObjects;
    }
    elements.forEach((element) => {
        businessObjects.push(element.businessObject);
    })
    return businessObjects;
};

/**
 * gibt an wieviele Usage Connections vorhanden sind
 * @param {*} connectionContainer 
 */

export function noOfUsageConnections(connectionContainer) {
    let no = 0;
    if (connectionContainer.length == 0) {
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
    var returnElement = null;
    elementsContainer.forEach(function (element) {
        if (element.businessObject.id === id) {
            returnElement = element;
        }
    })
    return returnElement;
}