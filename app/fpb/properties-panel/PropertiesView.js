import { is, isAny } from '../help/utils';
import {
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';



import React, { useState, useEffect, useCallback, memo } from 'react';

// Bootstrap Komponenten
// https://react-bootstrap.github.io/
import Collapse from 'react-collapse';
import Accordion from 'react-bootstrap/Accordion';
import AccordionHeader from 'react-bootstrap/AccordionHeader';
import AccordionBody from 'react-bootstrap/AccordionBody';
import AccordionItem from 'react-bootstrap/AccordionItem';
import Card from 'react-bootstrap/Card'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import Table from 'react-bootstrap/Table';
import InputGroup from 'react-bootstrap/InputGroup'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'



import './PropertiesView.css';

const tooltips_text = {
  copyUniqueIdToClipboard: "Copy UniqueId to Clipboard"
}


const PropertiesView = ({ modeler, config }) => {
  const [selectedElements, setSelectedElements] = useState([]);
  const [element, setElement] = useState(null);
  const [isOpenedPropertiesPanel, setIsOpenedPropertiesPanel] = useState(false);

  const rerender = useCallback((element) => {
    setElement(element);
  }, []);

  useEffect(() => {
    const handleSelectionChanged = (e) => {
      setSelectedElements(e.newSelection);
      setElement(e.newSelection[0]);
    };

    const handleElementChanged = (e) => {
      const { element: changedElement } = e;

      if (!element) {
        return;
      }

      // update panel, if currently selected element changed
      if (changedElement.id === element.id) {
        setElement(changedElement);
      }
    };

    modeler.on('selection.changed', handleSelectionChanged);
    modeler.on('element.changed', handleElementChanged);

    return () => {
      modeler.off('selection.changed', handleSelectionChanged);
      modeler.off('element.changed', handleElementChanged);
    };
  }, [modeler, element]);

  const togglePropertiesPanel = useCallback(() => {
    setIsOpenedPropertiesPanel(prev => !prev);
  }, []);

  const isOpenedPropertiesPanelButton = isOpenedPropertiesPanel 
    ? <FontAwesomeIcon icon="angles-right" />
    : <FontAwesomeIcon icon="angles-left" />;

  return (
    <div className="propertiespanel">
      <div className="config">
        <Button 
          id="openPropertiesPanelButton" 
          variant="secondary" 
          onClick={togglePropertiesPanel}
        >
          {isOpenedPropertiesPanelButton}
        </Button>
      </div>
      <Collapse isOpened={isOpenedPropertiesPanel}>
        {selectedElements.length === 1 && isOpenedPropertiesPanel && (
          <ElementProperties 
            modeler={modeler} 
            element={element} 
            config={config} 
            rerender={rerender} 
          />
        )}
        {selectedElements.length === 0 && isOpenedPropertiesPanel && (
          <ProcessStats modeler={modeler} />
        )}
        {selectedElements.length > 1 && isOpenedPropertiesPanel && (
          <span>Please select a single element.</span>
        )}
      </Collapse>
    </div>
  );
};

export default memo(PropertiesView);

const ProcessStats = memo(({ modeler }) => {
  const canvas = modeler.get('canvas');
  const process = canvas.getRootElement();
  let noOfStates = 0;
  let noOfProcessOperators = 0;
  let noOfProcesses = 0;
  let noOfSystemLimits = 0;
  if (process.type === 'fpb:Process') {
    noOfStates = process.businessObject.consistsOfStates.length;
    noOfProcessOperators = process.businessObject.consistsOfProcessOperator.length;
    noOfProcesses = process.businessObject.consistsOfProcesses.length;
    noOfSystemLimits = 1;
  }
  return (
    <div className="process-stats" key={process.id}>
      {process.type === 'fpb:Process' && process.businessObject.isDecomposedProcessOperator &&
        <Card>
          <Card.Header>
            <b>Decomposed Process of</b>
          </Card.Header>
          <Card.Body>
            {process.businessObject.isDecomposedProcessOperator.identification.shortName || process.businessObject.isDecomposedProcessOperator.identification.uniqueIdent}
          </Card.Body>

        </Card>

      }
      <Card>
        <Card.Header>
          <b>Process Stats</b>
        </Card.Header>
        {
          process.type === 'fpb:Process' &&
          <Card.Body>
            <Table>
              <thead>
                <tr>
                  <th>Number Of</th>
                  <th>#</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>SystemLimit</td>
                  <td>{noOfSystemLimits}</td>
                </tr>
                <tr>
                  <td>States</td>
                  <td>{noOfStates}</td>
                </tr>
                <tr>
                  <td>ProcessOperators</td>
                  <td>{noOfProcessOperators}</td>
                </tr>
                <tr>
                  <td>Processes</td>
                  <td>{noOfProcesses}</td>
                </tr>
              </tbody>
            </Table>
          </Card.Body>
        }
        {
          process.type !== 'fpb:Process' &&
          <Card.Body>
            nothing modeled yet
          </Card.Body>
        }
      </Card>

    </div>
  );
});

const ElementProperties = memo(({ element, modeler, config, rerender }) => {
  const [, forceUpdate] = useState({});

  let characteristics = element.businessObject.get('characteristics');
  if (element.labelTarget) {
    element = element.labelTarget;
  };
  const modeling = modeler.get('modeling');
  function updateIdentifactionProperty(property, value) {
    if (property === 'shortName') {
      modeling.updateLabel(element, value);
    } else {


      let identification = element.businessObject.get('identification');
      identification[property] = value;
      const modeling = modeler.get('modeling');
      modeling.updateProperties(element, {
        'identification': identification
      });
    }
  };

  function addCharacteristics() {
    const fpbFactory = modeler.get('fpbFactory');
    const modeling = modeler.get('modeling');

    // Get fresh characteristics reference
    let currentCharacteristics = element.businessObject.get('characteristics');
    let characterNo;
    if (!currentCharacteristics || currentCharacteristics.length === 0) {
      characterNo = 1;
    } else { 
      characterNo = currentCharacteristics.length + 1;
    }

    let newCharacteristics = fpbFactory.create('fpbch:Characteristics', {
      category: fpbFactory.create('fpb:Identification', {
        uniqueIdent: element.businessObject.id + '_c' + characterNo,
        longName: '',
        shortName: `C_${characterNo}`,
        versionNumber: '',
        revisionNumber: ''
      }),
      descriptiveElement: fpbFactory.create('fpbch:DescriptiveElement', {
        valueDeterminationProcess: '',
        representivity: '',
        setpointValue: fpbFactory.create('fpbch:ValueWithUnit', {
          value: 0.0,
          unit: ''
        }),
        validityLimits: [fpbFactory.create('fpbch:ValidityLimits', {
          limitType: '',
          from: 0.0,
          to: 0.0
        })],
        actualValues: [fpbFactory.create('fpbch:ValueWithUnit', {
          value: 0.0,
          unit: ''
        })],
      }),
      relationalElement: fpbFactory.create('fpbch:RelationalElement', {
        view: '',
        model: '',
        regulationsForRelationalGeneration: ''
      })
    });

    // Update characteristics using modeling service for proper change detection
    if (!currentCharacteristics || currentCharacteristics.length === 0) {
      modeling.updateProperties(element, {
        'characteristics': [newCharacteristics]
      });
    } else {
      const updatedCharacteristics = [...currentCharacteristics, newCharacteristics];
      modeling.updateProperties(element, {
        'characteristics': updatedCharacteristics
      });
    }
    
    // Force component re-render to show new characteristic
    forceUpdate({});
    rerender(element);
  };
  function renderCharacteristics() {
    // Get fresh characteristics reference for rendering
    const currentCharacteristics = element.businessObject.get('characteristics');
    if (currentCharacteristics !== undefined && currentCharacteristics.length > 0) {
      return currentCharacteristics.map(function (char, index) {
        return <Characteristics key={index} element={element} modeler={modeler} config={config} rerender={rerender} index={index} />
      })
    }
    else {
      return (<div></div>);
    }

  }

  return (
    <div className="element-properties" key={element.id}>

      <Accordion defaultActiveKey="pp_identification">
        {is(element, 'fpb:Object') &&
          <div>
            {config.propertiesPanel.showIdentifactionCard &&
              <Accordion.Item eventKey="pp_identification">
                <Accordion.Header>
                  <b>Identification</b>
                </Accordion.Header>
                <Accordion.Body>
                    <Form>
                      {config.propertiesPanel.identificationElements.showUniqueIdent &&
                        <Row>
                          <Form.Group as={Col}>
                            <Form.Label>Unique Identifaction</Form.Label>
                            <InputGroup>
                              <Form.Control id="uniqueIdent_id" readOnly defaultValue={element.businessObject.identification.uniqueIdent} />
                              <OverlayTrigger
                                placement="top"
                                overlay={<Tooltip id={`tooltip-uniqueId`}>
                                  {tooltips_text.copyUniqueIdToClipboard}
                                </Tooltip>}
                              >
                                <Button variant="secondary" onClick={
                                  () => {
                                    var copyText = document.getElementById("uniqueIdent_id");
                                    copyText.select();
                                    copyText.setSelectionRange(0, 99999); /*For mobile devices*/
                                    document.execCommand("copy");
                                  }
                                }><FontAwesomeIcon icon="clipboard"></FontAwesomeIcon></Button>
                              </OverlayTrigger>
                            </InputGroup>
                          </Form.Group>
                        </Row>
                      }
                      {config.propertiesPanel.identificationElements.showLongName &&
                        <Row>
                          <Form.Group as={Col} controlId="pp_identification_longName">
                            <Form.Label>Long Name</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.longName} onChange={(event) => {
                              updateIdentifactionProperty('longName', event.target.value)
                            }} />
                          </Form.Group>
                        </Row>
                      }

                      <Row>
                        <Form.Group as={Col} controlId="pp_identification_shortName">
                          <Form.Label>Short Name</Form.Label>
                          <Form.Control defaultValue={element.businessObject.identification.shortName} onChange={(event) => {
                            updateIdentifactionProperty('shortName', event.target.value)
                          }} />
                        </Form.Group>
                      </Row>
                      {config.propertiesPanel.identificationElements.showVersionNumber &&
                        <Row>
                          <Form.Group as={Col} controlId="pp_identification_versionNumber">
                            <Form.Label>Version Number</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.versionNumber} onChange={(event) => {
                              updateIdentifactionProperty('versionNumber', event.target.value)
                            }} />
                          </Form.Group>
                        </Row>
                      }
                      {config.propertiesPanel.identificationElements.showRevisionNumber &&
                        <Row>
                          <Form.Group as={Col} controlId="pp_identification_revisionNumber">
                            <Form.Label>Revision Number</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.revisionNumber} onChange={(event) => {
                              updateIdentifactionProperty('revisionNumber', event.target.value)
                            }} />
                          </Form.Group>
                        </Row>
                      }
                    </Form>
                </Accordion.Body>
              </Accordion.Item>
            }
            {config.propertiesPanel.showActionsCard &&
              <Accordion.Item eventKey="pp_actions">
                <Accordion.Header>
                  <b>Actions</b>
                </Accordion.Header>
                <Accordion.Body>

                    {config.propertiesPanel.actionsElements.addCharasterics &&
                      <Button variant="secondary" onClick={addCharacteristics}>Add characteristics</Button>
                    }
                </Accordion.Body>
              </Accordion.Item>
            }
            {renderCharacteristics()}
          </div>
        }
      </Accordion >
      <br />
    </div >
  );
});

