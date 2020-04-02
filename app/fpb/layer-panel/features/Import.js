import React, { Component, useState } from 'react';

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Container from 'react-bootstrap/Container';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faPaperPlane, faWindowClose } from '@fortawesome/free-solid-svg-icons';

export default class Import extends Component {
    constructor(props) {
        super(props);
    };

    render() {
        return (
            <div className="importButton">
                <ImportModal props={this.props} />
            </div>
        )
    };
}

function ImportModal(props) {
    const [show, setShow] = useState(false);

    const modeler = props.props.modeler;
    const eventBus = modeler.get('eventBus');
    const defaultText = 'Import a local stored FPB.JS JSON file';
    let fileReader;
    let data;

    const handleFileRead = (e) => {
        data = JSON.parse(fileReader.result);
    };

    const handleFileChosen = (file) => {
        if (file) {
            document.getElementById('fileLabel').innerHTML = file.name;
            fileReader = new FileReader();

            fileReader.onloadend = handleFileRead;
            fileReader.readAsText(file);
        }
    }
    function go() {
        if (data) {
            eventBus.fire('FPBJS.import', {
                data: data
            })
        }
        handleClose();
    };

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    let tooltTipImportOptions = 'Import Options';

    return (
        <div className="upload-properties" key='ul-properties'>

            <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId2_upload`}>
                {tooltTipImportOptions}
            </Tooltip>}>
                <Button variant="secondary-outline" onClick={handleShow} >
                    <FontAwesomeIcon icon={faUpload} size="lg" />
                </Button>
            </OverlayTrigger>

            <Modal bg="light" show={show} onHide={handleClose} centered >
                <Modal.Header>
                    <Container fluid>
                        <Row as={Modal.Title}>
                            <Col>Import Options</Col>
                            <Col md="auto">
                                <Button variant="secondary" size="sm">
                                    <FontAwesomeIcon icon={faWindowClose} size="lg" onClick={handleClose} />
                                </Button>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Header>
                <Modal.Body>
                    <Container>
                        <Row>
                            <input type="file"
                                id='file'
                                className='inputfile'
                                accept='.json'
                                onChange={e => handleFileChosen(e.target.files[0])} />

                            <label htmlFor="file" id="fileLabel" className="fileLabel"> {defaultText} </label>
                        </Row>

                    </Container>


                </Modal.Body>
                <Modal.Footer>
                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-uniqueId`}>
                        Import
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