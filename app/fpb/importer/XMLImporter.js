import { is } from '../help/utils';

import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

export default function XMLImporter(eventBus, canvas, modeling, fpbjs, fpbFactory, elementFactory) {
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

    this._eventBus.on('FPBJS.import.xml', (event) => {
        try {
            const xmlString = event.data;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            
            // Check for parsing errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                this._showError(
                    'Invalid XML file',
                    `The XML file could not be parsed: ${parseError.textContent}`
                );
                return;
            }
            
            const jsonData = this.convertXMLToJSON(xmlDoc);
            if (!jsonData) {
                return;
            }
            
            // For debugging - output the first process data structure in detail
            if (jsonData.length > 1) {
                console.log('XMLImporter: First process data structure for comparison:');
                console.log('elementDataInformation[0] (SystemLimit):', JSON.stringify(jsonData[1].elementDataInformation[0], null, 2));
                console.log('elementDataInformation[1] (First Product):', JSON.stringify(jsonData[1].elementDataInformation[1], null, 2));
                console.log('elementVisualInformation[0] (SystemLimit):', JSON.stringify(jsonData[1].elementVisualInformation[0], null, 2));
                console.log('elementVisualInformation[1] (First Product):', JSON.stringify(jsonData[1].elementVisualInformation[1], null, 2));
                
                // Check if arrays are proper arrays
                console.log('elementDataInformation is Array:', Array.isArray(jsonData[1].elementDataInformation));
                console.log('elementVisualInformation is Array:', Array.isArray(jsonData[1].elementVisualInformation));
                console.log('SystemLimit elementsContainer is Array:', Array.isArray(jsonData[1].elementDataInformation[0].elementsContainer));
                console.log('Product incoming is Array:', Array.isArray(jsonData[1].elementDataInformation[1].incoming));
                console.log('Product outgoing is Array:', Array.isArray(jsonData[1].elementDataInformation[1].outgoing));
            }
            
            // Use the existing JSON import event to handle the converted data
            this._eventBus.fire('FPBJS.import', { data: jsonData });
            
        } catch (error) {
            console.log('XMLImporter: Full error details:', error);
            console.log('XMLImporter: Error stack:', error.stack);
            this._showError(
                'XML import failed unexpectedly',
                `An unexpected error occurred during XML import: ${error.message}`
            );
        }
    });
}

XMLImporter.$inject = [
    'eventBus',
    'canvas',
    'modeling',
    'fpbjs',
    'fpbFactory',
    'elementFactory'
];

XMLImporter.prototype.convertXMLToJSON = function(xmlDoc) {
    const projectElement = xmlDoc.querySelector('project');
    if (!projectElement) {
        this._showError(
            'Invalid XML format: No project element found',
            'The XML file does not contain a valid FPB project structure with a <project> root element.'
        );
        return null;
    }
    
    const projectInfo = projectElement.querySelector('projectInformation');
    if (!projectInfo) {
        this._showError(
            'Invalid XML format: No project information found',
            'The XML file is missing the required <projectInformation> element.'
        );
        return null;
    }
    
    const entryPoint = projectInfo.getAttribute('entryPoint');
    if (!entryPoint) {
        this._showError(
            'Invalid XML format: No entry point defined',
            'The <projectInformation> element must have an entryPoint attribute.'
        );
        return null;
    }
    
    // Create the JSON structure matching the working format
    const jsonData = [];
    
    // 1. Project definition
    const projectDef = {
        "$type": "fpb:Project",
        "name": projectInfo.getAttribute('name') || 'Imported XML Project',
        "targetNamespace": projectInfo.getAttribute('targetNamespace') || 'http://www.vdivde.de/3682',
        "entryPoint": entryPoint
    };
    jsonData.push(projectDef);
    
    // 2. Convert each process
    const processElements = xmlDoc.querySelectorAll('process');
    processElements.forEach(processEl => {
        try {
            const processData = this.convertProcessToJSON(processEl);
            if (processData) {
                jsonData.push(processData);
            }
        } catch (error) {
            this._showError(
                'Process parsing error',
                `Error parsing process "${processEl.getAttribute('id')}" : ${error.message}`
            );
        }
    });
    
    return jsonData;
};

