import { is, isAny } from '../help/utils';
import {
  remove as collectionRemove
} from 'diagram-js/lib/util/Collections';
// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAngleDoubleRight, faAngleDoubleLeft, faClipboard, faTrashAlt } from '@fortawesome/free-solid-svg-icons';


import React, { Component } from 'react';

// Bootstrap Komponenten
// https://react-bootstrap.github.io/
import Collapse from 'react-collapse';
import Accordion from 'react-bootstrap/Accordion';
import Card from 'react-bootstrap/Card'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Col from 'react-bootstrap/Col';
import Table from 'react-bootstrap/Table';
import InputGroup from 'react-bootstrap/InputGroup'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'



import './PropertiesView.css';

const tooltips_text = {
  copyUniqueIdToClipboard: "Copy UniqueId to Clipboard"
}


export default class PropertiesView extends Component {

  constructor(props) {
    super(props);
    this.state = {
      selectedElements: [],
      element: null,
      isOpenedPropertiesPanel: false
    };
  };


  componentDidMount() {
    const {
      modeler,
      config
    } = this.props;

    modeler.on('selection.changed', (e) => {
      const {
        element
      } = this.state;

      this.setState({
        selectedElements: e.newSelection,
        element: e.newSelection[0]
      });
    });

    modeler.on('element.changed', (e) => {
      const {
        element
      } = e;

      const {
        element: currentElement
      } = this.state;

      if (!currentElement) {
        return;
      }

      // update panel, if currently selected element changed
      if (element.id === currentElement.id) {
        this.setState({
          element
        });
      }
    });
  };


  render() {
    const {
      modeler,
      config
    } = this.props;

    const rerender = (element) => {
      this.setState({
        element: element
      })
    }

    const {
      selectedElements,
      element,
      isOpenedPropertiesPanel
    } = this.state;

    let isOpenedPropertiesPanelButton = <FontAwesomeIcon icon={faAngleDoubleLeft} />
    if (isOpenedPropertiesPanel) {
      isOpenedPropertiesPanelButton = <FontAwesomeIcon icon={faAngleDoubleRight} />
    }
    return (
      <div className="propertiespanel">
        <div className="config">
          <Button id="openPropertiesPanelButton" variant="secondary" onClick={() => this.setState({ isOpenedPropertiesPanel: !isOpenedPropertiesPanel })}>{isOpenedPropertiesPanelButton}</Button>
        </div>
        <Collapse isOpened={isOpenedPropertiesPanel}>
          {
            selectedElements.length === 1 && isOpenedPropertiesPanel
            &&
            <ElementProperties modeler={modeler} element={element} config={config} rerender={rerender} />
          }
          {
            selectedElements.length === 0 && isOpenedPropertiesPanel
            && <ProcessStats modeler={modeler} />
          }
          {
            selectedElements.length > 1 && isOpenedPropertiesPanel
            && <span>Please select a single element.</span>
          }
        </Collapse>
      </div>
    );
  }
};

function ProcessStats(props) {
  let {
    modeler
  } = props;
  const canvas = modeler.get('canvas');
  process = canvas.getRootElement();
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
  )

}

