import { is } from '../help/utils';
import { getMid } from 'diagram-js/lib/layout/LayoutUtil';
import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

// Import our new utilities and constants
import { FPB_TYPES, TYPE_GROUPS, IMPORT_TIMING, IMPORT_EVENTS } from './ImportConstants';
import { 
    ArrayUtils, 
    TypeUtils, 
    LookupUtils, 
    VisualUtils, 
    ValidationUtils 
} from './ImportUtils';
import { ErrorHandler } from './ImportErrors';

export default function JSONImporter(eventBus, canvas, modeling, fpbjs, fpbFactory, elementFactory) {
    this._eventBus = eventBus;
    this._canvas = canvas;
    this._modeling = modeling;
    this._fpbjs = fpbjs;
    this._fpbFactory = fpbFactory;
    this._elementFactory = elementFactory;
    this._processes = [];
    
    // Initialize error handler with improved error handling
    this._errorHandler = new ErrorHandler(eventBus);
    
    // Deprecated: Keep for backward compatibility but use ErrorHandler instead
    this._showError = (message, details = null) => {
        this._eventBus.fire(IMPORT_EVENTS.IMPORT_ERROR, { message, details });
    };

    this._eventBus.on(IMPORT_EVENTS.IMPORT_REQUEST, (event) => {
        try {
            const data = cloneImportData(event.data);

            // Every IMPORT_REQUEST is a REPLACE, not an append. Without this,
            // buildProcesses keeps pushing onto _processes from prior imports
            // and the LayerPanel stacks ghost entries.
            this._processes = [];

            // Validate data structure using utilities
            const dataValidation = ValidationUtils.validateImportData(data);
            if (!dataValidation.isValid) {
                this._errorHandler.handleDataStructureError(
                    'Invalid import data structure',
                    dataValidation.error
                );
                return;
            }
            const project = this.constructProjectDefinition(data);
            if (!project) {
                return;
            }

            const buildSuccess = this.buildProcesses(data, project);
            if (!buildSuccess) {
                return;
            }
            
            this._eventBus.fire(IMPORT_EVENTS.PROJECT_ADDED, {
                projectDefinition: project
            });

            this._fpbjs.setProjectDefinition(project);

            // O(1) lookup maps so dependency resolution is linear, not O(n²).
            // Visible stall during import on models with many decomposed
            // processes otherwise.
            const processByOuterId = new Map();
            const processByInnerId = new Map();
            this._processes.forEach((p) => {
                if (p.id) processByOuterId.set(p.id, p);
                if (p.process && p.process.id) processByInnerId.set(p.process.id, p);
            });

            this._processes.forEach(pr => {
                if (TypeUtils.isStringLike(pr.process.businessObject.parent)) {
                    const parentProc = processByOuterId.get(pr.process.businessObject.parent);
                    if (parentProc) {
                        pr.process.businessObject.parent = parentProc.process;
                    }
                };
                if (pr.process.businessObject.consistsOfProcesses && pr.process.businessObject.consistsOfProcesses.length > 0) {
                    // Ids without a matching process in this import are dropped
                    // instead of lingering as strings.
                    const resolvedProcesses = [];
                    pr.process.businessObject.consistsOfProcesses.forEach((e) => {
                        if (!TypeUtils.isStringLike(e)) {
                            collectionAdd(resolvedProcesses, e);
                            return;
                        }
                        const found = processByInnerId.get(e);
                        if (!found) {
                            this._errorHandler.logWarning(`Process ${pr.process.id} lists missing sub-process ${e} - dropped`);
                            return;
                        }
                        collectionAdd(resolvedProcesses, found.process);
                    });
                    pr.process.businessObject.consistsOfProcesses = resolvedProcesses;
                }
                if (pr.updateElements.length > 0) {
                    pr.updateElements.forEach((el) => {
                        this.updateDepedencies(pr.updateElements, el);
                    })
                };




            })
            // Files without "parent" on sub-processes (external generators) still
            // carry the hierarchy in consistsOfProcesses. Compose and the layer
            // tree navigate via parent, so derive it where it is missing.
            this._processes.forEach((pr) => {
                (pr.process.businessObject.consistsOfProcesses || []).forEach((child) => {
                    const childBo = child && child.businessObject;
                    if (childBo && (!childBo.parent || TypeUtils.isStringLike(childBo.parent))) {
                        childBo.parent = pr.process;
                    }
                });
            });
            this._processes.forEach((pr) => {
                this.removeUnconnectedConnections(pr.process);
                this.completeConnectionWaypoints(pr.process);
            });
            // Timeout required so remaining components finish loading before import.
            setTimeout(() => {
                this._processes.forEach((pr, index) => {
                    if (pr.process) {
                        this._eventBus.fire(IMPORT_EVENTS.NEW_PROCESS, {
                            newProcess: pr.process,
                            parentProcess: null
                        });
                        // Fire event for LayerPanel
                        this._eventBus.fire(IMPORT_EVENTS.LAYER_PANEL_NEW_PROCESS, {
                            newProcess: pr.process,
                            parentProcess: null
                        });
                    }
                });
                // Switch to main process
                try {
                    modeling.switchProcess(project.entryPoint);
                } catch (error) {
                    console.error('JSONImporter: Process switch failed:', error);
                }
            }, IMPORT_TIMING.UI_INITIALIZATION_DELAY);
        } catch (error) {
            this._errorHandler.handleError(error);
        }
    });

}
/**
 * Swap a reference id for its object at the same position, so resolving keeps
 * the order of the imported list and an unchanged model exports unchanged.
 */