const Characteristics = (props) => {
  let {
    element,
    modeler,
    config,
    rerender,
    index
  } = props;
  let no = index;
  
  // Always get fresh characteristics data to ensure tab names update
  const getCharacteristics = () => element.businessObject.get('characteristics');
  const modeling = modeler.get('modeling');

  function removeCharacteristic() {
    const characteristics = getCharacteristics();
    collectionRemove(characteristics, characteristics[no]);
    rerender(element);
  }

  function updateCharacteristics(type, valueType, value, addOptions) {
    const characteristics = getCharacteristics();
    if (addOptions) {
      characteristics[no][type][valueType][addOptions] = value;
      modeling.updateProperties(element, {
        'characteristics': characteristics
      });
    }
    else {
      characteristics[no][type][valueType] = value;
      modeling.updateProperties(element, {
        'characteristics': characteristics
      });
    }
    // Trigger re-render to update characteristic tab names and other UI elements
    rerender(element);
  }
  const characteristics = getCharacteristics();
  
  return (
    <div className="characteristics-properties" key={characteristics[no].category.uniqueIdent}>
      <Accordion.Item eventKey={`pp_characteristics${no}`}>
        <Accordion.Header>
          <b>{characteristics[no].category.shortName}</b>
        </Accordion.Header>
        <Accordion.Body>
            <Accordion defaultActiveKey="pp_characteristics_category">
              {config.propertiesPanel.defaultCharacteristics.showCategoryCard &&
                <Accordion.Item eventKey="pp_characteristics_category">
                  <Accordion.Header>
                    <b>Category</b>
                  </Accordion.Header>
                  <Accordion.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showUniqueIdent &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_id">
                              <Form.Label>Unique Identifaction</Form.Label>
                              <Form.Control readOnly defaultValue={characteristics[no].category.uniqueIdent} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showLongName &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_longName">
                              <Form.Label>Long Name</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.longName} onChange={(event) => {
                                updateCharacteristics('category', 'longName', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }

                        <Row>
                          <Form.Group as={Col} controlId="pp_characteristics_category_shortName">
                            <Form.Label>Short Name</Form.Label>
                            <Form.Control defaultValue={characteristics[no].category.shortName} onChange={(event) => {
                              updateCharacteristics('category', 'shortName', event.target.value)
                            }} />
                          </Form.Group>
                        </Row>
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showVersionNumber &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_versionNumber">
                              <Form.Label>Version Number</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.versionNumber} onChange={(event) => {
                                updateCharacteristics('category', 'versionNumber', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showRevisionNumber &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_revisionNumber">
                              <Form.Label>Revision Number</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.revisionNumber} onChange={(event) => {
                                updateCharacteristics('category', 'revisionNumber', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                      </Form>
                  </Accordion.Body>
                </Accordion.Item>
              }
              {config.propertiesPanel.defaultCharacteristics.showDescriptiveElementCard &&
                <Accordion.Item eventKey="pp_characteristics_descriptiveElement">
                  <Accordion.Header>
                    <b>Descriptive Element</b>
                  </Accordion.Header>
                  <Accordion.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showValueDeterminationProcess &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_vdp">
                              <Form.Label>Value Determination Process</Form.Label>
                              <Form.Control defaultValue={characteristics[no].descriptiveElement.valueDeterminationProcess} onChange={(event) => {
                                updateCharacteristics('descriptiveElement', 'valueDeterminationProcess', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showRepresentivity &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_representivity">
                              <Form.Label>Representivity</Form.Label>
                              <Form.Control defaultValue={characteristics[no].descriptiveElement.representivity} onChange={(event) => {
                                updateCharacteristics('descriptiveElement', 'representivity', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showSetpointValue &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_setPointValue">
                              <Form.Label>Setpoint Value</Form.Label>
                              <InputGroup>
                                <Form.Control placeholder="value" defaultValue={characteristics[no].descriptiveElement.setpointValue.value} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'setpointValue', event.target.value, 'value')
                                }} />
                                <Form.Control placeholder="unit" defaultValue={characteristics[no].descriptiveElement.setpointValue.unit} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'setpointValue', event.target.value, 'unit')
                                }} />
                              </InputGroup>
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showActualValues &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_actualValues">
                              <Form.Label>Actual Values</Form.Label>
                              <InputGroup>
                                <Form.Control placeholder="value" defaultValue={characteristics[no].descriptiveElement.actualValues.value} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'actualValues', event.target.value, 'value')
                                }} />
                                <Form.Control placeholder="unit" defaultValue={characteristics[no].descriptiveElement.setpointValue.unit} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'actualValues', event.target.value, 'unit')
                                }} />
                              </InputGroup>
                            </Form.Group>
                          </Row>
                        }
                      </Form>
                  </Accordion.Body>
                </Accordion.Item>
              }
              {config.propertiesPanel.defaultCharacteristics.showRelationalElementCard &&
                <Accordion.Item eventKey="pp_characteristics_relationalElement">
                  <Accordion.Header>
                    <b>Relational Element</b>
                  </Accordion.Header>
                  <Accordion.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showModel &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_model">
                              <Form.Label>Model</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.model} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'model', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showRegulationsforRelationalGeneration &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_rfrg">
                              <Form.Label>Regulations for Relational Generation</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.regulationsForRelationalGeneration} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'regulationsForRelationalGeneration', event.target.value)
                              }} />
                            </Form.Group>
                          </Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showView &&
                          <Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_view">
                              <Form.Label>View</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.view} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'view', event.target.value)
                              }} />

                            </Form.Group>
                          </Row>
                        }
                      </Form>
                  </Accordion.Body>
                </Accordion.Item>
              }

            </Accordion>
            <OverlayTrigger placement="auto" overlay={<Tooltip id={`tooltip-RemoveCharacterics${no}`}>
                   Removes the characteristic
                </Tooltip>}>

                <Button variant="secondary" onClick={() => removeCharacteristic()}><FontAwesomeIcon icon="trash-can" /></Button>

                </OverlayTrigger>
            
        </Accordion.Body>
          
      </Accordion.Item>

    </div>);
};