XMLImporter.prototype.convertProcessToJSON = function(processEl) {
    const processId = processEl.getAttribute('id');
    if (!processId) {
        throw new Error('Process element is missing required id attribute');
    }
    
    // Initialize process data structure
    const processData = {
        process: {
            "$type": "fpb:Process",
            "id": processId,
            "elementsContainer": [],
            "isDecomposedProcessOperator": null,
            "consistsOfStates": [],
            "consistsOfSystemLimit": null,
            "consistsOfProcesses": [],
            "consistsOfProcessOperator": []
        },
        elementDataInformation: [],
        elementVisualInformation: []
    };
    
    // First, collect all element IDs that will be in the process
    const allElementIds = [];
    
    // Parse system limit
    const systemLimitEl = processEl.querySelector('systemLimit');
    let systemLimitData = null;
    if (systemLimitEl) {
        const systemLimit = this.parseSystemLimitToJSON(systemLimitEl, processId);
        systemLimitData = systemLimit.data;
        processData.elementDataInformation.push(systemLimit.data);
        processData.elementVisualInformation.push(systemLimit.visual);
        processData.process.consistsOfSystemLimit = systemLimit.data.id;
        processData.process.elementsContainer.push(systemLimit.data.id);
    }
    
    // Parse states
    const statesEl = processEl.querySelector('states');
    if (statesEl) {
        statesEl.querySelectorAll('state').forEach(stateEl => {
            const state = this.parseStateToJSON(stateEl);
            processData.elementDataInformation.push(state.data);
            processData.elementVisualInformation.push(state.visual);
            processData.process.consistsOfStates.push(state.data.id);
            processData.process.elementsContainer.push(state.data.id);
            allElementIds.push(state.data.id);
        });
    }
    
    // Parse process operators
    const processOperatorsEl = processEl.querySelector('processOperators');
    if (processOperatorsEl) {
        processOperatorsEl.querySelectorAll('processOperator').forEach(poEl => {
            const processOperator = this.parseProcessOperatorToJSON(poEl);
            processData.elementDataInformation.push(processOperator.data);
            processData.elementVisualInformation.push(processOperator.visual);
            processData.process.consistsOfProcessOperator.push(processOperator.data.id);
            processData.process.elementsContainer.push(processOperator.data.id);
            allElementIds.push(processOperator.data.id);
        });
    }
    
    // Parse technical resources
    const technicalResourcesEl = processEl.querySelector('technicalResources');
    if (technicalResourcesEl) {
        technicalResourcesEl.querySelectorAll('technicalResource').forEach(trEl => {
            const technicalResource = this.parseTechnicalResourceToJSON(trEl);
            processData.elementDataInformation.push(technicalResource.data);
            processData.elementVisualInformation.push(technicalResource.visual);
            processData.process.elementsContainer.push(technicalResource.data.id);
            allElementIds.push(technicalResource.data.id);
        });
    }
    
    // Parse flows from flowContainer
    const flowContainerEl = processEl.querySelector('flowContainer');
    if (flowContainerEl) {
        flowContainerEl.querySelectorAll('flow').forEach(flowEl => {
            const flow = this.parseFlowToJSON(flowEl);
            if (flow) {
                processData.elementDataInformation.push(flow.data);
                processData.elementVisualInformation.push(flow.visual);
                processData.process.elementsContainer.push(flow.data.id);
                allElementIds.push(flow.data.id);
            }
        });
    }
    
    // Update SystemLimit's elementsContainer with all collected element IDs
    if (systemLimitData) {
        systemLimitData.elementsContainer = [...allElementIds];
    }
    
    // Connect flows to their source and target elements
    this.connectFlowReferences(processData);
    
    return processData;
};