function replaceReference(list, id, object) {
    const index = list.indexOf(id);
    if (list.indexOf(object) !== -1) {
        if (index !== -1) {
            list.splice(index, 1);
        }
    } else if (index !== -1) {
        list[index] = object;
    } else {
        list.push(object);
    }
}

/**
 * The importer consumes elementDataInformation/elementVisualInformation while
 * building (filterElements removes every matched entry) and swaps reference IDs
 * for objects in place. Work on a copy so the caller's data stays intact and can
 * be imported again. Non-serializable input falls back to the original object,
 * which is the previous behavior.
 */
function cloneImportData(data) {
    try {
        return JSON.parse(JSON.stringify(data));
    } catch (error) {
        return data;
    }
}

JSONImporter.$inject = [
    'eventBus',
    'canvas',
    'modeling',
    'fpbjs',
    'fpbFactory',
    'elementFactory'
];


JSONImporter.prototype.constructProjectDefinition = function (data) {
    // Use utility for validation
    const projectValidation = ValidationUtils.validateProjectDefinition(data);
    if (!projectValidation.isValid) {
        this._errorHandler.handleProjectDefinitionError(
            'Invalid file format: No project definition found',
            'The imported file does not contain a valid FPB.JS project structure. Please ensure the file was exported from FPB.JS.'
        );
        return null;
    }

    const projectData = projectValidation.project;
    const project = this._fpbFactory.create(FPB_TYPES.PROJECT, {
        name: projectData.name,
        targetNamespace: projectData.targetNamespace,
        entryPoint: projectData.entryPoint
    });

    return project;
};

JSONImporter.prototype.buildProcesses = function (data, projectDefinition) {
    for (const process of data) {
        // Skip non-process entries
        if (!process.process) {
            continue;
        }

        // Validate process data completeness
        const processValidation = ValidationUtils.validateProcessData(process);
        if (!processValidation.isValid) {
            this._errorHandler.handleVisualInformationError(
                'Incomplete data: Visual information missing',
                `Process "${process.process.id}" is missing ${processValidation.error}. The file may be corrupted or incomplete.`
            );
            return false;
        }

        const pro = process.process;
        const eVI = process.elementVisualInformation;
        const eDI = process.elementDataInformation;

        const process_rootElement = this._elementFactory.create('root', {
            type: FPB_TYPES.PROCESS,
            id: pro.id,
        });
        
        process_rootElement.businessObject.parent = pro.parent;
        if (pro.id === projectDefinition.entryPoint) {
            projectDefinition.entryPoint = process_rootElement;
            process_rootElement.businessObject.parent = projectDefinition;
        }

        const no = this._processes.push({ 
            id: pro.id, 
            process: process_rootElement, 
            updateElements: [] 
        });
        
        // First store IDs in the Process
        process_rootElement.businessObject.consistsOfProcesses = pro.consistsOfProcesses;
        process_rootElement.businessObject.isDecomposedProcessOperator = pro.isDecomposedProcessOperator;

        pro.elementsContainer.forEach((id) => {
            this.filterElements(id, eVI, eDI, process_rootElement, process_rootElement, no);
        });
    }
    return true; // Return true to indicate success
}

