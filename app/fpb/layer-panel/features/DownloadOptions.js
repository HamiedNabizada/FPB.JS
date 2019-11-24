import React, { Component, useState } from 'react';

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Container from 'react-bootstrap/Container';



import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faPaperPlane, faFileImage, faWindowClose } from '@fortawesome/free-solid-svg-icons';



export default class DownloadOptions extends Component {
    constructor(props) {
        super(props);
    };

    render() {
        return (
            <div className="downloadButton">
                <DownloadModal props={this.props} />
            </div>
        )
    };
}

function DownloadModal(props) {
    const [show, setShow] = useState(false);
    var informationLevel;
    const handleInformationLevel = (infoLevel) => {
        informationLevel = infoLevel;

    }
    var exportAsEvent;
    const handleExportAsEvent = (ev) => {
        exportAsEvent = ev;
    }
    var exportAsDownload;
    const handleExportAsDownload = (ev) => {
        exportAsDownload = ev;
    }
    var information;
    const handleInformation = (inf) => {
        information = inf;
    }
    var filename = "FPB";
    const handleFilename = (fn) => {
        filename = fn;
    }
    var eventName = 'fpbjs';
    const handleEventname = (en) => {
        eventName = en;
    }

    const modeler = props.props.modeler;
    const eventBus = modeler.get('eventBus');
    var processes = props.props.processes;
    var selectedElements = props.props.selectedElements;
    var selectedProcess = props.props.selectedProcess;
    eventBus.on(eventName, (e) => {
        console.log(e)
    })

    function download(dataStr) {
        let tempLink = document.createElement('a');
        tempLink.href = dataStr;
        tempLink.setAttribute('download', `${filename}.json`);
        document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
        tempLink.click();
        document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);
    }

    function downloadSnapshot() {
        modeler.saveSVG({}, function (err, svg) {
            if (svg) {
                let dataStr = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
                let tempLink = document.createElement('a');
                tempLink.href = dataStr;
                tempLink.setAttribute('download', `${filename}.svg`);
                document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
                tempLink.click();
                document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);

            }
        });
    }
    function replacer(name, val) {
        if (informationLevel === '2') {
            if (name === 'elementVisualInformation') {
                return undefined;
            }
        }
        switch (name) {
            case 'elementsContainer':
            case 'consistsOfStates':
            case 'consistsOfProcessOperator':
            case 'consistsOfProcesses':
            case 'inTandemWith':
            case 'isAssignedTo':
            case 'incoming':
            case 'outgoing':
                if (Array.isArray(val)) {
                    let arr = [];
                    val.forEach((el) => {
                        arr.push(el.id)
                    })
                    return arr;
                }
                if (val.id) {
                    return val.id;
                }
            case 'sourceRef':
            case 'targetRef':
            case 'decomposedView':
            case 'parent':
            case 'consistsOfSystemLimit':
                console.log(name)
                console.log(val)
                return val.id;
            case 'isDecomposedProcessOperator':
                if (val === null) {
                    return null;
                } else {
                    return val.id;
                }
            case 'di':
            case 'children':
            case 'labels':
            case 'ProjectAssignment':
            case 'TemporaryFlowHint':
                return undefined;
            default: return val;
        }

    };

    function go() {
        eventBus.fire('dataStore.updateAll', {});
        let data;
        let dataStr;
        let dataEdited;
        if (information == 'information1') {
            data = modeler.getProcesses();
        }
        if (information == 'information2') {
            data = modeler.getProcess(selectedProcess.id);
        }
        if (information == 'information3') {
            data = modeler.getSelectedElements(selectedProcess.id, selectedElements)
        }
        if (data == undefined) {
            return;
        }

        dataEdited = JSON.stringify(data, replacer, 4);


        dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(dataEdited);
        if (exportAsDownload) {
            download(dataStr);
        }

        if (exportAsEvent) {
            eventBus.fire(eventName, {
                data: JSON.parse(dataEdited)
            })
        }
        handleClose();
    };

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    let tooltTipExportOptions = 'Export Options';
    return (
        <div className="download-properties" key='dl-properties'>
            <OverlayTrigger placement="auto" overlay={<Tooltip id={`tooltip-uniqueId2`}>
                {tooltTipExportOptions}
            </Tooltip>}>
                <Button variant="secondary-outline" onClick={handleShow} >
                    <FontAwesomeIcon icon={faDownload} size="lg" />
                </Button>
            </OverlayTrigger>
            <Modal bg="light" show={show} onHide={handleClose} centered size="xl">
                <Modal.Header>
                    <Container fluid>
                        <Row as={Modal.Title}>
                            <Col>Export Options</Col>
                            <Col md="auto">
                                <Button variant="secondary" size="sm">
                                <FontAwesomeIcon  icon={faWindowClose} size="lg" onClick={handleClose} />
                                </Button>
                                </Col>
                        </Row>
                    </Container>
                </Modal.Header>
                <Modal.Body>
                    <Row>
                        <Col>
                            <Forms_Format onInformationLevel={handleInformationLevel} onExportAsEvent={handleExportAsEvent} onExportAsDownload={handleExportAsDownload} />
                        </Col>
                        <Col>
                            <Forms_Data onInformationChange={handleInformation} />
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            <Forms_Event onEventnameChange={handleEventname} />
                        </Col>
                        <Col>
                            <Forms_Download onFileNameChange={handleFilename} />
                        </Col>
                    </Row>


                </Modal.Body>
                <Modal.Footer>
                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-uniqueId`}>
                        Downloads a snapshot of the current process as SVG.
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { downloadSnapshot() }}>
                            <FontAwesomeIcon icon={faFileImage} size="lg" />
                        </Button>
                    </OverlayTrigger>

                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-uniqueId`}>
                        Export
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { go() }}>
                            <FontAwesomeIcon icon={faPaperPlane} size="lg" />
                        </Button>
                    </OverlayTrigger>

                </Modal.Footer>
            </Modal>
        </div>
    );
};

