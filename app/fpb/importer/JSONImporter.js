import { is } from '../help/utils';

import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

export default function JSONImporter(eventBus, canvas, modeling, fpbjs, fpbFactory, elementFactory) {
    this._eventBus = eventBus;
    this._canvas = canvas;
    this._modeling = modeling;
    this._fpbjs = fpbjs;
    this._fpbFactory = fpbFactory;
    this._elementFactory = elementFactory;
    this._processes = new Array();
    
    // Error handling function
    this._showError = (message, details = null) => {
        this._eventBus.fire('import.error', { message, details });
    };

    this._eventBus.on('FPBJS.import', (event) => {
        try {
            let data = event.data;
            if (!data || !Array.isArray(data)) {
                console.error('JSONImporter: Invalid data structure - expected array');
                return;
            }
            let project = this.constructProjectDefinition(data);
            if (!project) {
                return;
            }
            
            if (project) {
                const buildSuccess = this.buildProcesses(data, project);
                if (!buildSuccess) {
                    return;
                }
                
                this._eventBus.fire('dataStore.addedProjectDefinition', {
                    projectDefinition: project
                })

                fpbjs.setProjectDefinition(project);
            this._processes.forEach(pr => {
                if (typeof pr.process.businessObject.parent === 'string' || pr.process.businessObject.parent instanceof String) {
                    pr.process.businessObject.parent = this._processes.find(proc => {
                        return proc.id === pr.process.businessObject.parent;
                    }).process
                };
                if (pr.process.businessObject.consistsOfProcesses.length > 0) {
                    let tmpArray = new Array();
                    pr.process.businessObject.consistsOfProcesses.forEach((e) => {
                        if (typeof e === 'string' || e instanceof String) {
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
                        this._eventBus.fire('dataStore.newProcess', {
                            newProcess: pr.process,
                            parentProcess: null
                        })
                        // Event feuern für LayerPanel
                        this._eventBus.fire('layerPanel.newProcess', {
                            newProcess: pr.process,
                            parentProcess: null
                        })
                    }
                })
                modeling.switchProcess(project.entryPoint);
            }, 2000)
            }
        } catch (error) {
            this._showError(
                'Import failed unexpectedly',
                `An unexpected error occurred during import: ${error.message}`
            );
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
    let project;
    for (let dat of data) {
        if (dat.$type && dat.$type === 'fpb:Project') {
            project = this._fpbFactory.create('fpb:Project', {
                name: dat.name,
                targetNamespace: dat.targetNamespace,
                entryPoint: dat.entryPoint
            });
            break;
        }
    }
    if (!project) {
        this._showError(
            'Invalid file format: No project definition found',
            'The imported file does not contain a valid FPB.JS project structure. Please ensure the file was exported from FPB.JS.'
        );
    }
    return project;
}

JSONImporter.prototype.buildProcesses = function (data, projectDefinition) {
    for (let process of data) {
        if (process.process && !process.elementVisualInformation) {
            this._showError(
                'Incomplete data: Visual information missing',
                `Process "${process.process.id}" is missing visual information required for proper display. The file may be corrupted or incomplete.`
            );
            return false; // Return false to indicate failure
        }
        else if (process.process && process.elementVisualInformation && process.elementDataInformation) {
            let pro = process.process;
            let eVI = process.elementVisualInformation;
            let eDI = process.elementDataInformation;

            let process_rootElement = this._elementFactory.create('root',
                {
                    type: 'fpb:Process',
                    id: pro.id,

                });
            process_rootElement.businessObject.parent = pro.parent;
            if (pro.id === projectDefinition.entryPoint) {
                projectDefinition.entryPoint = process_rootElement;
                process_rootElement.businessObject.parent = projectDefinition;
            };

            let no = this._processes.push({ id: pro.id, process: process_rootElement, updateElements: [] });
            // Zunächst IDs im Process abspeichern
            process_rootElement.businessObject.consistsOfProcesses = pro.consistsOfProcesses;
            process_rootElement.businessObject.isDecomposedProcessOperator = pro.isDecomposedProcessOperator;

            pro.elementsContainer.forEach((id) => {
                this.filterElements(id, eVI, eDI, process_rootElement, process_rootElement, no);
            })
        }
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
    if (vI === undefined) {
        console.error(`JSONImporter: Missing visual information for element ${dI?.id || 'unknown'} - using fallback position`);
        vI = { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300, width: 50, height: 50, type: dI ? dI.$type : 'unknown' };
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
    bO.characteristics = characteristics;
}

JSONImporter.prototype.updateDepedencies = function (container, element) {
    if (!element || !element.businessObject) {
        console.warn('JSONImporter: updateDepedencies called with invalid element');
        return;
    }
    
    if (is(element, 'fpb:Flow')) {
        let source;
        let target;
        if (typeof element.businessObject.sourceRef === 'string' || element.businessObject.sourceRef instanceof String) {
            source = container.find((el) => {
                return el && el.id === element.businessObject.sourceRef
            });
            if (source && source.businessObject) {
                if (!Array.isArray(source.businessObject.outgoing)) {
                    source.businessObject.outgoing = [source.businessObject.outgoing];
                };
                collectionRemove(source.businessObject.outgoing, element.id);
                collectionAdd(source.businessObject.outgoing, element.businessObject);
                element.businessObject.sourceRef = source.businessObject;
                //source.outgoing = element;
                element.source = source;
            }

        };
        if (typeof element.businessObject.targetRef === 'string' || element.businessObject.targetRef instanceof String) {
            target = container.find((el) => {
                return el && el.id === element.businessObject.targetRef
            });
            if (target && target.businessObject) {
                if (!Array.isArray(target.businessObject.incoming)) {
                    target.businessObject.incoming = [target.businessObject.incoming];
                }
                collectionRemove(target.businessObject.incoming, element.id);
                collectionAdd(target.businessObject.incoming, element.businessObject);
                element.businessObject.targetRef = target.businessObject;
                //target.incoming = element;
                element.target = target;
            }
        };
        if (element.businessObject.inTandemWith) {
            element.businessObject.inTandemWith.forEach((tandemFlow) => {
                if (typeof tandemFlow === 'string' || tandemFlow instanceof String) {
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
        if (source && is(source, 'fpb:State')) {
            collectionRemove(source.businessObject.isAssignedTo, target.businessObject.id);
            collectionAdd(source.businessObject.isAssignedTo, target.businessObject);
        }
        if (target && is(target, 'fpb:State')) {
            collectionRemove(target.businessObject.isAssignedTo, source.businessObject.id);
            collectionAdd(target.businessObject.isAssignedTo, source.businessObject);
        }
        if ((source && is(source, 'fpb:ProcessOperator')) || (target && is(target, 'fpb:ProcessOperator'))) {
            if ((source && is(source, 'fpb:TechnicalResource')) || (target && is(target, 'fpb:TechnicalResource'))) {
                if (source && source.businessObject) {
                    if (!Array.isArray(source.businessObject.isAssignedTo)) {
                        source.businessObject.isAssignedTo = [source.businessObject.isAssignedTo];
                    }
                    collectionRemove(source.businessObject.isAssignedTo, target.businessObject.id);
                    collectionAdd(source.businessObject.isAssignedTo, target.businessObject);
                }
                if (target && target.businessObject) {
                    if (!Array.isArray(target.businessObject.isAssignedTo)) {
                        target.businessObject.isAssignedTo = [target.businessObject.isAssignedTo];
                    }
                    collectionRemove(target.businessObject.isAssignedTo, source.businessObject.id);
                    collectionAdd(target.businessObject.isAssignedTo, source.businessObject);
                }
            }
        }
    }
    if (is(element, 'fpb:ProcessOperator')) {
        if (element.businessObject.decomposedView) {

            if (typeof element.businessObject.decomposedView === 'string' || element.businessObject.decomposedView instanceof String) {
                let process = this._processes.find((pr) => {
                    return pr.process.id === element.businessObject.decomposedView;
                }).process;

                element.businessObject.decomposedView = process;
                process.businessObject.isDecomposedProcessOperator = element.businessObject;
            }
        }
    }

}