JSONImporter.prototype.filterElements = function (id, eVI, eDI, process, parent, no) {
    let dataInformation;
    let visualInformation;
    let type;
    
    
    for (let el of eDI) {
        if (id === el.id) {
            dataInformation = el;
            type = el.$type;
            collectionRemove(eDI, el);
            break;
        }
    }
    if (!dataInformation) {
        // An ID without data (typo, element dropped by an external generator)
        // used to abort the whole import. Skip it and keep the rest of the model.
        this._errorHandler.logWarning(`Element ${id} is listed in a container but has no data - skipped`);
        return;
    }
    for (let el of eVI) {
        if (id === el.id) {
            visualInformation = el;
            collectionRemove(eVI, el);
            break;
        }
    };
    

    if (type === 'fpb:SystemLimit') {
        this.buildSystemLimit(visualInformation, dataInformation, process, eVI, eDI, no);
    }
    else if (type === 'fpb:ProcessOperator' || type === 'fpb:Product' || type === 'fpb:Information' || type === 'fpb:Energy') {
        this.buildSystemLimitShapes(visualInformation, dataInformation, process, parent, no)
    }
    else if (type === 'fpb:Flow' || type === 'fpb:AlternativeFlow' || type === 'fpb:ParallelFlow') {
        this.buildSystemLimitFlow(visualInformation, dataInformation, parent, no)
    }
    else {
        this.buildTRandUsage(visualInformation, dataInformation, process, no);
    }
}
JSONImporter.prototype.buildSystemLimit = function (vI, dI, process, eVI, eDI, no) {
    let sl = this._elementFactory.create('shape', {
        type: vI.type,
        id: vI.id,
        x: vI.x,
        y: vI.y,
        width: vI.width,
        height: vI.height
    });
    sl.businessObject.name = dI.name;
    collectionAdd(process.businessObject.elementsContainer, sl);
    process.businessObject.consistsOfSystemLimit = sl.businessObject;
    dI.elementsContainer.forEach(id => {
        this.filterElements(id, eVI, eDI, process, sl, no);
    })
}