XMLImporter.prototype.parseSystemLimitToJSON = function(systemLimitEl, processId) {
    const systemLimitId = systemLimitEl.getAttribute('id') || `${processId}_sl`;
    
    return {
        data: {
            "$type": "fpb:SystemLimit",
            "id": systemLimitId,
            "elementsContainer": [] // Will be populated later
        },
        visual: {
            "id": systemLimitId,
            "width": 650,
            "height": 700,
            "type": "fpb:SystemLimit",
            "x": 50,
            "y": 50
        }
    };
};

XMLImporter.prototype.parseStateToJSON = function(stateEl) {
    const identification = this.parseIdentificationToJSON(stateEl.querySelector('identification'));
    const characteristics = this.parseCharacteristicsToJSON(stateEl.querySelector('characteristics'));
    
    const stateType = stateEl.getAttribute('stateType');
    let fpbType;
    
    switch (stateType) {
        case 'product':
            fpbType = 'fpb:Product';
            break;
        case 'energy':
            fpbType = 'fpb:Energy';
            break;
        case 'information':
            fpbType = 'fpb:Information';
            break;
        default:
            throw new Error(`Unknown state type: ${stateType}`);
    }
    
    return {
        data: {
            "$type": fpbType,
            "id": identification.uniqueIdent,
            "identification": identification,
            "characteristics": characteristics,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.uniqueIdent
        },
        visual: {
            "id": identification.uniqueIdent,
            "width": 50,
            "height": 50,
            "type": fpbType,
            "x": 100 + Math.random() * 400,
            "y": 100 + Math.random() * 300
        }
    };
};

XMLImporter.prototype.parseProcessOperatorToJSON = function(poEl) {
    const identification = this.parseIdentificationToJSON(poEl.querySelector('identification'));
    const characteristics = this.parseCharacteristicsToJSON(poEl.querySelector('characteristics'));
    
    return {
        data: {
            "$type": "fpb:ProcessOperator",
            "id": identification.uniqueIdent,
            "identification": identification,
            "characteristics": characteristics,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.uniqueIdent
        },
        visual: {
            "id": identification.uniqueIdent,
            "width": 150,
            "height": 80,
            "type": "fpb:ProcessOperator",
            "x": 100 + Math.random() * 400,
            "y": 100 + Math.random() * 300
        }
    };
};

XMLImporter.prototype.parseTechnicalResourceToJSON = function(trEl) {
    const identification = this.parseIdentificationToJSON(trEl.querySelector('identification'));
    const characteristics = this.parseCharacteristicsToJSON(trEl.querySelector('characteristics'));
    
    return {
        data: {
            "$type": "fpb:TechnicalResource",
            "id": identification.uniqueIdent,
            "identification": identification,
            "characteristics": characteristics,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.uniqueIdent
        },
        visual: {
            "id": identification.uniqueIdent,
            "width": 120,
            "height": 80,
            "type": "fpb:TechnicalResource",
            "x": 100 + Math.random() * 400,
            "y": 100 + Math.random() * 300
        }
    };
};

XMLImporter.prototype.parseFlowToJSON = function(flowEl) {
    const flowId = flowEl.getAttribute('id');
    const flowType = flowEl.getAttribute('flowType') || 'flow';
    
    // Get source and target from attributes (if provided)
    const sourceRef = flowEl.getAttribute('sourceRef');
    const targetRef = flowEl.getAttribute('targetRef');
    
    let fpbFlowType;
    switch (flowType) {
        case 'flow':
            fpbFlowType = 'fpb:Flow';
            break;
        case 'alternativeFlow':
            fpbFlowType = 'fpb:AlternativeFlow';
            break;
        case 'parallelFlow':
            fpbFlowType = 'fpb:ParallelFlow';
            break;
        case 'usage':
            fpbFlowType = 'fpb:Usage';
            break;
        default:
            fpbFlowType = 'fpb:Flow';
    }
    
    const flowData = {
        data: {
            "$type": fpbFlowType,
            "id": flowId,
            "inTandemWith": []
        },
        visual: {
            "id": flowId,
            "type": fpbFlowType,
            "waypoints": [
                { "x": 100, "y": 100 },
                { "x": 200, "y": 200 }
            ]
        }
    };
    
    // Add source and target if they exist
    if (sourceRef) {
        flowData.data.sourceRef = sourceRef;
    }
    if (targetRef) {
        flowData.data.targetRef = targetRef;
    }
    
    return flowData;
};

