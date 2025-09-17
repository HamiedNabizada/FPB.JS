import { is } from '../help/utils';
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
            const data = event.data;
            
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

            fpbjs.setProjectDefinition(project);
            
            this._processes.forEach(pr => {
                if (TypeUtils.isStringLike(pr.process.businessObject.parent)) {
                    pr.process.businessObject.parent = this._processes.find(proc => {
                        return proc.id === pr.process.businessObject.parent;
                    }).process
                };
                if (pr.process.businessObject.consistsOfProcesses.length > 0) {
                    let tmpArray = [];
                    pr.process.businessObject.consistsOfProcesses.forEach((e) => {
                        if (TypeUtils.isStringLike(e)) {
                            let subProcess = this._processes.find((sP) => {
                                return sP.process.id === e;
                            }).process
                            tmpArray.push({ id: subProcess.id, subProcess: subProcess });

                        }
                    });
                    tmpArray.forEach((el) => {
                        collectionRemove(pr.process.businessObject.consistsOfProcesses, el.id);
                        collectionAdd(pr.process.businessObject.consistsOfProcesses, el.subProcess);
                    })


                }
                if (pr.updateElements.length > 0) {
                    pr.updateElements.forEach((el) => {
                        this.updateDepedencies(pr.updateElements, el);
                    })
                };




            })
            // Timeout notwendig, damit restliche Komponenten erst fertig geladen sind, bevor importiert wird.
            setTimeout(() => {
                this._processes.forEach((pr, index) => {
                    if (pr.process) {
                        this._eventBus.fire(IMPORT_EVENTS.NEW_PROCESS, {
                            newProcess: pr.process,
                            parentProcess: null
                        });
                        // Event feuern für LayerPanel
                        this._eventBus.fire(IMPORT_EVENTS.LAYER_PANEL_NEW_PROCESS, {
                            newProcess: pr.process,
                            parentProcess: null
                        });
                    }
                });
                // Switch to main process with additional error handling
                try {
                    console.log('🔄 JSONImporter: Switching to main process:', project.entryPoint);
                    console.log('🔍 JSONImporter: project.entryPoint type:', typeof project.entryPoint, 'has businessObject:', !!project.entryPoint?.businessObject);
                    if (project.entryPoint?.businessObject) {
                        console.log('🔍 JSONImporter: businessObject elementsContainer:', project.entryPoint.businessObject.elementsContainer);
                    }
                    modeling.switchProcess(project.entryPoint);
                    console.log('✅ JSONImporter: Process switch completed');
                } catch (error) {
                    console.error('❌ JSONImporter: Process switch failed:', error);
                    console.log('🔍 JSONImporter: project.entryPoint at error time:', project.entryPoint);
                    // Don't throw - just log the error and continue
                }
            }, IMPORT_TIMING.UI_INITIALIZATION_DELAY);
        } catch (error) {
            this._errorHandler.handleError(error);
        }
    });

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
        
        // Zunächst IDs im Process abspeichern
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
    collectionAdd(systemLimit.businessObject.elementsContainer, shape);
    if (vI.type === "fpb:ProcessOperator") {
        collectionAdd(process.businessObject.consistsOfProcessOperator, shape.businessObject);
    }
    if (vI.type === 'fpb:Product' || vI.type === 'fpb:Energy' || vI.type === 'fpb:Information') {
        collectionAdd(process.businessObject.consistsOfStates, shape.businessObject);
    }
    if (shape.businessObject.incoming.length > 0 || shape.businessObject.outgoing.length > 0 || shape.businessObject.isAssignedTo.length > 0) {
        this._processes[no - 1].updateElements.push(shape)
    }
}
JSONImporter.prototype.buildSystemLimitFlow = function (vI, dI, systemLimit, no) {
    let connection = this._elementFactory.create('connection', {
        type: vI.type,
        id: vI.id,
        waypoints: vI.waypoints
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
    if (vI.type === 'fpb:TechnicalResource') {
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
    if (vI.type === 'fpb:Usage') {
        element = this._elementFactory.create('connection', {
            type: vI.type,
            id: vI.id,
            waypoints: vI.waypoints
        })
        element.businessObject.sourceRef = dI.sourceRef;
        element.businessObject.targetRef = dI.targetRef;
    }
    collectionAdd(process.businessObject.elementsContainer, element);
    collectionAdd(this._processes[no - 1].updateElements, element);
}

JSONImporter.prototype.buildCharacteristics = function (bO, char) {
    let characteristics = [];
    const addValidityLimits = (limits) => {
        let validityLimits = [];
        limits.forEach((limit) => {
            let validityLimit;
            if (limit.$type == 'fpbch:ValidityLimits') {
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
            element.businessObject.inTandemWith.forEach((tandemFlow) => {
                if (TypeUtils.isStringLike(tandemFlow)) {
                    let partner = container.find((partner) => {
                        if (partner.id === tandemFlow) {
                            collectionRemove(partner.businessObject.inTandemWith, element.id);
                            collectionAdd(partner.businessObject.inTandemWith, element.businessObject);
                        }
                        return partner.id === tandemFlow

                    });
                    if (partner) {
                        let flow = partner.businessObject;
                        collectionRemove(element.businessObject.inTandemWith, flow.id);
                        collectionAdd(element.businessObject.inTandemWith, flow);
                    }
                }
            })

        }
        if (source && TYPE_GROUPS.STATES.some(type => is(source, type))) {
            collectionRemove(source.businessObject.isAssignedTo, target.businessObject.id);
            collectionAdd(source.businessObject.isAssignedTo, target.businessObject);
        }
        if (target && TYPE_GROUPS.STATES.some(type => is(target, type))) {
            collectionRemove(target.businessObject.isAssignedTo, source.businessObject.id);
            collectionAdd(target.businessObject.isAssignedTo, source.businessObject);
        }
        if ((source && is(source, FPB_TYPES.PROCESS_OPERATOR)) || (target && is(target, FPB_TYPES.PROCESS_OPERATOR))) {
            if ((source && is(source, FPB_TYPES.TECHNICAL_RESOURCE)) || (target && is(target, FPB_TYPES.TECHNICAL_RESOURCE))) {
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
                let process = this._processes.find((pr) => {
                    return pr.process.id === element.businessObject.decomposedView;
                }).process;

                element.businessObject.decomposedView = process;
                process.businessObject.isDecomposedProcessOperator = element.businessObject;
            }
        }
    }

}