JSONImporter.prototype.buildSystemLimitShapes = function (vI, dI, process, systemLimit, no) {
    if (!vI) {
        this._errorHandler.logWarning(
            `Missing visual information for element ${dI?.id || 'unknown'} - using fallback position`
        );
        vI = VisualUtils.createFallbackVisualInfo(
            dI?.id || 'unknown', 
            dI?.$type || 'unknown'
        );
    }
    
    let shape = this._elementFactory.create('shape', {
        type: vI.type,
        id: vI.id,
        x: vI.x,
        y: vI.y,
        width: vI.width,
        height: vI.height,
    });
    shape.businessObject.identification = dI.identification;
    shape.businessObject.incoming = dI.incoming;
    shape.businessObject.outgoing = dI.outgoing;
    shape.businessObject.name = dI.name;
    shape.businessObject.isAssignedTo = dI.isAssignedTo;
    if (dI.characteristics) {
        this.buildCharacteristics(shape.businessObject, dI.characteristics);
    }
    if (dI.decomposedView) {
        shape.businessObject.decomposedView = dI.decomposedView;
    }
    // refObj wird vom AML-Mapper für Boundary-States emittiert
    // (state ID des States im Parent-Process). Vorher wurde das Feld beim
    // Import ignoriert → Round-Trip-Metadata-Loss bei Decomposition.
    if (dI.refObj) {
        shape.businessObject.refObj = dI.refObj;
    }
    collectionAdd(systemLimit.businessObject.elementsContainer, shape);
    if (vI.type === "fpb:ProcessOperator") {
        collectionAdd(process.businessObject.consistsOfProcessOperator, shape.businessObject);
    }
    if (vI.type === 'fpb:Product' || vI.type === 'fpb:Energy' || vI.type === 'fpb:Information') {
        collectionAdd(process.businessObject.consistsOfStates, shape.businessObject);
    }
    // Every shape takes part in reference resolution. Flows look up their source
    // and target in updateElements, so a state without its own incoming/outgoing
    // lists (valid for external generators) must still be found there.
    this._processes[no - 1].updateElements.push(shape);
}
JSONImporter.prototype.buildSystemLimitFlow = function (vI, dI, systemLimit, no) {
    if (!vI) {
        // Waypoints are synthesized in completeConnectionWaypoints once source
        // and target are resolved.
        this._errorHandler.logWarning(`Missing visual information for connection ${dI.id} - drawing a straight line`);
    }
    let connection = this._elementFactory.create('connection', {
        type: vI ? vI.type : dI.$type,
        id: vI ? vI.id : dI.id,
        waypoints: vI ? vI.waypoints : []
    });
    connection.businessObject.sourceRef = dI.sourceRef;
    connection.businessObject.targetRef = dI.targetRef;
    if (dI.inTandemWith) {
        connection.businessObject.inTandemWith = dI.inTandemWith;
    }

    collectionAdd(systemLimit.businessObject.elementsContainer, connection);
    collectionAdd(this._processes[no - 1].updateElements, connection);
}
JSONImporter.prototype.buildTRandUsage = function (vI, dI, process, no) {
    let element;
    const elementType = vI ? vI.type : dI.$type;
    if (elementType === 'fpb:TechnicalResource') {
        element = this._elementFactory.create('shape', {
            type: vI.type,
            id: vI.id,
            x: vI.x,
            y: vI.y,
            width: vI.width,
            height: vI.height,
        });
        element.businessObject.name = dI.name;
        element.businessObject.identification = dI.identification;
        element.businessObject.incoming = dI.incoming;
        element.businessObject.outgoing = dI.outgoing;
        element.businessObject.isAssignedTo = dI.isAssignedTo;
        if (dI.characteristics) {
            this.buildCharacteristics(element.businessObject, dI.characteristics);
        }
    }
    if (elementType === 'fpb:Usage') {
        if (!vI) {
            this._errorHandler.logWarning(`Missing visual information for connection ${dI.id} - drawing a straight line`);
        }
        element = this._elementFactory.create('connection', {
            type: elementType,
            id: vI ? vI.id : dI.id,
            waypoints: vI ? vI.waypoints : []
        })
        element.businessObject.sourceRef = dI.sourceRef;
        element.businessObject.targetRef = dI.targetRef;
    }
    collectionAdd(process.businessObject.elementsContainer, element);
    collectionAdd(this._processes[no - 1].updateElements, element);
}

/**
 * All connections of a process: flows inside the SystemLimit and usages on the
 * process level, each with the container that holds it.
 */
JSONImporter.prototype.getConnections = function (process) {
    const connections = [];
    const collect = (container) => (container || []).forEach((element) => {
        if (element && is(element, FPB_TYPES.FLOW)) {
            connections.push({ element, container });
        }
    });
    collect(process.businessObject.elementsContainer);
    (process.businessObject.elementsContainer || []).forEach((element) => {
        if (element && is(element, FPB_TYPES.SYSTEM_LIMIT)) {
            collect(element.businessObject.elementsContainer);
        }
    });
    return connections;
};

/**
 * A connection whose source or target could not be resolved cannot be drawn and
 * used to abort the whole import. Drop it with a warning and undo the half of the
 * wiring that did resolve.
 */
JSONImporter.prototype.removeUnconnectedConnections = function (process) {
    const removedIds = [];
    this.getConnections(process).forEach(({ element, container }) => {
        if (element.source && element.target) {
            return;
        }
        const bo = element.businessObject;
        this._errorHandler.logWarning(`Connection ${element.id} references a missing source or target - removed`);
        collectionRemove(container, element);
        removedIds.push(element.id);
        [element.source, element.target].forEach((end) => {
            if (end && end.businessObject) {
                collectionRemove(end.businessObject.outgoing, bo);
                collectionRemove(end.businessObject.incoming, bo);
            }
        });
        (bo.inTandemWith || []).forEach((partner) => {
            if (partner && !TypeUtils.isStringLike(partner)) {
                collectionRemove(partner.inTandemWith, bo);
            }
        });
    });
    if (removedIds.length === 0) {
        return;
    }
    // Elements may still list a removed connection by its id (unresolved side).
    const forEachShape = (container) => (container || []).forEach((element) => {
        if (!element || !element.businessObject || is(element, FPB_TYPES.FLOW)) {
            return;
        }
        removedIds.forEach((id) => {
            collectionRemove(element.businessObject.incoming, id);
            collectionRemove(element.businessObject.outgoing, id);
        });
        if (is(element, FPB_TYPES.SYSTEM_LIMIT)) {
            forEachShape(element.businessObject.elementsContainer);
        }
    });
    forEachShape(process.businessObject.elementsContainer);
};

