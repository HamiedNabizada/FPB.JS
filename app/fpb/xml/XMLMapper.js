/**
 * VDI/VDE 3682 Enhanced Bidirectional XML Mapper - Browser Version
 * Based on the working enhanced-bidirectional-mapper.js
 * Preserves original JSON structure for perfect round-trip conversion
 */

class XMLMapper {
    // Constants
    static DEFAULT_WAYPOINTS = [
        { "original": { "x": 100, "y": 100 }, "x": 100, "y": 100 },
        { "original": { "x": 200, "y": 200 }, "x": 200, "y": 200 }
    ];

    static UUID_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

    constructor() {
        this.stateTypeMapping = {
            'fpb:Product': 'product',
            'fpb:Energy': 'energy',
            'fpb:Information': 'information'
        };
        this.reverseStateTypeMapping = {
            'product': 'fpb:Product',
            'energy': 'fpb:Energy',
            'information': 'fpb:Information'
        };

        // Flow type mappings
        this.flowTypeMapping = {
            'fpb:Flow': 'flow',
            'fpb:AlternativeFlow': 'alternativeFlow',
            'fpb:ParallelFlow': 'parallelFlow',
            'fpb:Usage': 'usage'
        };

        this.reverseFlowTypeMapping = {};
        Object.keys(this.flowTypeMapping).forEach(key => {
            this.reverseFlowTypeMapping[this.flowTypeMapping[key]] = key;
        });

        // Store original JSON data for round-trip preservation
        this.originalJsonData = null;
    }

    /**
     * Convert JSON to XML while preserving original data
     */
    async convertToXML(jsonData) {
        try {

            // Step 1: Convert ModdleElements to proper JSON format (like normal JSON export)
            const properJsonData = this._convertModdleElementsToProperJSON(jsonData);

            // Store original data for round-trip
            this.originalJsonData = JSON.parse(JSON.stringify(properJsonData));

            // Use schema-compliant conversion
            const xmlString = this._convertJSONtoXML(properJsonData);

            return xmlString;
        } catch (error) {
            console.error('❌ XMLMapper: XML conversion failed:', error);
            throw error;
        }
    }

    /**
     * Convert XML back to original JSON structure
     */
    async convertFromXML(xmlString) {
        try {

            if (!this.originalJsonData) {
                return this._convertXMLtoJSON(xmlString);
            }

            // Parse XML to validate it's correct
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            const parserError = xmlDoc.getElementsByTagName("parsererror");
            if (parserError.length > 0) {
                throw new Error('Invalid XML: ' + parserError[0].textContent);
            }

            // Extract visual information from XML to update original data
            const visualInformation = this._extractAllVisualInformation(xmlDoc);

            // Update visual information in original JSON
            const updatedJsonData = this._updateVisualInformation(this.originalJsonData, visualInformation);

            // Clean up temporary fields added during processing
            this._cleanupTemporaryFields(updatedJsonData);


            return updatedJsonData;
        } catch (error) {
            console.error('❌ XMLMapper: JSON conversion failed:', error);
            throw error;
        }
    }

    /**
     * Extract all visual information from XML
     */
    _extractAllVisualInformation(xmlDoc) {
        const visualInfo = [];

        // Find all elements with visual attributes
        const elementsWithVisual = ['systemLimit', 'state', 'processOperator', 'technicalResource', 'flow'];

        elementsWithVisual.forEach(elementType => {
            const elements = xmlDoc.getElementsByTagName(elementType);
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const visual = this._extractVisualAttributes(element);
                if (visual && element.getAttribute('id')) {
                    visual.id = element.getAttribute('id');
                    visual.elementType = elementType;
                    visualInfo.push(visual);
                }
            }
        });