function Forms_Format(props) {
    function handleInformationLevelChange(e) {
        props.onInformationLevel(e.target.value);
    };
    function handleExportAsDownloadChange(e) {
        props.onExportAsDownload(e.target.checked);
    }
    function handleExportAsEventChange(e) {
        props.onExportAsEvent(e.target.checked);
    }
    return (
        <Card>
            <Card.Header as="h5">Format</Card.Header>
            <Card.Body>
                <fieldset>
                    <Form.Group as={Row} onChange={(e) => { handleInformationLevelChange(e) }}>
                        <Form.Label as="legend" column sm={4}>
                            <h6>Information Level</h6>
                        </Form.Label>
                        <Col sm={6}>
                            <Form.Check
                                type="radio"
                                label="Total"
                                name="informationLevel"
                                id="informationLevel1"
                                value="1"

                            />
                            <Form.Check
                                type="radio"
                                label="Without Graphic Information"
                                name="informationLevel"
                                id="informationLevel2"
                                value="2"
                            />
                        </Col>
                    </Form.Group>
                </fieldset>
                <fieldset>
                    <Form.Group as={Row}>
                        <Form.Label as="legend" column sm={4}>
                            <h6>Export as</h6>
                        </Form.Label>
                        <Col sm={6}>
                            <Form.Check
                                type="checkbox"
                                label="Event"
                                name="export"
                                id="export1"
                                onChange={(e) => { handleExportAsEventChange(e) }}

                            />
                            <Form.Check
                                type="checkbox"
                                label="Download"
                                name="export"
                                id="export2"
                                onChange={(e) => { handleExportAsDownloadChange(e) }}
                            />
                        </Col>
                    </Form.Group>
                </fieldset>
            </Card.Body>
        </Card>


    )
}

function Forms_Data(props) {
    function handleChange(e) {
        props.onInformationChange(e.target.id)
    }
    return (

        <Card>
            <Card.Header as="h5">Data</Card.Header>
            <Card.Body>
                <fieldset>
                    <Form.Group as={Row} >
                        <Form.Label as="legend" column sm={4}>
                            <h6>Information</h6>
                        </Form.Label>
                        <Col sm={6}>
                            <Form.Check
                                type="radio"
                                label="All Processes"
                                name="information"
                                id="information1"
                                onChange={(e) => handleChange(e)}

                            />
                            <Form.Check
                                type="radio"
                                label="Actual Process"
                                name="information"
                                id="information2"
                                onChange={(e) => handleChange(e)}

                            />
                            <Form.Check
                                type="radio"
                                label="Selected Elements"
                                name="information"
                                id="information3"
                                onChange={(e) => handleChange(e)}
                            />
                        </Col>
                    </Form.Group>
                </fieldset>

            </Card.Body>
        </Card>
    )
}

function Forms_Event(props) {
    function handleEventNameChange(e) {
        props.onEventnameChange(e.target.value)
    }

    return (

        <Card>
            <Card.Header as="h5">Event</Card.Header>
            <Card.Body>
                <Card.Text>
                    The desired information will be sent to interested applications via the event bus.
                        </Card.Text>

                <Form>
                    <Form.Group as={Row} controlId="formEvent">
                        <Form.Label as="legend" column sm={4}><h6>Eventname</h6></Form.Label>
                        <Col>
                            <Form.Control type="text" defaultValue="fpbjs" onChange={(e) => { handleEventNameChange(e) }} />
                        </Col>
                    </Form.Group>
                </Form>
            </Card.Body>
        </Card>


    )
}

function Forms_Download(props) {
    function handleFilenameChange(e) {
        props.onFileNameChange(e.target.value);
    }
    return (
        <Card>
            <Card.Header as="h5">Download</Card.Header>
            <Card.Body>
                <Form>
                    <Form.Group as={Row} controlId="formDownloadFileName">
                        <Form.Label as="legend" column sm={4}><h6>Filename</h6></Form.Label>
                        <Col>
                            <Form.Control type="text" defaultValue="FPB" onChange={(e) => { handleFilenameChange(e) }} />
                        </Col>
                    </Form.Group>
                </Form>
            </Card.Body>
        </Card>
    )
}