/**
 * Connections imported without (usable) visual information get a straight line
 * between the centers of source and target.
 */
JSONImporter.prototype.completeConnectionWaypoints = function (process) {
    this.getConnections(process).forEach(({ element }) => {
        const hasWaypoints = element.waypoints && element.waypoints.length >= 2;
        if (!hasWaypoints && element.source && element.target) {
            element.waypoints = [getMid(element.source), getMid(element.target)];
        }
    });
};

JSONImporter.prototype.buildCharacteristics = function (bO, char) {
    let characteristics = [];
    const addValidityLimits = (limits) => {
        let validityLimits = [];
        limits.forEach((limit) => {
            let validityLimit;
            if (limit.$type === 'fpbch:ValidityLimits') {
                validityLimit = this._fpbFactory.create(limit.$type, {
                    limitType: limit.limitType,
                    from: limit.from,
                    to: limit.to
                })
            }
            collectionAdd(validityLimits, validityLimit);
        })
        return validityLimits;
    }
    
    const addActualValues = (values) => {
        // Handle both array and single object formats
        if (Array.isArray(values)) {
            // If it's an array, take the first element or return null if empty
            const firstValue = values.length > 0 ? values[0] : null;
            if (firstValue && firstValue.$type) {
                return this._fpbFactory.create(firstValue.$type, {
                    value: firstValue.value,
                    unit: firstValue.unit
                });
            }
            return null;
        } else if (values && values.$type) {
            // Handle single object format
            return this._fpbFactory.create(values.$type, {
                value: values.value,
                unit: values.unit
            });
        }
        return null;
    }
    
    char.forEach(ch => {
        let type = ch.$type;
        if (type === 'fpbch:Characteristics') {
            let characteristic = this._fpbFactory.create(type, {
                //category
                category: this._fpbFactory.create(ch.category.$type, {
                    uniqueIdent: ch.category.uniqueIdent,
                    longName: ch.category.longName,
                    shortName: ch.category.shortName,
                    versionNumber: ch.category.versionNumber,
                    revisionNumber: ch.category.revisionNumber
                }),
                descriptiveElement: this._fpbFactory.create(ch.descriptiveElement.$type, {
                    valueDeterminationProcess: ch.descriptiveElement.valueDeterminationProcess,
                    representivity: ch.descriptiveElement.representivity,
                    setpointValue: this._fpbFactory.create(ch.descriptiveElement.setpointValue.$type, {
                        value: ch.descriptiveElement.setpointValue.value,
                        unit: ch.descriptiveElement.setpointValue.unit
                    }),
                    validityLimits: addValidityLimits(ch.descriptiveElement.validityLimits),
                    actualValues: addActualValues(ch.descriptiveElement.actualValues),
                }),
                relationalElement: this._fpbFactory.create(ch.relationalElement.$type, {
                    view: ch.relationalElement.view,
                    model: ch.relationalElement.model,
                    regulationsForRelationalGeneration: ch.relationalElement.regulationsForRelationalGeneration
                })
            });
            collectionAdd(characteristics, characteristic);
        }
    });
    // Use proper diagram-js property setting for characteristics
    bO.set('characteristics', characteristics);
}