        return visualInfo;
    }

    /**
     * Parse a visual attribute value and set it on the visual object
     * @param {string} value - The attribute value to parse
     * @param {Object} visual - The visual object to update
     * @param {string} propertyName - The property name to set
     * @returns {boolean} True if visual data was set
     */
    _parseVisualAttribute(value, visual, propertyName) {
        if (value !== null && value !== '') {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
                visual[propertyName] = parsed;
                return true;
            }
        }
        return false;
    }

    /**
     * Extract visual attributes from XML element
     */
    _extractVisualAttributes(xmlElement) {
        const visual = {};
        let hasVisualData = false;

        const x = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'x');
        const y = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'y');
        const width = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'width');
        const height = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'height');

        const visible = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'visible');
        const collapsed = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'collapsed');
        const waypoints = xmlElement.getAttributeNS('http://www.fpbjs.net/visual', 'waypoints');

        // Parse numeric visual attributes
        hasVisualData = this._parseVisualAttribute(x, visual, 'x') || hasVisualData;
        hasVisualData = this._parseVisualAttribute(y, visual, 'y') || hasVisualData;
        hasVisualData = this._parseVisualAttribute(width, visual, 'width') || hasVisualData;
        hasVisualData = this._parseVisualAttribute(height, visual, 'height') || hasVisualData;
        if (visible !== null && visible !== '') { visual.visible = visible === 'true'; hasVisualData = true; }
        if (collapsed !== null && collapsed !== '') { visual.collapsed = collapsed === 'true'; hasVisualData = true; }
        if (waypoints !== null && waypoints !== '') {
            // Deserialize waypoints from comma-separated coordinates or JSON string
            try {
                // First try to parse as JSON (for backward compatibility)
                visual.waypoints = JSON.parse(waypoints);
            } catch (e) {
                // If not JSON, try to parse as comma-separated coordinate pairs
                if (waypoints.includes(',')) {
                    const coordinatePairs = waypoints.trim().split(/\s+/);
                    const parsedWaypoints = coordinatePairs.map(pair => {
                        const [x, y] = pair.split(',').map(coord => parseFloat(coord));
                        return (!isNaN(x) && !isNaN(y)) ? { x, y } : null;
                    }).filter(point => point !== null);

                    if (parsedWaypoints.length > 0) {
                        visual.waypoints = parsedWaypoints;
                    }
                } else {
                    // Fallback to string if neither format works
                    visual.waypoints = waypoints;
                }
            }
            hasVisualData = true;
        }

        return hasVisualData ? visual : null;
    }

    /**
     * Update visual information in original JSON data
     */
    _updateVisualInformation(jsonData, visualInformation) {
        const updatedData = JSON.parse(JSON.stringify(jsonData));

        // Create visual lookup by ID
        const visualLookup = {};
        visualInformation.forEach(visual => {
            visualLookup[visual.id] = visual;
        });

        // Update elementVisualInformation arrays
        this._updateVisualInformationRecursive(updatedData, visualLookup);

        return updatedData;
    }

    /**
     * Recursively update visual information in JSON structure
     */
    _updateVisualInformationRecursive(obj, visualLookup) {
        if (Array.isArray(obj)) {
            obj.forEach(item => this._updateVisualInformationRecursive(item, visualLookup));
        } else if (typeof obj === 'object' && obj !== null) {
            // Update elementVisualInformation arrays
            if (obj.elementVisualInformation && Array.isArray(obj.elementVisualInformation)) {
                obj.elementVisualInformation.forEach(visualItem => {
                    const updatedVisual = visualLookup[visualItem.id];
                    if (updatedVisual) {
                        // Update existing visual information with new values, but exclude temporary fields
                        Object.keys(updatedVisual).forEach(key => {
                            if (key !== 'elementType') { // Skip temporary fields
                                visualItem[key] = updatedVisual[key];
                            }
                        });
                    }
                });
            }

            // Continue recursively
            Object.values(obj).forEach(value =>
                this._updateVisualInformationRecursive(value, visualLookup)
            );
        }
    }


    /**
     * Convert ModdleElements to proper JSON format (like normal JSON export)
     * Uses the same replacer logic as DownloadModal.js
     */
    _convertModdleElementsToProperJSON(data) {


        // Helper function to extract ID from various object structures
        const extractId = (item) => {
            if (typeof item === 'string') return item;
            if (!item) return item;
            // Check for different ID properties
            return item.id || item.uniqueIdent || item.$id || item;
        };

        const replacer = (name, val) => {
            switch (name) {
                case 'entryPoint':
                    // Single reference - extract ID
                    return extractId(val);

                case 'elementsContainer':
                case 'consistsOfStates':
                case 'consistsOfProcessOperator':
                case 'consistsOfProcesses':
                case 'inTandemWith':
                case 'isAssignedTo':
                case 'incoming':
                case 'outgoing':
                    // Array references - extract IDs from each element
                    if (Array.isArray(val)) {
                        return val.map(el => extractId(el));
                    }
                    return extractId(val);

                case 'sourceRef':
                case 'targetRef':
                case 'decomposedView':
                case 'parent':
                case 'consistsOfSystemLimit':
                    // Single references - extract ID
                    return extractId(val);

                case 'isDecomposedProcessOperator':
                    if (val === null || val === undefined) {
                        return null;
                    }
                    return extractId(val);

                case 'di':
                case 'children':
                case 'labels':
                case 'ProjectAssignment':
                case 'TemporaryFlowHint':
                    return undefined;

                default:
                    return val;
            }
        };

        try {
            const jsonString = JSON.stringify(data, replacer, 4);
            const result = JSON.parse(jsonString);



            return result;

        } catch (error) {
            console.error('❌ _convertModdleElementsToProperJSON: Conversion failed:', error);
            throw error;
        }
    }

    /**
     * Clean up temporary fields added during XML processing
     */
    _cleanupTemporaryFields(jsonData) {
        this._cleanupTemporaryFieldsRecursive(jsonData);
    }

    /**
     * Recursively clean up temporary fields
     */
    _cleanupTemporaryFieldsRecursive(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(item => this._cleanupTemporaryFieldsRecursive(item));
        } else if (typeof obj === 'object' && obj !== null) {
            // Remove temporary fields from elementVisualInformation
            if (obj.elementVisualInformation && Array.isArray(obj.elementVisualInformation)) {
                obj.elementVisualInformation.forEach(visualItem => {
                    delete visualItem.elementType;
                });
            }

            // Continue recursively
            Object.values(obj).forEach(value =>
                this._cleanupTemporaryFieldsRecursive(value)
            );
        }
    }

    /**
     * Convert VDI/VDE 3682 XML to FPB.js JSON (embedded working logic)
     */
    _convertXMLtoJSON(xmlString) {

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            // Check for parsing errors
            const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
            if (parserError) {
                throw new Error(`XML parsing error: ${parserError.textContent}`);
            }

            const root = xmlDoc.documentElement;
            const jsonData = [];

            // Extract project information
            const projectInfo = root.getElementsByTagName('projectInformation')[0];
            if (projectInfo) {
                const project = {
                    "$type": "fpb:Project",
                    "name": projectInfo.getAttribute('name') || 'Imported Project',
                    "targetNamespace": projectInfo.getAttribute('targetNamespace') || 'http://www.vdivde.de/3682',
                    "entryPoint": projectInfo.getAttribute('entryPoint') || 'main-process'
                };
                jsonData.push(project);
            }

            // Process all <process> elements using correct JSON wrapper structure
            const processes = root.getElementsByTagName('process');

            for (let i = 0; i < processes.length; i++) {
                const processElement = processes[i];
                const processEntry = this._convertProcessFromXML(processElement);
                if (processEntry) {
                    jsonData.push(processEntry);
                }
            }

            // Reconstruct decomposed view relationships first (creates consistsOfProcesses)
            this._reconstructDecomposedViewRelationships(jsonData);
            // Then reconstruct parent relationships (uses consistsOfProcesses)
            this._reconstructParentRelationships(jsonData, projectInfo);


            return jsonData;

        } catch (error) {
            console.error('❌ _convertXMLtoJSON: Error converting XML to JSON:', error);
            throw error;
        }
    }

    /**
     * Convert XML process element to JSON process entry
     */
    _convertProcessFromXML(processElement) {
        const processId = processElement.getAttribute('id');

        // Create process wrapper
        const processEntry = {
            "process": {
                "$type": "fpb:Process",
                "id": processId,
                "elementsContainer": [],
                "isDecomposedProcessOperator": null,
                "consistsOfStates": [],
                "consistsOfSystemLimit": null,
                "consistsOfProcesses": [],
                "consistsOfProcessOperator": [],
                "parent": null // Will be set later in _reconstructParentStructure
            },
            "elementDataInformation": [],
            "elementVisualInformation": []
        };

        // Extract visual information for process
        const processVisual = this._extractVisualAttributes(processElement);
        if (processVisual) {
            processVisual.id = processId;
            processVisual.type = 'fpb:Process';
            processEntry.elementVisualInformation.push(processVisual);
        }

        // Extract systemLimit
        const systemLimit = processElement.getElementsByTagName('systemLimit')[0];
        let systemLimitData = null;
        if (systemLimit) {
            const systemLimitId = systemLimit.getAttribute('id');
            processEntry.process.consistsOfSystemLimit = systemLimitId;
            processEntry.process.elementsContainer.push(systemLimitId);

            // Add systemLimit visual info
            const systemLimitVisual = this._extractVisualAttributes(systemLimit);
            if (systemLimitVisual) {
                systemLimitVisual.id = systemLimitId;
                systemLimitVisual.type = 'fpb:SystemLimit';
                processEntry.elementVisualInformation.push(systemLimitVisual);
            }

            // Create systemLimit data - will be populated later
            // Extract SystemLimit name from XML attribute, allow empty string
            const systemLimitName = systemLimit.getAttribute('name') || '';

            systemLimitData = {
                "$type": "fpb:SystemLimit",
                "id": systemLimitId,
                "name": systemLimitName,
                "elementsContainer": []
            };
            processEntry.elementDataInformation.push(systemLimitData);

            // Add SystemLimit visual information
            if (systemLimitVisual) {
                processEntry.elementVisualInformation.push(systemLimitVisual);
            }
        }

        // Extract states (go into SystemLimit)
        const statesContainer = processElement.getElementsByTagName('states')[0];
        if (statesContainer && systemLimitData) {
            const states = statesContainer.getElementsByTagName('state');
            for (let i = 0; i < states.length; i++) {
                const stateElement = states[i];
                const stateData = this._convertStateFromXML(stateElement);
                if (stateData) {
                    processEntry.elementDataInformation.push(stateData.data);
                    if (stateData.visual) {
                        processEntry.elementVisualInformation.push(stateData.visual);
                    }
                    processEntry.process.consistsOfStates.push(stateData.data.id);
                    // States go into SystemLimit.elementsContainer
                    systemLimitData.elementsContainer.push(stateData.data.id);
                }
            }
        }

        // Extract processOperators (go into SystemLimit)
        const processOperatorsContainer = processElement.getElementsByTagName('processOperators')[0];
        if (processOperatorsContainer && systemLimitData) {
            const processOperators = processOperatorsContainer.getElementsByTagName('processOperator');
            for (let i = 0; i < processOperators.length; i++) {
                const processOpElement = processOperators[i];
                const processOpData = this._convertProcessOperatorFromXML(processOpElement);
                if (processOpData) {
                    processEntry.elementDataInformation.push(processOpData.data);
                    if (processOpData.visual) {
                        processEntry.elementVisualInformation.push(processOpData.visual);
                    }
                    processEntry.process.consistsOfProcessOperator.push(processOpData.data.id);
                    // ProcessOperators go into SystemLimit.elementsContainer
                    systemLimitData.elementsContainer.push(processOpData.data.id);
                }
            }
        }

        // Extract technicalResources (go into Process)
        const technicalResourcesContainer = processElement.getElementsByTagName('technicalResources')[0];
        if (technicalResourcesContainer) {
            const technicalResources = technicalResourcesContainer.getElementsByTagName('technicalResource');
            for (let i = 0; i < technicalResources.length; i++) {
                const techResElement = technicalResources[i];
                const techResData = this._convertTechnicalResourceFromXML(techResElement);
                if (techResData) {
                    processEntry.elementDataInformation.push(techResData.data);
                    if (techResData.visual) {
                        processEntry.elementVisualInformation.push(techResData.visual);
                    }
                    // TechnicalResources go into Process.elementsContainer
                    processEntry.process.elementsContainer.push(techResData.data.id);
                }
            }
        }

        // Extract flows from states and processOperators <flows> elements
        const extractedFlows = this._extractFlowsFromStatesAndProcessOperators(processElement, processEntry, systemLimitData);

        // Extract usage connections from processOperators and technicalResources
        this._extractUsageConnections(processElement, processEntry);

        // Note: flowContainer flows are visual-only (waypoints) and don't define logical connections
        // Logical flows are already extracted from states/processOperators via entry/exit elements

        return processEntry;
    }

    /**
     * Extract flows from states and processOperators <flows> elements, filtered by process
     */
    _extractFlowsFromStatesAndProcessOperators(processElement, processEntry, systemLimitData) {
        const extractedFlows = new Map(); // Prevent duplicates

        // Extract flows from states in THIS process only
        const statesContainer = processElement.getElementsByTagName('states')[0];
        if (statesContainer) {
            const states = statesContainer.getElementsByTagName('state');
            for (let i = 0; i < states.length; i++) {
                this._extractFlowsFromElement(states[i], extractedFlows, processElement);
            }
        }

        // Extract flows from processOperators in THIS process only
        const processOperatorsContainer = processElement.getElementsByTagName('processOperators')[0];
        if (processOperatorsContainer) {
            const processOperators = processOperatorsContainer.getElementsByTagName('processOperator');
            for (let i = 0; i < processOperators.length; i++) {
                this._extractFlowsFromElement(processOperators[i], extractedFlows, processElement);
            }
        }

        // Convert extracted flows to JSON and add to process
        // Only include flows where BOTH endpoints are defined in THIS process (not just exist as shared states)
        extractedFlows.forEach((flowInfo, flowKey) => {
            // Check if both source and target are DEFINED in this process (not just exist)
            const sourceDefinedHere = this._isElementDefinedInProcess(flowInfo.sourceRef, processElement);
            const targetDefinedHere = this._isElementDefinedInProcess(flowInfo.targetRef, processElement);

            if (sourceDefinedHere && targetDefinedHere) {
                const flowId = flowInfo.flowId || this._generateId(); // Use XML flow ID if available
                const flowType = flowInfo.flowType || 'fpb:Flow'; // Use the determined flow type

                const flowData = {
                    "$type": flowType,
                    "id": flowId,
                    "sourceRef": flowInfo.sourceRef,
                    "targetRef": flowInfo.targetRef
                };

                // Create minimal visual information required by JSONImporter
                const flowVisual = {
                    "id": flowId,
                    "type": flowType,
                    "waypoints": XMLMapper.DEFAULT_WAYPOINTS  // Minimal waypoints - layout engine will recalculate
                };

                processEntry.elementDataInformation.push(flowData);
                processEntry.elementVisualInformation.push(flowVisual);

                if (systemLimitData) {
                    systemLimitData.elementsContainer.push(flowId);
                }

            } else {
            }
        });

        return extractedFlows;
    }


    /**
     * Extract flows from a single element (state or processOperator)
     */
    _extractFlowsFromElement(element, extractedFlows, processElement) {
        const elementId = element.querySelector('identification')?.getAttribute('uniqueIdent');
        const flowsContainer = element.getElementsByTagName('flows')[0];
        if (flowsContainer) {
            const flows = flowsContainer.getElementsByTagName('flow');
            for (let i = 0; i < flows.length; i++) {
                const flowElement = flows[i];

                const entryElement = flowElement.getElementsByTagName('entry')[0];
                const exitElement = flowElement.getElementsByTagName('exit')[0];
                const flowId = flowElement.getAttribute('id');

                if (entryElement && exitElement) {
                    const sourceRef = entryElement.getAttribute('id');
                    const targetRef = exitElement.getAttribute('id');

                    // Determine flow type from FlowContainer using flow ID
                    let flowType = 'fpb:Flow'; // Default
                    if (flowId) {
                        const flowContainerFlow = this._findFlowInContainers(processElement, flowId);
                        if (flowContainerFlow) {
                            const containerFlowType = flowContainerFlow.getAttribute('flowType');
                            flowType = this.reverseFlowTypeMapping[containerFlowType] || 'fpb:Flow';
                        }
                    }


                    if (sourceRef && targetRef) {
                        const flowKey = `${sourceRef}->${targetRef}`;
                        extractedFlows.set(flowKey, { sourceRef, targetRef, flowType, flowId });
                    }
                }
            }
        }
    }

    /**
     * Find flow element in flowContainer by ID
     */
    _findFlowInContainers(processElement, flowId) {
        const flowContainer = processElement.getElementsByTagName('flowContainer')[0];
        if (!flowContainer) return null;

        const flows = flowContainer.getElementsByTagName('flow');
        for (let i = 0; i < flows.length; i++) {
            const flow = flows[i];
            if (flow.getAttribute('id') === flowId) {
                return flow;
            }
        }
        return null;
    }

    /**
     * Extract flows from flowContainer (AlternativeFlow, ParallelFlow, regular Flows)
     */
    _extractFlowsFromFlowContainer(processElement, processEntry, systemLimitData) {
        const flowContainer = processElement.getElementsByTagName('flowContainer')[0];
        if (!flowContainer) return;

        const flows = flowContainer.getElementsByTagName('flow');

        for (let i = 0; i < flows.length; i++) {
            const flowElement = flows[i];
            const flowId = flowElement.getAttribute('id');
            const flowType = flowElement.getAttribute('flowType') || 'flow';

            // Skip usage flows - they're handled by _extractUsageConnections
            if (flowType === 'usage') continue;

            // Extract entry and exit elements like normal flows
            const entryElement = flowElement.getElementsByTagName('entry')[0];
            const exitElement = flowElement.getElementsByTagName('exit')[0];

            if (!entryElement || !exitElement) {
                continue;
            }

            const sourceRef = entryElement.getAttribute('id');
            const targetRef = exitElement.getAttribute('id');

            if (!sourceRef || !targetRef) {
                continue;
            }

            // Determine JSON type
            const jsonType = this.reverseFlowTypeMapping[flowType] || 'fpb:Flow';


            const flowData = {
                "$type": jsonType,
                "id": flowId,
                "sourceRef": sourceRef,
                "targetRef": targetRef
            };

            // Create minimal visual information required by JSONImporter
            const flowVisual = {
                "id": flowId,
                "type": jsonType,
                "waypoints": [
                    { "original": { "x": 100, "y": 100 }, "x": 100, "y": 100 },
                    { "original": { "x": 200, "y": 200 }, "x": 200, "y": 200 }
                ]  // Minimal waypoints - layout engine will recalculate
            };

            processEntry.elementDataInformation.push(flowData);
            processEntry.elementVisualInformation.push(flowVisual);

            if (systemLimitData) {
                systemLimitData.elementsContainer.push(flowId);
            }

            }
    }

    /**
     * Extract usage connections from state assignments
     */
    _extractUsageConnections(processElement, processEntry) {
        // Collect all unique usage IDs from flowContainer with flowType="usage"
        const flowContainer = processElement.getElementsByTagName('flowContainer')[0];
        if (!flowContainer) return;

        const processedUsages = new Set();
        const flows = flowContainer.getElementsByTagName('flow');

        for (let i = 0; i < flows.length; i++) {
            const flowElement = flows[i];
            const flowId = flowElement.getAttribute('id');
            const flowType = flowElement.getAttribute('flowType');

            if (flowType === 'usage' && !processedUsages.has(flowId)) {
                processedUsages.add(flowId);
                this._extractUsageConnectionFromFlowContainer(processElement, processEntry, flowId, flowElement);
            }
        }
    }

    _extractUsageConnectionFromFlowContainer(processElement, processEntry, usageId, flowElement) {
        // Find the other element that references this usage ID
        const { processOperatorId, technicalResourceId } = this._findUsageEndpoints(processElement, usageId);

        let sourceRef = null;
        let targetRef = null;

        // Usage connections are typically from ProcessOperator to TechnicalResource
        if (processOperatorId && technicalResourceId) {
            sourceRef = processOperatorId;
            targetRef = technicalResourceId;
        } else {
            console.warn(`⚠️ Could not determine endpoints for usage ${usageId}`);
            return;
        }

        // Convert flow element to usage connection
        const usageData = {
            "$type": "fpb:Usage",
            "id": usageId,
            "sourceRef": sourceRef,
            "targetRef": targetRef
        };

        // Extract visual attributes
        const visual = this._extractVisualAttributes(flowElement);
        if (visual) {
            visual.id = usageId;
            visual.type = 'fpb:Usage';
        }

        processEntry.elementDataInformation.push(usageData);
        if (visual) {
            processEntry.elementVisualInformation.push(visual);
        }

        // Usage connections go into Process.elementsContainer
        processEntry.process.elementsContainer.push(usageId);

    }

    _findUsageEndpoints(processElement, usageId) {
        let processOperatorId = null;
        let technicalResourceId = null;

        // Find ProcessOperator that references this usage
        const processOperatorsContainer = processElement.getElementsByTagName('processOperators')[0];
        if (processOperatorsContainer) {
            const processOperators = processOperatorsContainer.getElementsByTagName('processOperator');
            for (let i = 0; i < processOperators.length; i++) {
                const processOperatorElement = processOperators[i];
                const usagesContainer = processOperatorElement.getElementsByTagName('usages')[0];
                if (usagesContainer) {
                    const usages = usagesContainer.getElementsByTagName('usage');
                    for (let j = 0; j < usages.length; j++) {
                        if (usages[j].getAttribute('id') === usageId) {
                            processOperatorId = processOperatorElement.querySelector('identification')?.getAttribute('uniqueIdent');
                            break;
                        }
                    }
                }
                if (processOperatorId) break;
            }
        }

        // Find TechnicalResource that references this usage
        const technicalResourcesContainer = processElement.getElementsByTagName('technicalResources')[0];
        if (technicalResourcesContainer) {
            const technicalResources = technicalResourcesContainer.getElementsByTagName('technicalResource');
            for (let i = 0; i < technicalResources.length; i++) {
                const technicalResourceElement = technicalResources[i];
                const usagesContainer = technicalResourceElement.getElementsByTagName('usages')[0];
                if (usagesContainer) {
                    const usages = usagesContainer.getElementsByTagName('usage');
                    for (let j = 0; j < usages.length; j++) {
                        if (usages[j].getAttribute('id') === usageId) {
                            technicalResourceId = technicalResourceElement.querySelector('identification')?.getAttribute('uniqueIdent');
                            break;
                        }
                    }
                }
                if (technicalResourceId) break;
            }
        }

        return { processOperatorId, technicalResourceId };
    }

    /**
     * Convert XML state element to JSON
     */
    _convertStateFromXML(stateElement) {
        const stateType = stateElement.getAttribute('stateType');
        const jsonType = this.reverseStateTypeMapping[stateType] || 'fpb:Product';

        // Extract identification
        const identificationElement = stateElement.getElementsByTagName('identification')[0];
        const identification = this._extractIdentificationFromXML(identificationElement);

        const stateData = {
            "$type": jsonType,
            "id": identification.uniqueIdent,
            "identification": identification,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.longName || identification.uniqueIdent,
            "characteristics": []
        };

        // Extract assignments
        const assignmentsElement = stateElement.getElementsByTagName('assignments')[0];
        if (assignmentsElement) {
            const assigned = assignmentsElement.getElementsByTagName('assigned');
            for (let i = 0; i < assigned.length; i++) {
                const assignedId = assigned[i].getAttribute('id');
                if (assignedId) {
                    stateData.isAssignedTo.push(assignedId);
                }
            }
        }

        // Extract flows (convert entry/exit to incoming/outgoing)
        const flowsElement = stateElement.getElementsByTagName('flows')[0];
        if (flowsElement) {
            const flows = flowsElement.getElementsByTagName('flow');
            for (let i = 0; i < flows.length; i++) {
                const flowElement = flows[i];
                const entries = flowElement.getElementsByTagName('entry');
                const exits = flowElement.getElementsByTagName('exit');

                for (let j = 0; j < entries.length; j++) {
                    const entryId = entries[j].getAttribute('id');
                    if (entryId && !stateData.incoming.includes(entryId)) {
                        stateData.incoming.push(entryId);
                    }
                }

                for (let j = 0; j < exits.length; j++) {
                    const exitId = exits[j].getAttribute('id');
                    if (exitId && !stateData.outgoing.includes(exitId)) {
                        stateData.outgoing.push(exitId);
                    }
                }
            }
        }

        // Extract characteristics
        const characteristicsElement = stateElement.getElementsByTagName('characteristics')[0];
        if (characteristicsElement) {
            stateData.characteristics = this._extractCharacteristicsFromXML(characteristicsElement);
        }

        // Extract visual attributes
        const visual = this._extractVisualAttributes(stateElement);
        if (visual) {
            visual.id = stateData.id;
            visual.type = jsonType;
        }

        return {
            data: stateData,
            visual: visual
        };
    }

    /**
     * Convert XML processOperator element to JSON
     */
    _convertProcessOperatorFromXML(processOpElement) {
        // Extract identification
        const identificationElement = processOpElement.getElementsByTagName('identification')[0];
        const identification = this._extractIdentificationFromXML(identificationElement);

        const processOpData = {
            "$type": "fpb:ProcessOperator",
            "id": identification.uniqueIdent,
            "identification": identification,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.longName || identification.uniqueIdent,
            "characteristics": []
        };

        // Extract assignments, flows, usages (similar to state)
        this._extractCommonElementData(processOpElement, processOpData);

        // Extract visual attributes
        const visual = this._extractVisualAttributes(processOpElement);
        if (visual) {
            visual.id = processOpData.id;
            visual.type = 'fpb:ProcessOperator';
        }

        return {
            data: processOpData,
            visual: visual
        };
    }

    /**
     * Convert XML technicalResource element to JSON
     */
    _convertTechnicalResourceFromXML(techResElement) {
        // Extract identification
        const identificationElement = techResElement.getElementsByTagName('identification')[0];
        const identification = this._extractIdentificationFromXML(identificationElement);

        const techResData = {
            "$type": "fpb:TechnicalResource",
            "id": identification.uniqueIdent,
            "identification": identification,
            "isAssignedTo": [],
            "incoming": [],
            "outgoing": [],
            "name": identification.shortName || identification.longName || identification.uniqueIdent,
            "characteristics": []
        };

        // Extract assignments and usages (similar to processOperator but without flows)
        this._extractCommonElementData(techResElement, techResData);

        // Extract visual attributes
        const visual = this._extractVisualAttributes(techResElement);
        if (visual) {
            visual.id = techResData.id;
            visual.type = 'fpb:TechnicalResource';
        }

        return {
            data: techResData,
            visual: visual
        };
    }

    /**
     * Convert flow from XML flowContainer to JSON
     */
    _convertFlowFromXML(flowElement) {
        const flowId = flowElement.getAttribute('id');
        const flowType = flowElement.getAttribute('flowType') || 'flow';
        const jsonType = this.reverseFlowTypeMapping[flowType] || 'fpb:Flow';

        // Extract sourceRef and targetRef from XML
        const sourceRef = flowElement.getAttribute('sourceRef') || null;
        const targetRef = flowElement.getAttribute('targetRef') || null;


        const flowData = {
            "$type": jsonType,
            "id": flowId,
            "sourceRef": sourceRef,
            "targetRef": targetRef
        };

        // Extract visual attributes
        const visual = this._extractVisualAttributes(flowElement);
        if (visual) {
            visual.id = flowId;
            visual.type = jsonType;
        }

        return {
            data: flowData,
            visual: visual
        };
    }

    /**
     * Extract identification from XML
     */
    _extractIdentificationFromXML(identificationElement) {
        if (!identificationElement) {
            const id = this._generateId();
            return {
                "$type": "fpb:Identification",
                "uniqueIdent": id,
                "longName": '',
                "shortName": '',
                "versionNumber": '',
                "revisionNumber": ''
            };
        }

        const uniqueIdent = identificationElement.getAttribute('uniqueIdent') || this._generateId();
        const longName = identificationElement.getAttribute('longName') || '';
        const shortName = identificationElement.getAttribute('shortName') || '';
        const versionNumber = identificationElement.getAttribute('versionNumber') || '';
        const revisionNumber = identificationElement.getAttribute('revisionNumber') || '';

        return {
            "$type": "fpb:Identification",
            "uniqueIdent": uniqueIdent,
            "longName": longName,
            "shortName": shortName,
            "versionNumber": versionNumber,
            "revisionNumber": revisionNumber
        };
    }

    /**
     * Extract characteristics from XML
     */
    _extractCharacteristicsFromXML(characteristicsElement) {
        const characteristics = [];
        if (!characteristicsElement) return characteristics;

        const characteristicElements = characteristicsElement.getElementsByTagName('characteristic');
        for (let i = 0; i < characteristicElements.length; i++) {
            const charElement = characteristicElements[i];

            const characteristic = {
                "$type": "fpbch:Characteristics",
                "category": {},
                "descriptiveElement": {},
                "relationalElement": {}
            };

            // Extract identification
            const identificationElement = charElement.getElementsByTagName('identification')[0];
            if (identificationElement) {
                characteristic.category = this._extractIdentificationFromXML(identificationElement);
            }

            // Extract descriptiveElement
            const descriptiveElement = charElement.getElementsByTagName('descriptiveElement')[0];
            if (descriptiveElement) {
                characteristic.descriptiveElement = {
                    "$type": "fpbch:DescriptiveElement",
                    "valueDeterminationProcess": descriptiveElement.getAttribute('valueDeterminationProcess') || '',
                    "representivity": descriptiveElement.getAttribute('representivity') || '',
                    "setpointValue": {
                        "$type": "fpbch:ValueWithUnit",
                        "value": descriptiveElement.getAttribute('setpointValue') || '',
                        "unit": descriptiveElement.getAttribute('unit') || ''
                    },
                    "actualValues": null,
                    "validityLimits": []
                };

                // Extract validityLimits if present
                const validityLimitsElements = descriptiveElement.getElementsByTagName('validityLimits');
                for (let j = 0; j < validityLimitsElements.length; j++) {
                    const validityLimit = validityLimitsElements[j];
                    characteristic.descriptiveElement.validityLimits.push({
                        "$type": "fpbch:ValidityLimits",
                        "limitType": validityLimit.getAttribute('limitType') || '',
                        "from": parseFloat(validityLimit.getAttribute('from')) || 0,
                        "to": parseFloat(validityLimit.getAttribute('to')) || 0
                    });
                }
            }

            // Extract relationalElement
            const relationalElement = charElement.getElementsByTagName('relationalElement')[0];
            if (relationalElement) {
                characteristic.relationalElement = {
                    "$type": "fpbch:RelationalElement",
                    "view": relationalElement.getAttribute('view') || '',
                    "model": relationalElement.getAttribute('model') || '',
                    "regulationsForRelationalGeneration": relationalElement.getAttribute('regulationsForRelationalGeneration') || ''
                };
            }

            characteristics.push(characteristic);
        }

        return characteristics;
    }

    /**
     * Extract common element data (assignments, flows, etc.)
     */
    _extractCommonElementData(element, targetData) {
        // Extract assignments
        const assignmentsElement = element.getElementsByTagName('assignments')[0];
        if (assignmentsElement) {
            const assigned = assignmentsElement.getElementsByTagName('assigned');
            for (let i = 0; i < assigned.length; i++) {
                const assignedId = assigned[i].getAttribute('id');
                if (assignedId) {
                    targetData.isAssignedTo.push(assignedId);
                }
            }
        }

        // Extract flows (similar to state conversion)
        const flowsElement = element.getElementsByTagName('flows')[0];
        if (flowsElement) {
            const flows = flowsElement.getElementsByTagName('flow');
            for (let i = 0; i < flows.length; i++) {
                const flowElement = flows[i];
                const entries = flowElement.getElementsByTagName('entry');
                const exits = flowElement.getElementsByTagName('exit');

                for (let j = 0; j < entries.length; j++) {
                    const entryId = entries[j].getAttribute('id');
                    if (entryId && !targetData.incoming.includes(entryId)) {
                        targetData.incoming.push(entryId);
                    }
                }

                for (let j = 0; j < exits.length; j++) {
                    const exitId = exits[j].getAttribute('id');
                    if (exitId && !targetData.outgoing.includes(exitId)) {
                        targetData.outgoing.push(exitId);
                    }
                }
            }
        }

        // Extract characteristics
        const characteristicsElement = element.getElementsByTagName('characteristics')[0];
        if (characteristicsElement) {
            targetData.characteristics = this._extractCharacteristicsFromXML(characteristicsElement);
        }
    }

    /**
     * Reconstruct parent structure based on project entryPoint and process hierarchy
     */
    _reconstructParentStructure(jsonData, projectInfo) {

        // Find project and process entries
        const projectEntry = jsonData.find(item => item.$type === 'fpb:Project');
        const processEntries = jsonData.filter(item => item.process);

        if (!projectEntry || processEntries.length === 0) {
            return;
        }

        const entryPoint = projectInfo.getAttribute('entryPoint');

        // Set parent relationships
        processEntries.forEach(processEntry => {
            const process = processEntry.process;

            if (process.id === entryPoint) {
                // Main process: parent is the full Project object
                process.parent = {
                    "$type": "fpb:Project",
                    "name": projectEntry.name,
                    "targetNamespace": projectEntry.targetNamespace,
                    "entryPoint": projectEntry.entryPoint
                };
            } else {
                // Sub-process: parent is the entryPoint process ID
                process.parent = entryPoint;
            }
        });

    }

    /**
     * Convert a single process XML element to flat JSON objects
     */
    _convertProcessToFlatJSON(processElement, jsonData) {
        const processId = processElement.getAttribute('id');
        if (!processId) return;


        // 1. Create and add Process object
        const processObj = {
            "$type": "fpb:Process",
            "id": processId,
            "elementsContainer": [],
            "isDecomposedProcessOperator": null,
            "consistsOfStates": [],
            "consistsOfSystemLimit": null,
            "consistsOfProcesses": [],
            "parent": null
        };
        jsonData.push(processObj);

        // 2. Extract SystemLimit
        const systemLimitElement = processElement.querySelector('systemLimit');
        let systemLimitObj = null;
        if (systemLimitElement) {
            const systemLimitId = systemLimitElement.getAttribute('id');
            systemLimitObj = {
                "$type": "fpb:SystemLimit",
                "id": systemLimitId,
                "elementsContainer": []
            };

            // Extract SystemLimit name from XML attribute, allow empty string
            const systemLimitName = systemLimitElement.getAttribute('name') || '';
            systemLimitObj.name = systemLimitName;

            jsonData.push(systemLimitObj);
            processObj.consistsOfSystemLimit = systemLimitId;
            processObj.elementsContainer.push(systemLimitId);
        }

        // 3. Extract States (go into SystemLimit)
        const statesContainer = processElement.querySelector('states');
        if (statesContainer && systemLimitObj) {
            const states = statesContainer.querySelectorAll('state');
            states.forEach(stateElement => {
                const stateResult = this._convertStateFromXML(stateElement);
                if (stateResult && stateResult.data) {
                    jsonData.push(stateResult.data);
                    processObj.consistsOfStates.push(stateResult.data.id);
                    systemLimitObj.elementsContainer.push(stateResult.data.id);
                }
            });
        }

        // 4. Extract ProcessOperators (go into SystemLimit)
        const processOperatorsContainer = processElement.querySelector('processOperators');
        if (processOperatorsContainer && systemLimitObj) {
            const processOperators = processOperatorsContainer.querySelectorAll('processOperator');
            processOperators.forEach(processOpElement => {
                const processOpResult = this._convertProcessOperatorFromXML(processOpElement);
                if (processOpResult && processOpResult.data) {
                    jsonData.push(processOpResult.data);
                    processObj.consistsOfProcessOperator = processObj.consistsOfProcessOperator || [];
                    processObj.consistsOfProcessOperator.push(processOpResult.data.id);
                    systemLimitObj.elementsContainer.push(processOpResult.data.id);
                }
            });
        }

        // 5. Extract TechnicalResources (go into Process)
        const technicalResourcesContainer = processElement.querySelector('technicalResources');
        if (technicalResourcesContainer) {
            const technicalResources = technicalResourcesContainer.querySelectorAll('technicalResource');
            technicalResources.forEach(techResElement => {
                const techResResult = this._convertTechnicalResourceFromXML(techResElement);
                if (techResResult && techResResult.data) {
                    jsonData.push(techResResult.data);
                    processObj.elementsContainer.push(techResResult.data.id);
                }
            });
        }

        // 6. Extract Flows
        this._extractFlowsToFlatJSON(processElement, jsonData, systemLimitObj);
    }

    /**
     * Extract flows for flat JSON structure
     */
    _extractFlowsToFlatJSON(processElement, jsonData, systemLimitObj) {
        // Extract flows from flowContainer
        const flowContainer = processElement.querySelector('flowContainer');
        if (flowContainer) {
            const flows = flowContainer.querySelectorAll('flow');
            flows.forEach(flowElement => {
                const flowResult = this._convertFlowFromXML(flowElement);
                if (flowResult && flowResult.data) {
                    jsonData.push(flowResult.data);
                    if (systemLimitObj) {
                        systemLimitObj.elementsContainer.push(flowResult.data.id);
                    }
                }
            });
        }

        // Extract usages from usageContainer
        const usageContainer = processElement.querySelector('usageContainer');
        if (usageContainer) {
            const usages = usageContainer.querySelectorAll('usage');
            usages.forEach(usageElement => {
                const usageResult = this._convertUsageFromXML(usageElement);
                if (usageResult && usageResult.data) {
                    jsonData.push(usageResult.data);
                    if (systemLimitObj) {
                        systemLimitObj.elementsContainer.push(usageResult.data.id);
                    }
                }
            });
        }
    }

    /**
     * Convert usage from XML to JSON
     */
    _convertUsageFromXML(usageElement) {
        const usageId = usageElement.getAttribute('id');
        const sourceRef = usageElement.getAttribute('sourceRef') || null;
        const targetRef = usageElement.getAttribute('targetRef') || null;

        const usageData = {
            "$type": "fpb:Usage",
            "id": usageId,
            "sourceRef": sourceRef,
            "targetRef": targetRef
        };

        return {
            data: usageData,
            visual: null // Usage flows don't have visual representation in current schema
        };
    }

    /**
     * Reconstruct parent relationships between processes and project
     */
    _reconstructParentRelationships(jsonData, projectInfo) {

        if (!projectInfo) return;

        const entryPoint = projectInfo.getAttribute('entryPoint');
        const project = jsonData.find(obj => obj.$type === 'fpb:Project');

        // Find all process entries
        const processEntries = jsonData.filter(obj => obj.process);
        const processMap = new Map();

        // Create lookup map
        processEntries.forEach(entry => {
            processMap.set(entry.process.id, entry.process);
        });

        // First pass: Set main process parent to project (in JSON data)
        processEntries.forEach(entry => {
            if (entry.process.id === entryPoint) {
                entry.process.parent = null; // Will be set to project by JSONImporter
            }
        });

        // Second pass: Set hierarchical parents based on consistsOfProcesses (in JSON data)
        processEntries.forEach(parentEntry => {
            if (parentEntry.process.consistsOfProcesses && parentEntry.process.consistsOfProcesses.length > 0) {
                parentEntry.process.consistsOfProcesses.forEach(childProcessId => {
                    const childProcess = processMap.get(childProcessId);
                    if (childProcess) {
                        childProcess.parent = parentEntry.process.id; // Set as ID string for JSONImporter
                    }
                });
            }
        });

        // Third pass: Any remaining processes without parents get entryPoint as parent (fallback)
        processEntries.forEach(entry => {
            if (!entry.process.parent && entry.process.id !== entryPoint) {
                const entryPointProcess = processMap.get(entryPoint);
                if (entryPointProcess) {
                    entry.process.parent = entryPointProcess;
                }
            }
        });
    }

    /**
     * Reconstruct relationships for standard JSON format
     */
    _reconstructStandardJSONRelationships(jsonData, projectInfo) {

        // 1. Set parent relationships
        if (projectInfo) {
            const entryPoint = projectInfo.getAttribute('entryPoint');
            const project = jsonData.find(obj => obj.$type === 'fpb:Project');

            jsonData.filter(obj => obj.$type === 'fpb:Process').forEach(process => {
                if (process.id === entryPoint && project) {
                    process.parent = project;
                } else if (process.id !== entryPoint) {
                    process.parent = entryPoint;
                }
            });
        }

        // 2. Set decomposed view relationships (ProcessOperator <-> Process by matching IDs)
        const processOperators = jsonData.filter(obj => obj.$type === 'fpb:ProcessOperator');
        const processes = jsonData.filter(obj => obj.$type === 'fpb:Process');

        processOperators.forEach(operator => {
            const matchingProcess = processes.find(proc => proc.id === operator.id);
            if (matchingProcess) {
                operator.decomposedView = matchingProcess.id;
                matchingProcess.isDecomposedProcessOperator = operator.id;
            }
        });
    }

    /**
     * Reconstruct decomposed view relationships between ProcessOperators and Processes
     * Based on matching IDs between ProcessOperators and Processes
     */
    _reconstructDecomposedViewRelationships(jsonData) {

        // Find all processes and their ProcessOperators
        const processEntries = jsonData.filter(item => item.process);

        // Create a map of all ProcessOperators by ID
        const processOperatorMap = new Map();
        processEntries.forEach(processEntry => {
            processEntry.elementDataInformation?.forEach(element => {
                if (element.$type === 'fpb:ProcessOperator') {
                    processOperatorMap.set(element.id, element);
                }
            });
        });


        // For each process, check if there's a ProcessOperator with the same ID
        processEntries.forEach(processEntry => {
            const process = processEntry.process;
            const matchingProcessOperator = processOperatorMap.get(process.id);

            if (matchingProcessOperator) {

                // Set bidirectional relationship - use IDs first, JSONImporter will convert to objects later
                matchingProcessOperator.decomposedView = process.id;
                process.isDecomposedProcessOperator = matchingProcessOperator.id;

                // Find the parent process that contains this ProcessOperator and add this process to its consistsOfProcesses
                processEntries.forEach(parentProcessEntry => {
                    const parentProcess = parentProcessEntry.process;
                    const hasThisProcessOperator = parentProcess.consistsOfProcessOperator?.includes(matchingProcessOperator.id);


                    if (hasThisProcessOperator) {
                        if (!parentProcess.consistsOfProcesses) {
                            parentProcess.consistsOfProcesses = [];
                        }
                        if (!parentProcess.consistsOfProcesses.includes(process.id)) {
                            parentProcess.consistsOfProcesses.push(process.id);
                        }
                    }
                });

            }
        });

    }

    /**
     * Check if an element is DEFINED in this process (not just referenced as shared state)
     * An element is considered "defined" in a process if:
     * 1. It exists directly in the process's elements (states, processOperators)
     * 2. OR it exists in the process's systemLimit elements
     */
    _isElementDefinedInProcess(elementId, processElement) {
        if (!elementId || !processElement) return false;

        // Check direct process elements (states, processOperators)
        const states = processElement.getElementsByTagName('state');
        for (let state of states) {
            const stateId = state.querySelector('identification')?.getAttribute('uniqueIdent');
            if (stateId === elementId) {
                return true;
            }
        }

        const processOperators = processElement.getElementsByTagName('processOperator');
        for (let po of processOperators) {
            const poId = po.querySelector('identification')?.getAttribute('uniqueIdent');
            if (poId === elementId) {
                return true;
            }
        }

        // Check systemLimit elements
        const systemLimits = processElement.getElementsByTagName('systemLimit');
        for (let systemLimit of systemLimits) {
            const slStates = systemLimit.getElementsByTagName('state');
            for (let state of slStates) {
                const stateId = state.querySelector('identification')?.getAttribute('uniqueIdent');
                if (stateId === elementId) {
                    return true;
                }
            }

            const slProcessOperators = systemLimit.getElementsByTagName('processOperator');
            for (let po of slProcessOperators) {
                const poId = po.querySelector('identification')?.getAttribute('uniqueIdent');
                if (poId === elementId) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Generate unique ID
     */
    _generateId() {
        return XMLMapper.UUID_TEMPLATE.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Static method to check if XML string is VDI/VDE 3682 format
     */
    static isVDI3682XML(xmlString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            const parserError = xmlDoc.getElementsByTagName("parsererror");
            if (parserError.length > 0) return false;

            const rootElement = xmlDoc.documentElement;
            return rootElement && (
                rootElement.tagName === 'project' &&
                rootElement.getAttribute('xmlns') === 'http://www.vdivde.de/3682'
            );
        } catch (error) {
            return false;
        }
    }

    /**
     * Convert FPB.js JSON to VDI/VDE 3682 XML (embedded working logic)
     */
    _convertJSONtoXML(jsonData) {

        try {
            const xmlDoc = this._createXMLDocument();
            const root = xmlDoc.documentElement;

            // Find project and process data
            const projectData = jsonData.find(item => item.$type === 'fpb:Project');
            const processEntries = jsonData.filter(item => item.process);


            if (!projectData) {
                throw new Error('No project data found in JSON');
            }

            // Add project information
            const projectInfo = xmlDoc.createElement('projectInformation');
            projectInfo.setAttribute('entryPoint', projectData.entryPoint || 'main-process');
            if (projectData.name) projectInfo.setAttribute('name', projectData.name);
            if (projectData.targetNamespace) projectInfo.setAttribute('targetNamespace', projectData.targetNamespace);
            root.appendChild(projectInfo);


            // Process each process entry
            processEntries.forEach((processEntry, index) => {
                const processXml = this._convertProcessToXML(xmlDoc, processEntry);
                if (processXml) {
                    root.appendChild(processXml);
                }
            });

            // Serialize to string with proper formatting
            const serializer = new XMLSerializer();
            const xmlString = serializer.serializeToString(xmlDoc);

            return this._formatXML(xmlString);

        } catch (error) {
            console.error('❌ _convertJSONtoXML: Error converting JSON to XML:', error);
            throw error;
        }
    }

    /**
     * Create base XML document structure
     */
    _createXMLDocument() {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(
            '<?xml version="1.0" encoding="UTF-8"?>' +
            '<project xmlns="http://www.vdivde.de/3682" ' +
            'xmlns:visual="http://www.fpbjs.net/visual" ' +
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xsi:schemaLocation="http://www.vdivde.de/3682 FPD_Complete_Schema.xsd">' +
            '</project>',
            'text/xml'
        );
        return xmlDoc;
    }

    /**
     * Convert JSON process entry to XML process element
     */
    _convertProcessToXML(xmlDoc, processEntry) {
        const { process, elementDataInformation = [], elementVisualInformation = [] } = processEntry;


        const actualTypes = elementDataInformation.map(el => el.$type).filter(Boolean);
        const uniqueTypes = [...new Set(actualTypes)];

        const processXml = xmlDoc.createElement('process');
        processXml.setAttribute('id', process.id);

        // 1. SystemLimit (required, first in sequence)
        const systemLimitId = process.consistsOfSystemLimit || process.elementsContainer?.[0];
        if (systemLimitId) {
            const systemLimitXml = xmlDoc.createElement('systemLimit');
            systemLimitXml.setAttribute('id', systemLimitId);

            // Add name attribute from elementDataInformation
            const systemLimitData = elementDataInformation.find(el => el.id === systemLimitId);
            if (systemLimitData && systemLimitData.name) {
                systemLimitXml.setAttribute('name', systemLimitData.name);
            }

            const systemLimitVisual = elementVisualInformation.find(vi => vi.id === systemLimitId);
            if (systemLimitVisual) {
                this._addVisualAttributes(systemLimitXml, systemLimitVisual);
            }
            processXml.appendChild(systemLimitXml);
        }

        // 2. States container (required, min 2 states)
        const statesContainer = xmlDoc.createElement('states');
        const states = elementDataInformation.filter(el =>
            ['fpb:Product', 'fpb:Energy', 'fpb:Information'].includes(el.$type)
        );

        states.forEach(state => {
            const stateXml = this._convertStateToXML(xmlDoc, state, elementVisualInformation, elementDataInformation);
            if (stateXml) {
                statesContainer.appendChild(stateXml);
            }
        });
        processXml.appendChild(statesContainer);

        // 3. ProcessOperators container (required, min 1)
        const processOperatorsContainer = xmlDoc.createElement('processOperators');
        const processOperators = elementDataInformation.filter(el => el.$type === 'fpb:ProcessOperator');

        processOperators.forEach(processOp => {
            const processOpXml = this._convertProcessOperatorToXML(xmlDoc, processOp, elementVisualInformation, elementDataInformation);
            if (processOpXml) {
                processOperatorsContainer.appendChild(processOpXml);
            }
        });
        processXml.appendChild(processOperatorsContainer);

        // 4. TechnicalResources container (optional)
        const technicalResourcesContainer = xmlDoc.createElement('technicalResources');
        const technicalResources = elementDataInformation.filter(el => el.$type === 'fpb:TechnicalResource');

        technicalResources.forEach(techRes => {
            const techResXml = this._convertTechnicalResourceToXML(xmlDoc, techRes, elementVisualInformation, elementDataInformation);
            if (techResXml) {
                technicalResourcesContainer.appendChild(techResXml);
            }
        });
        processXml.appendChild(technicalResourcesContainer);

        // 5. FlowContainer (required, last in sequence)
        const flowContainer = xmlDoc.createElement('flowContainer');
        const flows = elementDataInformation.filter(el =>
            ['fpb:Flow', 'fpb:AlternativeFlow', 'fpb:ParallelFlow', 'fpb:Usage'].includes(el.$type)
        );

        flows.forEach(flow => {
            const flowXml = xmlDoc.createElement('flow');
            flowXml.setAttribute('id', flow.id);
            flowXml.setAttribute('flowType', this._getFlowType(flow.$type));

            const flowVisual = elementVisualInformation.find(vi => vi.id === flow.id);
            if (flowVisual) {
                this._addVisualAttributes(flowXml, flowVisual);
            }

            flowContainer.appendChild(flowXml);
        });
        processXml.appendChild(flowContainer);

        return processXml;
    }

    /**
     * Convert JSON state to XML state element
     */
    _convertStateToXML(xmlDoc, state, elementVisualInformation, elementDataInformation) {
        const stateXml = xmlDoc.createElement('state');
        stateXml.setAttribute('stateType', this._getStateType(state.$type));

        // Add visual attributes
        const stateVisual = elementVisualInformation.find(vi => vi.id === state.id);
        if (stateVisual) {
            this._addVisualAttributes(stateXml, stateVisual);
        }

        // Add identification
        const identificationXml = this._convertIdentificationToXML(xmlDoc, state);
        stateXml.appendChild(identificationXml);

        // Add characteristics
        const characteristicsXml = this._convertCharacteristicsToXML(xmlDoc, state);
        stateXml.appendChild(characteristicsXml);

        // Add assignments
        const assignmentsXml = this._convertAssignmentsToXML(xmlDoc, state);
        stateXml.appendChild(assignmentsXml);

        // Add flows (entry/exit structure)
        const flowsXml = this._convertFlowsToXML(xmlDoc, state, elementDataInformation);
        stateXml.appendChild(flowsXml);

        return stateXml;
    }

    /**
     * Convert JSON processOperator to XML processOperator element
     */
    _convertProcessOperatorToXML(xmlDoc, processOperator, elementVisualInformation, elementDataInformation) {
        const processOpXml = xmlDoc.createElement('processOperator');

        // Add visual attributes
        const processOpVisual = elementVisualInformation.find(vi => vi.id === processOperator.id);
        if (processOpVisual) {
            this._addVisualAttributes(processOpXml, processOpVisual);
        }

        // Add identification
        const identificationXml = this._convertIdentificationToXML(xmlDoc, processOperator);
        processOpXml.appendChild(identificationXml);

        // Add characteristics
        const characteristicsXml = this._convertCharacteristicsToXML(xmlDoc, processOperator);
        processOpXml.appendChild(characteristicsXml);

        // Add assignments
        const assignmentsXml = this._convertAssignmentsToXML(xmlDoc, processOperator);
        processOpXml.appendChild(assignmentsXml);

        // Add flows
        const flowsXml = this._convertFlowsToXML(xmlDoc, processOperator, elementDataInformation);
        processOpXml.appendChild(flowsXml);

        // Add usages
        const usagesXml = this._convertUsagesToXML(xmlDoc, processOperator, elementDataInformation);
        processOpXml.appendChild(usagesXml);

        return processOpXml;
    }

    /**
     * Convert JSON technicalResource to XML technicalResource element
     */
    _convertTechnicalResourceToXML(xmlDoc, technicalResource, elementVisualInformation, elementDataInformation) {
        const techResXml = xmlDoc.createElement('technicalResource');

        // Add visual attributes
        const techResVisual = elementVisualInformation.find(vi => vi.id === technicalResource.id);
        if (techResVisual) {
            this._addVisualAttributes(techResXml, techResVisual);
        }

        // Add identification
        const identificationXml = this._convertIdentificationToXML(xmlDoc, technicalResource);
        techResXml.appendChild(identificationXml);

        // Add characteristics
        const characteristicsXml = this._convertCharacteristicsToXML(xmlDoc, technicalResource);
        techResXml.appendChild(characteristicsXml);

        // Add assignments
        const assignmentsXml = this._convertAssignmentsToXML(xmlDoc, technicalResource);
        techResXml.appendChild(assignmentsXml);

        // Add usages
        const usagesXml = this._convertUsagesToXML(xmlDoc, technicalResource, elementDataInformation);
        techResXml.appendChild(usagesXml);

        return techResXml;
    }

    /**
     * Convert identification object to XML
     */
    _convertIdentificationToXML(xmlDoc, element) {
        const identificationXml = xmlDoc.createElement('identification');

        const identification = element.identification || {};
        identificationXml.setAttribute('uniqueIdent', element.id);
        if (identification.longName) identificationXml.setAttribute('longName', identification.longName);

        // Use element.name as fallback for shortName if identification.shortName is not available
        const shortName = identification.shortName || element.name;
        if (shortName) identificationXml.setAttribute('shortName', shortName);

        if (identification.versionNumber) identificationXml.setAttribute('versionNumber', identification.versionNumber);
        if (identification.revisionNumber) identificationXml.setAttribute('revisionNumber', identification.revisionNumber);

        // Add references
        const referencesXml = xmlDoc.createElement('references');
        identificationXml.appendChild(referencesXml);

        return identificationXml;
    }

    /**
     * Convert characteristic identification object to XML
     */
    _convertCharacteristicIdentificationToXML(xmlDoc, categoryElement) {
        const identificationXml = xmlDoc.createElement('identification');

        // For characteristics, the uniqueIdent is directly in the category object
        const uniqueIdent = categoryElement.uniqueIdent || categoryElement.id || this._generateId();
        identificationXml.setAttribute('uniqueIdent', uniqueIdent);

        if (categoryElement.longName) identificationXml.setAttribute('longName', categoryElement.longName);
        if (categoryElement.shortName) identificationXml.setAttribute('shortName', categoryElement.shortName);
        if (categoryElement.versionNumber) identificationXml.setAttribute('versionNumber', categoryElement.versionNumber);
        if (categoryElement.revisionNumber) identificationXml.setAttribute('revisionNumber', categoryElement.revisionNumber);

        // Add references
        const referencesXml = xmlDoc.createElement('references');
        identificationXml.appendChild(referencesXml);

        return identificationXml;
    }

    /**
     * Convert characteristics to XML
     */
    _convertCharacteristicsToXML(xmlDoc, element) {
        const characteristicsXml = xmlDoc.createElement('characteristics');

        if (element.characteristics && Array.isArray(element.characteristics)) {
            element.characteristics.forEach(char => {
                const characteristicXml = xmlDoc.createElement('characteristic');

                // Add characteristic identification
                const charIdentificationXml = this._convertCharacteristicIdentificationToXML(xmlDoc, char.category || {});
                characteristicXml.appendChild(charIdentificationXml);

                // Add descriptiveElement
                const descriptiveElementXml = xmlDoc.createElement('descriptiveElement');
                const desc = char.descriptiveElement || {};
                if (desc.valueDeterminationProcess) descriptiveElementXml.setAttribute('valueDeterminationProcess', desc.valueDeterminationProcess);
                if (desc.representivity) descriptiveElementXml.setAttribute('representivity', desc.representivity);
                if (desc.setpointValue && desc.setpointValue.value) descriptiveElementXml.setAttribute('setpointValue', desc.setpointValue.value);
                if (desc.setpointValue && desc.setpointValue.unit) descriptiveElementXml.setAttribute('unit', desc.setpointValue.unit);
                characteristicXml.appendChild(descriptiveElementXml);

                // Add relationalElement
                const relationalElementXml = xmlDoc.createElement('relationalElement');
                const rel = char.relationalElement || {};
                if (rel.view) relationalElementXml.setAttribute('view', rel.view);
                if (rel.model) relationalElementXml.setAttribute('model', rel.model);
                if (rel.regulationsForRelationalGeneration) relationalElementXml.setAttribute('regulationsForRelationalGeneration', rel.regulationsForRelationalGeneration);
                characteristicXml.appendChild(relationalElementXml);

                characteristicsXml.appendChild(characteristicXml);
            });
        }

        return characteristicsXml;
    }

    /**
     * Convert assignments to XML
     */
    _convertAssignmentsToXML(xmlDoc, element) {
        const assignmentsXml = xmlDoc.createElement('assignments');

        if (element.isAssignedTo && Array.isArray(element.isAssignedTo)) {
            element.isAssignedTo.forEach(assignedId => {
                const assignedXml = xmlDoc.createElement('assigned');
                assignedXml.setAttribute('id', assignedId);
                assignmentsXml.appendChild(assignedXml);
            });
        }

        return assignmentsXml;
    }

    /**
     * Convert flows (incoming/outgoing) to XML flows structure
     */
    _convertFlowsToXML(xmlDoc, element, elementDataInformation) {
        const flowsXml = xmlDoc.createElement('flows');

        // Group incoming and outgoing by flow relationships, keeping track of flow IDs
        const flowRelationships = new Map();

        // Process incoming flows
        if (element.incoming && Array.isArray(element.incoming)) {
            element.incoming.forEach(flowId => {
                const flowData = elementDataInformation.find(el => el.id === flowId);
                if (flowData && flowData.sourceRef) {
                    const key = `${flowData.sourceRef}-${element.id}`;
                    if (!flowRelationships.has(key)) {
                        flowRelationships.set(key, { entries: [], exits: [], flowId: flowData.id });
                    }
                    flowRelationships.get(key).entries.push(flowData.sourceRef);
                    flowRelationships.get(key).exits.push(element.id);
                }
            });
        }

        // Process outgoing flows
        if (element.outgoing && Array.isArray(element.outgoing)) {
            element.outgoing.forEach(flowId => {
                const flowData = elementDataInformation.find(el => el.id === flowId);
                if (flowData && flowData.targetRef) {
                    const key = `${element.id}-${flowData.targetRef}`;
                    if (!flowRelationships.has(key)) {
                        flowRelationships.set(key, { entries: [], exits: [], flowId: flowData.id });
                    }
                    flowRelationships.get(key).entries.push(element.id);
                    flowRelationships.get(key).exits.push(flowData.targetRef);
                }
            });
        }

        // Create flow elements
        flowRelationships.forEach((relationship, key) => {
            const flowXml = xmlDoc.createElement('flow');

            // Add flow ID attribute
            if (relationship.flowId) {
                flowXml.setAttribute('id', relationship.flowId);
            }

            relationship.entries.forEach(entryId => {
                const entryXml = xmlDoc.createElement('entry');
                entryXml.setAttribute('id', entryId);
                flowXml.appendChild(entryXml);
            });

            relationship.exits.forEach(exitId => {
                const exitXml = xmlDoc.createElement('exit');
                exitXml.setAttribute('id', exitId);
                flowXml.appendChild(exitXml);
            });

            if (relationship.entries.length > 0 || relationship.exits.length > 0) {
                flowsXml.appendChild(flowXml);
            }
        });

        return flowsXml;
    }

    /**
     * Convert usages to XML
     */
    _convertUsagesToXML(xmlDoc, element, elementDataInformation) {
        const usagesXml = xmlDoc.createElement('usages');

        // Find usage connections for this element
        const usages = elementDataInformation.filter(el =>
            el.$type === 'fpb:Usage' &&
            (element.incoming?.includes(el.id) || element.outgoing?.includes(el.id))
        );

        usages.forEach(usage => {
            const usageXml = xmlDoc.createElement('usage');
            usageXml.setAttribute('id', usage.id);
            usagesXml.appendChild(usageXml);
        });

        return usagesXml;
    }


    /**
     * Extract flows with entry/exit from states
     */
    _extractStateFlows(processElement) {
        const stateFlows = [];
        const statesContainer = processElement.getElementsByTagName('states')[0];

        if (statesContainer) {
            const states = statesContainer.getElementsByTagName('state');
            for (let i = 0; i < states.length; i++) {
                const state = states[i];
                const flowsContainer = state.getElementsByTagName('flows')[0];

                if (flowsContainer) {
                    const flows = flowsContainer.getElementsByTagName('flow');
                    for (let j = 0; j < flows.length; j++) {
                        const flow = flows[j];
                        const flowId = flow.getAttribute('id');

                        // Extract entry and exit
                        const entries = flow.getElementsByTagName('entry');
                        const exits = flow.getElementsByTagName('exit');

                        if (entries.length > 0 && exits.length > 0) {
                            const stateFlow = {
                                id: flowId,
                                sourceRef: entries[0].getAttribute('id'),
                                targetRef: exits[0].getAttribute('id')
                            };
                            stateFlows.push(stateFlow);
                        } else {
                        }
                    }
                }
            }
        }

        return stateFlows;
    }

    /**
     * Add visual attributes to XML element
     */
    _addVisualAttributes(xmlElement, visualData) {
        if (visualData.x !== undefined) xmlElement.setAttribute('visual:x', visualData.x);
        if (visualData.y !== undefined) xmlElement.setAttribute('visual:y', visualData.y);
        if (visualData.width !== undefined) xmlElement.setAttribute('visual:width', visualData.width);
        if (visualData.height !== undefined) xmlElement.setAttribute('visual:height', visualData.height);
        if (visualData.visible !== undefined) xmlElement.setAttribute('visual:visible', visualData.visible);
        if (visualData.collapsed !== undefined) xmlElement.setAttribute('visual:collapsed', visualData.collapsed);
        if (visualData.waypoints !== undefined) {
            // Serialize waypoints as comma-separated coordinate pairs for cleaner XML
            if (Array.isArray(visualData.waypoints)) {
                const waypointsString = visualData.waypoints
                    .map(point => `${point.x || point.original?.x},${point.y || point.original?.y}`)
                    .join(' ');
                xmlElement.setAttribute('visual:waypoints', waypointsString);
            } else {
                xmlElement.setAttribute('visual:waypoints', visualData.waypoints);
            }
        }
    }

    /**
     * Get state type mapping
     */
    _getStateType(jsonType) {
        const mapping = {
            'fpb:Product': 'product',
            'fpb:Energy': 'energy',
            'fpb:Information': 'information'
        };
        return mapping[jsonType] || 'product';
    }

    /**
     * Get flow type mapping
     */
    _getFlowType(jsonType) {
        const mapping = {
            'fpb:Flow': 'flow',
            'fpb:AlternativeFlow': 'alternativeFlow',
            'fpb:ParallelFlow': 'parallelFlow',
            'fpb:Usage': 'usage'
        };
        return mapping[jsonType] || 'flow';
    }

    /**
     * Format XML string with proper indentation
     */
    _formatXML(xmlString) {
        const formatted = [];
        const reg = /(>)(<)(\/*)/g;
        xmlString = xmlString.replace(reg, '$1\r\n$2$3');
        let pad = 0;
        xmlString.split('\r\n').forEach(function(node) {
            let indent = 0;
            if (node.match(/.+<\/\w[^>]*>$/)) {
                indent = 0;
            } else if (node.match(/^<\/\w/)) {
                if (pad !== 0) {
                    pad -= 1;
                }
            } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                indent = 1;
            } else {
                indent = 0;
            }

            const padding = new Array(pad + 1).join('  ');
            formatted.push(padding + node);
            pad += indent;
        });

        return formatted.join('\r\n');
    }

    /**
     * Static method to auto-detect file type
     */
    static detectFileType(content) {
        // Try to parse as JSON first
        try {
            const parsedJson = JSON.parse(content);
            if (Array.isArray(parsedJson) && parsedJson.some(item => item.$type && item.$type.startsWith('fpb:'))) {
                return 'fpb-json';
            }
        } catch (e) {
            // Not valid JSON, continue
        }

        // Check if it's VDI/VDE 3682 XML
        if (this.isVDI3682XML(content)) {
            return 'vdi-xml';
        }

        return 'unknown';
    }
}

// Export for browser environment
export default XMLMapper;