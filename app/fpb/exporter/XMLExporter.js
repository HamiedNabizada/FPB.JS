class XMLExporter {
    constructor() {
        this.xmlDoc = null;
        this.xmlSerializer = new XMLSerializer();
    }

    exportToXML(data, options = {}) {
        try {
            console.log('XMLExporter: Starting export with data:', data);
            console.log('XMLExporter: Data type:', typeof data);
            console.log('XMLExporter: Is array:', Array.isArray(data));
            
            // Create XML document
            this.xmlDoc = document.implementation.createDocument(
                'http://www.vdivde.de/3682', 
                'fpb:project', 
                null
            );

            const projectElement = this.xmlDoc.documentElement;
            projectElement.setAttribute('xmlns:fpb', 'http://www.vdivde.de/3682');
            
            // Find project definition
            const projectData = this.findProjectData(data);
            console.log('XMLExporter: Found project data:', projectData);
            if (!projectData) {
                throw new Error('No project definition found in data');
            }

            // Create project information
            const projectInfo = this.xmlDoc.createElement('projectInformation');
            projectInfo.setAttribute('entryPoint', projectData.entryPoint.id || projectData.entryPoint);
            projectInfo.setAttribute('name', projectData.name || 'FPB Project');
            projectInfo.setAttribute('targetNamespace', projectData.targetNamespace || 'http://www.vdivde.de/3682');
            projectElement.appendChild(projectInfo);

            // Process each process in the data
            data.forEach(item => {
                if (item.process && item.elementDataInformation && item.elementVisualInformation) {
                    const processElement = this.createProcessElement(item);
                    projectElement.appendChild(processElement);
                }
            });

            // Serialize to string
            const xmlString = this.xmlSerializer.serializeToString(this.xmlDoc);
            
            // Pretty print the XML
            return this.formatXML(xmlString);
            
        } catch (error) {
            throw new Error(`XML export failed: ${error.message}`);
        }
    }

    findProjectData(data) {
        // Find the project definition in the data array
        for (const item of data) {
            if (item.$type === 'fpb:Project') {
                return item;
            }
        }
        
        // If no explicit project found, create default from first process
        const firstProcess = data.find(item => item.process);
        if (firstProcess) {
            return {
                name: 'Exported FPB Project',
                targetNamespace: 'http://www.vdivde.de/3682',
                entryPoint: firstProcess.process.id
            };
        }
        
        return null;
    }

    createProcessElement(processData) {
        const processElement = this.xmlDoc.createElement('process');
        processElement.setAttribute('id', processData.process.id);

        // Create system limit
        const systemLimitElement = this.xmlDoc.createElement('systemLimit');
        
        // Find system limit in element data information
        const systemLimitData = processData.elementDataInformation.find(el => el.$type === 'fpb:SystemLimit');
        const systemLimitId = systemLimitData ? systemLimitData.id : (processData.process.id + '_sl');
        
        systemLimitElement.setAttribute('id', systemLimitId);
        processElement.appendChild(systemLimitElement);

        // Group elements by type
        const states = [];
        const processOperators = [];
        const technicalResources = [];
        const flows = [];

        processData.elementDataInformation.forEach(element => {
            switch (element.$type) {
                case 'fpb:Product':
                case 'fpb:Energy':
                case 'fpb:Information':
                    states.push(element);
                    break;
                case 'fpb:ProcessOperator':
                    processOperators.push(element);
                    break;
                case 'fpb:TechnicalResource':
                    technicalResources.push(element);
                    break;
                case 'fpb:Flow':
                case 'fpb:AlternativeFlow':
                case 'fpb:ParallelFlow':
                case 'fpb:Usage':
                    flows.push(element);
                    break;
            }
        });

        // Create states section
        if (states.length > 0) {
            const statesElement = this.xmlDoc.createElement('states');
            states.forEach(state => {
                const stateElement = this.createStateElement(state);
                statesElement.appendChild(stateElement);
            });
            processElement.appendChild(statesElement);
        }

        // Create process operators section
        if (processOperators.length > 0) {
            const processOperatorsElement = this.xmlDoc.createElement('processOperators');
            processOperators.forEach(po => {
                const poElement = this.createProcessOperatorElement(po);
                processOperatorsElement.appendChild(poElement);
            });
            processElement.appendChild(processOperatorsElement);
        }

        // Create technical resources section
        if (technicalResources.length > 0) {
            const technicalResourcesElement = this.xmlDoc.createElement('technicalResources');
            technicalResources.forEach(tr => {
                const trElement = this.createTechnicalResourceElement(tr);
                technicalResourcesElement.appendChild(trElement);
            });
            processElement.appendChild(technicalResourcesElement);
        }

        // Create flow container
        if (flows.length > 0) {
            const flowContainerElement = this.xmlDoc.createElement('flowContainer');
            flows.forEach(flow => {
                const flowElement = this.createFlowElement(flow);
                flowContainerElement.appendChild(flowElement);
            });
            processElement.appendChild(flowContainerElement);
        }

        return processElement;
    }

    createStateElement(stateData) {
        const stateElement = this.xmlDoc.createElement('state');
        
        // Determine state type
        let stateType;
        switch (stateData.$type) {
            case 'fpb:Product':
                stateType = 'product';
                break;
            case 'fpb:Energy':
                stateType = 'energy';
                break;
            case 'fpb:Information':
                stateType = 'information';
                break;
            default:
                stateType = 'product';
        }
        stateElement.setAttribute('stateType', stateType);

        // Add identification
        if (stateData.identification) {
            const identificationElement = this.createIdentificationElement(stateData.identification);
            stateElement.appendChild(identificationElement);
        }

        // Add characteristics
        if (stateData.characteristics && stateData.characteristics.length > 0) {
            const characteristicsElement = this.createCharacteristicsElement(stateData.characteristics);
            stateElement.appendChild(characteristicsElement);
        } else {
            // Add empty characteristics element
            const characteristicsElement = this.xmlDoc.createElement('characteristics');
            stateElement.appendChild(characteristicsElement);
        }

        // Add assignments
        const assignmentsElement = this.createAssignmentsElement(stateData.isAssignedTo || []);
        stateElement.appendChild(assignmentsElement);

        // Add flows
        const flowsElement = this.createFlowsElement(stateData.incoming || [], stateData.outgoing || []);
        stateElement.appendChild(flowsElement);

        return stateElement;
    }

    createProcessOperatorElement(poData) {
        const poElement = this.xmlDoc.createElement('processOperator');

        // Add identification
        if (poData.identification) {
            const identificationElement = this.createIdentificationElement(poData.identification);
            poElement.appendChild(identificationElement);
        }

        // Add characteristics
        if (poData.characteristics && poData.characteristics.length > 0) {
            const characteristicsElement = this.createCharacteristicsElement(poData.characteristics);
            poElement.appendChild(characteristicsElement);
        } else {
            const characteristicsElement = this.xmlDoc.createElement('characteristics');
            poElement.appendChild(characteristicsElement);
        }

        // Add assignments
        const assignmentsElement = this.createAssignmentsElement(poData.isAssignedTo || []);
        poElement.appendChild(assignmentsElement);

        // Add flows
        const flowsElement = this.createFlowsElement(poData.incoming || [], poData.outgoing || []);
        poElement.appendChild(flowsElement);

        // Add usages (empty for now)
        const usagesElement = this.xmlDoc.createElement('usages');
        poElement.appendChild(usagesElement);

        return poElement;
    }

    createTechnicalResourceElement(trData) {
        const trElement = this.xmlDoc.createElement('technicalResource');

        // Add identification
        if (trData.identification) {
            const identificationElement = this.createIdentificationElement(trData.identification);
            trElement.appendChild(identificationElement);
        }

        // Add characteristics
        if (trData.characteristics && trData.characteristics.length > 0) {
            const characteristicsElement = this.createCharacteristicsElement(trData.characteristics);
            trElement.appendChild(characteristicsElement);
        } else {
            const characteristicsElement = this.xmlDoc.createElement('characteristics');
            trElement.appendChild(characteristicsElement);
        }

        // Add assignments
        const assignmentsElement = this.createAssignmentsElement(trData.isAssignedTo || []);
        trElement.appendChild(assignmentsElement);

        // Add usages (empty for now)
        const usagesElement = this.xmlDoc.createElement('usages');
        trElement.appendChild(usagesElement);

        return trElement;
    }

    createFlowElement(flowData) {
        const flowElement = this.xmlDoc.createElement('flow');
        flowElement.setAttribute('id', flowData.id);
        
        // Determine flow type
        let flowType;
        switch (flowData.$type) {
            case 'fpb:Flow':
                flowType = 'flow';
                break;
            case 'fpb:AlternativeFlow':
                flowType = 'alternativeFlow';
                break;
            case 'fpb:ParallelFlow':
                flowType = 'parallelFlow';
                break;
            case 'fpb:Usage':
                flowType = 'usage';
                break;
            default:
                flowType = 'flow';
        }
        flowElement.setAttribute('flowType', flowType);

        // Add source and target references if they exist
        if (flowData.sourceRef) {
            const sourceId = typeof flowData.sourceRef === 'string' ? flowData.sourceRef : flowData.sourceRef.id;
            if (sourceId) {
                flowElement.setAttribute('sourceRef', sourceId);
            }
        }
        
        if (flowData.targetRef) {
            const targetId = typeof flowData.targetRef === 'string' ? flowData.targetRef : flowData.targetRef.id;
            if (targetId) {
                flowElement.setAttribute('targetRef', targetId);
            }
        }

        return flowElement;
    }

    createIdentificationElement(identification) {
        const identElement = this.xmlDoc.createElement('identification');
        
        if (identification.uniqueIdent) {
            identElement.setAttribute('uniqueIdent', identification.uniqueIdent);
        }
        if (identification.longName) {
            identElement.setAttribute('longName', identification.longName);
        }
        if (identification.shortName) {
            identElement.setAttribute('shortName', identification.shortName);
        }
        if (identification.versionNumber) {
            identElement.setAttribute('versionNumber', identification.versionNumber);
        }
        if (identification.revisionNumber) {
            identElement.setAttribute('revisionNumber', identification.revisionNumber);
        }

        // Add empty references element (required by schema)
        const referencesElement = this.xmlDoc.createElement('references');
        identElement.appendChild(referencesElement);

        return identElement;
    }

    createCharacteristicsElement(characteristics) {
        const characteristicsElement = this.xmlDoc.createElement('characteristics');
        
        characteristics.forEach(char => {
            const characteristicElement = this.xmlDoc.createElement('characteristic');
            
            // Add identification
            if (char.category) {
                const identElement = this.createIdentificationElement(char.category);
                characteristicElement.appendChild(identElement);
            }

            // Add descriptive element
            const descriptiveElement = this.xmlDoc.createElement('descriptiveElement');
            if (char.descriptiveElement) {
                const desc = char.descriptiveElement;
                if (desc.valueDeterminationProcess) {
                    descriptiveElement.setAttribute('valueDeterminationProcess', desc.valueDeterminationProcess);
                }
                if (desc.representivity) {
                    descriptiveElement.setAttribute('representivity', desc.representivity);
                }
                if (desc.setpointValue && desc.setpointValue.value !== undefined) {
                    descriptiveElement.setAttribute('setpointValue', desc.setpointValue.value.toString());
                }
                if (desc.validityLimits) {
                    // Convert validity limits to string representation
                    const limitsStr = desc.validityLimits.map(vl => 
                        `${vl.limitType || ''}:${vl.from || '0'}-${vl.to || '0'}`
                    ).join(';');
                    descriptiveElement.setAttribute('validityLimits', limitsStr);
                }
                if (desc.actualValues && desc.actualValues.value !== undefined) {
                    descriptiveElement.setAttribute('actualValues', desc.actualValues.value.toString());
                }
            }
            characteristicElement.appendChild(descriptiveElement);

            // Add relational element
            const relationalElement = this.xmlDoc.createElement('relationalElement');
            if (char.relationalElement) {
                const rel = char.relationalElement;
                if (rel.view) {
                    relationalElement.setAttribute('view', rel.view);
                }
                if (rel.model) {
                    relationalElement.setAttribute('model', rel.model);
                }
                if (rel.regulationsForRelationalGeneration) {
                    relationalElement.setAttribute('regulationsForRelationalGeneration', rel.regulationsForRelationalGeneration);
                }
            }
            characteristicElement.appendChild(relationalElement);

            characteristicsElement.appendChild(characteristicElement);
        });

        return characteristicsElement;
    }

    createAssignmentsElement(assignments) {
        const assignmentsElement = this.xmlDoc.createElement('assignments');
        
        assignments.forEach(assignment => {
            const assignedElement = this.xmlDoc.createElement('assigned');
            const id = typeof assignment === 'string' ? assignment : 
                      assignment.id || assignment.uniqueIdent || '';
            assignedElement.setAttribute('id', id);
            assignmentsElement.appendChild(assignedElement);
        });

        return assignmentsElement;
    }

    createFlowsElement(incoming, outgoing) {
        const flowsElement = this.xmlDoc.createElement('flows');
        
        // Process incoming flows
        incoming.forEach(flow => {
            const flowElement = this.xmlDoc.createElement('flow');
            const entryElement = this.xmlDoc.createElement('entry');
            const id = typeof flow === 'string' ? flow : flow.id || '';
            entryElement.setAttribute('id', id);
            flowElement.appendChild(entryElement);
            flowsElement.appendChild(flowElement);
        });

        // Process outgoing flows
        outgoing.forEach(flow => {
            const flowElement = this.xmlDoc.createElement('flow');
            const exitElement = this.xmlDoc.createElement('exit');
            const id = typeof flow === 'string' ? flow : flow.id || '';
            exitElement.setAttribute('id', id);
            flowElement.appendChild(exitElement);
            flowsElement.appendChild(flowElement);
        });

        return flowsElement;
    }

    formatXML(xmlString) {
        // Simple XML formatting - could be enhanced with proper indentation
        let formatted = xmlString;
        
        // Add line breaks after closing tags
        formatted = formatted.replace(/></g, '>\n<');
        
        // Add indentation (basic implementation)
        const lines = formatted.split('\n');
        let indentLevel = 0;
        const indentedLines = lines.map(line => {
            const trimmedLine = line.trim();
            if (trimmedLine === '') return '';
            
            // Decrease indent for closing tags
            if (trimmedLine.startsWith('</')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            
            const indentedLine = '  '.repeat(indentLevel) + trimmedLine;
            
            // Increase indent for opening tags (but not self-closing ones)
            if (trimmedLine.startsWith('<') && 
                !trimmedLine.startsWith('</') && 
                !trimmedLine.endsWith('/>')) {
                indentLevel++;
            }
            
            return indentedLine;
        });
        
        return indentedLines.join('\n');
    }
}

export default XMLExporter;