JSONImporter.prototype.updateDepedencies = function (container, element) {
    if (!element || !element.businessObject) {
        this._errorHandler.logWarning('updateDepedencies called with invalid element');
        return;
    }
    
    if (is(element, FPB_TYPES.FLOW)) {
        let source;
        let target;
        if (TypeUtils.isStringLike(element.businessObject.sourceRef)) {
            source = container.find((el) => {
                return el && el.id === element.businessObject.sourceRef
            });
            if (source && source.businessObject) {
                source.businessObject.outgoing = ArrayUtils.ensureArray(source.businessObject.outgoing);
                collectionRemove(source.businessObject.outgoing, element.id);
                collectionAdd(source.businessObject.outgoing, element.businessObject);
                element.businessObject.sourceRef = source.businessObject;
                //source.outgoing = element;
                element.source = source;
            }

        };
        if (TypeUtils.isStringLike(element.businessObject.targetRef)) {
            target = container.find((el) => {
                return el && el.id === element.businessObject.targetRef
            });
            if (target && target.businessObject) {
                target.businessObject.incoming = ArrayUtils.ensureArray(target.businessObject.incoming);
                collectionRemove(target.businessObject.incoming, element.id);
                collectionAdd(target.businessObject.incoming, element.businessObject);
                element.businessObject.targetRef = target.businessObject;
                //target.incoming = element;
                element.target = target;
            }
        };
        if (element.businessObject.inTandemWith) {
            // Resolve over a copy: replacing entries in the list while iterating
            // it skipped the entry after every resolved one. Partners get the
            // back-link, so a group listed on one side only still ends up symmetric.
            const resolved = [];
            element.businessObject.inTandemWith.slice().forEach((tandemFlow) => {
                if (!TypeUtils.isStringLike(tandemFlow)) {
                    collectionAdd(resolved, tandemFlow);
                    return;
                }
                const partner = container.find((el) => el && el.id === tandemFlow);
                if (!partner || !partner.businessObject) {
                    this._errorHandler.logWarning(`Connection ${element.id} lists missing tandem partner ${tandemFlow} - dropped`);
                    return;
                }
                collectionAdd(resolved, partner.businessObject);
                if (is(partner, FPB_TYPES.PARALLEL_FLOW) || is(partner, FPB_TYPES.ALTERNATIVE_FLOW)) {
                    partner.businessObject.inTandemWith = ArrayUtils.ensureArray(partner.businessObject.inTandemWith);
                    replaceReference(partner.businessObject.inTandemWith, element.id, element.businessObject);
                }
            });
            element.businessObject.inTandemWith = resolved;
        }
        // isAssignedTo needs both ends. A flow with an unresolved end is dropped
        // afterwards in removeUnconnectedConnections.
        if (source && target && TYPE_GROUPS.STATES.some(type => is(source, type))) {
            collectionRemove(source.businessObject.isAssignedTo, target.businessObject.id);
            collectionAdd(source.businessObject.isAssignedTo, target.businessObject);
        }
        if (source && target && TYPE_GROUPS.STATES.some(type => is(target, type))) {
            collectionRemove(target.businessObject.isAssignedTo, source.businessObject.id);
            collectionAdd(target.businessObject.isAssignedTo, source.businessObject);
        }
        if (source && target && (is(source, FPB_TYPES.PROCESS_OPERATOR) || is(target, FPB_TYPES.PROCESS_OPERATOR))) {
            if (is(source, FPB_TYPES.TECHNICAL_RESOURCE) || is(target, FPB_TYPES.TECHNICAL_RESOURCE)) {
                if (source && source.businessObject) {
                    source.businessObject.isAssignedTo = ArrayUtils.ensureArray(source.businessObject.isAssignedTo);
                    collectionRemove(source.businessObject.isAssignedTo, target.businessObject.id);
                    collectionAdd(source.businessObject.isAssignedTo, target.businessObject);
                }
                if (target && target.businessObject) {
                    target.businessObject.isAssignedTo = ArrayUtils.ensureArray(target.businessObject.isAssignedTo);
                    collectionRemove(target.businessObject.isAssignedTo, source.businessObject.id);
                    collectionAdd(target.businessObject.isAssignedTo, source.businessObject);
                }
            }
        }
    }
    if (is(element, FPB_TYPES.PROCESS_OPERATOR)) {
        if (element.businessObject.decomposedView) {
            if (TypeUtils.isStringLike(element.businessObject.decomposedView)) {
                const foundProc = this._processes.find((pr) => {
                    return pr.process.id === element.businessObject.decomposedView;
                });
                if (foundProc) {
                    let process = foundProc.process;
                    element.businessObject.decomposedView = process;
                    process.businessObject.isDecomposedProcessOperator = element.businessObject;
                } else {
                    // Dangling reference: the referenced sub-process is not in
                    // this import. Leaving the STRING in place crashes every
                    // later decomposedView consumer (Decompose reads
                    // .businessObject.elementsContainer off it) — degrade to a
                    // non-decomposed PO instead.
                    console.warn('[FPB.JS] Import: decomposedView "' + element.businessObject.decomposedView +
                        '" on ProcessOperator "' + (element.businessObject.name || element.id) +
                        '" references a missing process — clearing the decomposition link.');
                    element.businessObject.decomposedView = null;
                }
            }
        }
    }

}