function ElementProperties(props) {
  let {
    element,
    modeler,
    config,
    rerender
  } = props;

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

    let characterNo;
    if (characteristics === undefined) {
      characterNo = 1;
    } else { characterNo = characteristics.length + 1 }

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
        actualValues: fpbFactory.create('fpbch:ValueWithUnit', {
          value: 0.0,
          unit: ''
        }),
      }),
      relationalElement: fpbFactory.create('fpbch:RelationalElement', {
        view: '',
        model: '',
        regulationsForRelationalGeneration: ''
      })
    });

    if (characteristics === undefined) {
      element.businessObject.characteristics = [newCharacteristics]
    } else {
      element.businessObject.characteristics[characterNo - 1] = newCharacteristics;
    }
    rerender(element)
  };
  function renderCharacteristics() {
    if (characteristics !== undefined) {
      return characteristics.map(function (char, index) {
        return new Characteristics({ element, modeler, config, rerender }, index)
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
              <Card>
                <Card.Header>
                  <Accordion.Toggle as={Button} variant={Card.Header} eventKey="pp_identification">
                    <b>Identification</b>
                  </Accordion.Toggle>
                </Card.Header>
                <Accordion.Collapse eventKey="pp_identification">
                  <Card.Body>
                    <Form>
                      {config.propertiesPanel.identificationElements.showUniqueIdent &&
                        <Form.Row>
                          <Form.Group as={Col}>
                            <Form.Label>Unique Identifaction</Form.Label>
                            <InputGroup>
                              <Form.Control id="uniqueIdent_id" readOnly defaultValue={element.businessObject.identification.uniqueIdent} />
                              <InputGroup.Append>
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
                                  }><FontAwesomeIcon icon={faClipboard}></FontAwesomeIcon></Button>
                                </OverlayTrigger>
                              </InputGroup.Append>
                            </InputGroup>
                          </Form.Group>
                        </Form.Row>
                      }
                      {config.propertiesPanel.identificationElements.showLongName &&
                        <Form.Row>
                          <Form.Group as={Col} controlId="pp_identification_longName">
                            <Form.Label>Long Name</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.longName} onChange={(event) => {
                              updateIdentifactionProperty('longName', event.target.value)
                            }} />
                          </Form.Group>
                        </Form.Row>
                      }

                      <Form.Row>
                        <Form.Group as={Col} controlId="pp_identification_shortName">
                          <Form.Label>Short Name</Form.Label>
                          <Form.Control defaultValue={element.businessObject.identification.shortName} onChange={(event) => {
                            updateIdentifactionProperty('shortName', event.target.value)
                          }} />
                        </Form.Group>
                      </Form.Row>
                      {config.propertiesPanel.identificationElements.showVersionNumber &&
                        <Form.Row>
                          <Form.Group as={Col} controlId="pp_identification_versionNumber">
                            <Form.Label>Version Number</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.versionNumber} onChange={(event) => {
                              updateIdentifactionProperty('versionNumber', event.target.value)
                            }} />
                          </Form.Group>
                        </Form.Row>
                      }
                      {config.propertiesPanel.identificationElements.showRevisionNumber &&
                        <Form.Row>
                          <Form.Group as={Col} controlId="pp_identification_revisionNumber">
                            <Form.Label>Revision Number</Form.Label>
                            <Form.Control defaultValue={element.businessObject.identification.revisionNumber} onChange={(event) => {
                              updateIdentifactionProperty('revisionNumber', event.target.value)
                            }} />
                          </Form.Group>
                        </Form.Row>
                      }
                    </Form>
                  </Card.Body>
                </Accordion.Collapse>
              </Card>
            }
            {config.propertiesPanel.showActionsCard &&
              <Card>
                <Card.Header>
                  <Accordion.Toggle as={Button} variant={Card.Header} eventKey="pp_actions">
                    <b>Actions</b>
                  </Accordion.Toggle>
                </Card.Header>
                <Accordion.Collapse eventKey="pp_actions">

                  <Card.Body>
                    {config.propertiesPanel.actionsElements.addCharasterics &&
                      <Button variant="secondary" onClick={addCharacteristics}>Add characteristics</Button>
                    }
                  </Card.Body>

                </Accordion.Collapse>
              </Card>
            }
            {renderCharacteristics()}
          </div>
        }
      </Accordion >
      <br />
    </div >
  );
};