XMLImporter.prototype.parseIdentificationToJSON = function(identEl) {
    if (!identEl) {
        throw new Error('Missing identification element');
    }
    
    return {
        "$type": "fpb:Identification",
        "uniqueIdent": identEl.getAttribute('uniqueIdent') || 'unnamed',
        "longName": identEl.getAttribute('longName') || '',
        "shortName": identEl.getAttribute('shortName') || '',
        "versionNumber": identEl.getAttribute('versionNumber') || '',
        "revisionNumber": identEl.getAttribute('revisionNumber') || ''
    };
};

XMLImporter.prototype.parseCharacteristicsToJSON = function(characteristicsEl) {
    const characteristics = [];
    
    if (!characteristicsEl) {
        return characteristics;
    }
    
    characteristicsEl.querySelectorAll('characteristic').forEach(charEl => {
        const identification = this.parseIdentificationToJSON(charEl.querySelector('identification'));
        
        const descriptiveEl = charEl.querySelector('descriptiveElement');
        const relationalEl = charEl.querySelector('relationalElement');
        
        const characteristic = {
            "$type": "fpbch:Characteristics",
            "category": identification,
            "descriptiveElement": {
                "$type": "fpbch:DescriptiveElement",
                "valueDeterminationProcess": descriptiveEl?.getAttribute('valueDeterminationProcess') || '',
                "representivity": descriptiveEl?.getAttribute('representivity') || '',
                "setpointValue": {
                    "$type": "fpbch:ValueWithUnit",
                    "value": parseFloat(descriptiveEl?.getAttribute('setpointValue')) || 0.0,
                    "unit": ""
                },
                "validityLimits": [{
                    "$type": "fpbch:ValidityLimits",
                    "limitType": "",
                    "from": 0.0,
                    "to": 0.0
                }],
                "actualValues": {
                    "$type": "fpbch:ValueWithUnit",
                    "value": parseFloat(descriptiveEl?.getAttribute('actualValues')) || 0.0,
                    "unit": ""
                }
            },
            "relationalElement": {
                "$type": "fpbch:RelationalElement",
                "view": relationalEl?.getAttribute('view') || '',
                "model": relationalEl?.getAttribute('model') || '',
                "regulationsForRelationalGeneration": relationalEl?.getAttribute('regulationsForRelationalGeneration') || ''
            }
        };
        
        characteristics.push(characteristic);
    });
    
    return characteristics;
};

XMLImporter.prototype.connectFlowReferences = function(processData) {
    // Create a map of element ID to element for quick lookup
    const elementMap = new Map();
    processData.elementDataInformation.forEach(element => {
        elementMap.set(element.id, element);
    });
    
    // Find all flow elements and connect them to their sources and targets
    const flows = processData.elementDataInformation.filter(el => 
        el.$type === 'fpb:Flow' || 
        el.$type === 'fpb:AlternativeFlow' || 
        el.$type === 'fpb:ParallelFlow' || 
        el.$type === 'fpb:Usage'
    );
    
    flows.forEach(flow => {
        // Connect source element
        if (flow.sourceRef && typeof flow.sourceRef === 'string') {
            const sourceElement = elementMap.get(flow.sourceRef);
            if (sourceElement && sourceElement.outgoing) {
                sourceElement.outgoing.push(flow.id);
            }
        }
        
        // Connect target element
        if (flow.targetRef && typeof flow.targetRef === 'string') {
            const targetElement = elementMap.get(flow.targetRef);
            if (targetElement && targetElement.incoming) {
                targetElement.incoming.push(flow.id);
            }
        }
    });
};