function Characteristics(props, index) {
  let {
    element,
    modeler,
    config,
    rerender
  } = props;
  let no = index;
  let characteristics = element.businessObject.get('characteristics');
  const modeling = modeler.get('modeling');

  function removeCharacteristic() {
    collectionRemove(characteristics, characteristics[no]);
    rerender(element);
  }

  function updateCharacteristics(type, valueType, value, addOptions) {
    if (addOptions) {
      characteristics = element.businessObject.get('characteristics');
      characteristics[no][type][valueType][addOptions] = value;

      modeling.updateProperties(element, {
        'characteristics': characteristics
      });
    }
    else {
      characteristics = element.businessObject.get('characteristics');
      characteristics[no][type][valueType] = value;
      modeling.updateProperties(element, {
        'characteristics': characteristics
      });
    }
  }
  return (
    <div className="characteristics-properties" key={characteristics[no].category.uniqueIdent}>
      <Card>
        <Card.Header>

          <Accordion.Toggle as={Button} variant={Card.Header} eventKey={`pp_characteristics${no}`}>
            <b>{characteristics[no].category.shortName}</b>
          </Accordion.Toggle>
        </Card.Header>
        <Accordion.Collapse eventKey={`pp_characteristics${no}`}>
          <Card.Body>
            <Accordion defaultActiveKey="pp_characteristics_category">
              {config.propertiesPanel.defaultCharacteristics.showCategoryCard &&
                <Card>
                  <Card.Header>
                    <Accordion.Toggle as={Button} variant={Card.Header} eventKey="pp_characteristics_category">
                      <b>Category</b>
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey="pp_characteristics_category">
                    <Card.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showUniqueIdent &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_id">
                              <Form.Label>Unique Identifaction</Form.Label>
                              <Form.Control readOnly defaultValue={characteristics[no].category.uniqueIdent} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showLongName &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_longName">
                              <Form.Label>Long Name</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.longName} onChange={(event) => {
                                updateCharacteristics('category', 'longName', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }

                        <Form.Row>
                          <Form.Group as={Col} controlId="pp_characteristics_category_shortName">
                            <Form.Label>Short Name</Form.Label>
                            <Form.Control defaultValue={characteristics[no].category.shortName} onChange={(event) => {
                              updateCharacteristics('category', 'shortName', event.target.value)
                            }} />
                          </Form.Group>
                        </Form.Row>
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showVersionNumber &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_versionNumber">
                              <Form.Label>Version Number</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.versionNumber} onChange={(event) => {
                                updateCharacteristics('category', 'versionNumber', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.categoryElements.showRevisionNumber &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_category_revisionNumber">
                              <Form.Label>Revision Number</Form.Label>
                              <Form.Control defaultValue={characteristics[no].category.revisionNumber} onChange={(event) => {
                                updateCharacteristics('category', 'revisionNumber', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                      </Form>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              }
              {config.propertiesPanel.defaultCharacteristics.showDescriptiveElementCard &&
                <Card>
                  <Card.Header>
                    <Accordion.Toggle as={Button} variant={Card.Header} eventKey="pp_characteristics_descriptiveElement">
                      <b>Descriptive Element</b>
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey="pp_characteristics_descriptiveElement">
                    <Card.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showValueDeterminationProcess &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_vdp">
                              <Form.Label>Value Determination Process</Form.Label>
                              <Form.Control defaultValue={characteristics[no].descriptiveElement.valueDeterminationProcess} onChange={(event) => {
                                updateCharacteristics('descriptiveElement', 'valueDeterminationProcess', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showRepresentivity &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_representivity">
                              <Form.Label>Representivity</Form.Label>
                              <Form.Control defaultValue={characteristics[no].descriptiveElement.representivity} onChange={(event) => {
                                updateCharacteristics('descriptiveElement', 'representivity', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showSetpointValue &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_setPointValue">
                              <Form.Label>Setpoint Value</Form.Label>
                              <InputGroup>
                                <Form.Control placeholder="value" defaultValue={characteristics[no].descriptiveElement.setpointValue.value} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'setpointValue', event.target.value, 'value')
                                }} />
                                <InputGroup.Append>
                                  <Form.Control placeholder="unit" defaultValue={characteristics[no].descriptiveElement.setpointValue.unit} onChange={(event) => {
                                    updateCharacteristics('descriptiveElement', 'setpointValue', event.target.value, 'unit')
                                  }} />
                                </InputGroup.Append>
                              </InputGroup>
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.descriptiveElements.showActualValues &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_descriptiveElement_actualValues">
                              <Form.Label>Actual Values</Form.Label>
                              <InputGroup>
                                <Form.Control placeholder="value" defaultValue={characteristics[no].descriptiveElement.actualValues.value} onChange={(event) => {
                                  updateCharacteristics('descriptiveElement', 'actualValues', event.target.value, 'value')
                                }} />
                                <InputGroup.Append>
                                  <Form.Control placeholder="unit" defaultValue={characteristics[no].descriptiveElement.setpointValue.unit} onChange={(event) => {
                                    updateCharacteristics('descriptiveElement', 'actualValues', event.target.value, 'unit')
                                  }} />
                                </InputGroup.Append>
                              </InputGroup>
                            </Form.Group>
                          </Form.Row>
                        }
                      </Form>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              }
              {config.propertiesPanel.defaultCharacteristics.showRelationalElementCard &&
                <Card>
                  <Card.Header>
                    <Accordion.Toggle as={Button} variant={Card.Header} eventKey="pp_characteristics_relationalElement">
                      <b>Relational Element</b>
                    </Accordion.Toggle>
                  </Card.Header>
                  <Accordion.Collapse eventKey="pp_characteristics_relationalElement">
                    <Card.Body>
                      <Form>
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showModel &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_model">
                              <Form.Label>Model</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.model} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'model', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showRegulationsforRelationalGeneration &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_rfrg">
                              <Form.Label>Regulations for Relational Generation</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.regulationsForRelationalGeneration} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'regulationsForRelationalGeneration', event.target.value)
                              }} />
                            </Form.Group>
                          </Form.Row>
                        }
                        {config.propertiesPanel.defaultCharacteristics.relationalElements.showView &&
                          <Form.Row>
                            <Form.Group as={Col} controlId="pp_characteristics_relationalElement_view">
                              <Form.Label>View</Form.Label>
                              <Form.Control defaultValue={characteristics[no].relationalElement.view} onChange={(event) => {
                                updateCharacteristics('relationalElement', 'view', event.target.value)
                              }} />

                            </Form.Group>
                          </Form.Row>
                        }
                      </Form>
                    </Card.Body>
                  </Accordion.Collapse>
                </Card>
              }

            </Accordion>
            <OverlayTrigger placement="auto" overlay={<Tooltip id={`tooltip-RemoveCharacterics${no}`}>
                   Removes the characteristic
                </Tooltip>}>
                <Button variant="secondary" onClick={() => removeCharacteristic()}><FontAwesomeIcon icon={faTrashAlt} /></Button>
                </OverlayTrigger>
            
          </Card.Body>
          
        </Accordion.Collapse>

      </Card>

    </div>)
}

