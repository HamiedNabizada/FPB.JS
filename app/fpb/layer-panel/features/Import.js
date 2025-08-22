import React, { useState, memo, useEffect, useRef } from 'react';

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Container from 'react-bootstrap/Container';
import Alert from 'react-bootstrap/Alert';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useError } from '../../context/ErrorContext';

const Import = memo(({ modeler }) => {
    return (
        <div className="importButton">
            <ImportModal modeler={modeler} />
        </div>
    );
});

export default Import;

const ImportModal = memo(({ modeler }) => {
    const [show, setShow] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [fileData, setFileData] = useState(null);
    const [fileName, setFileName] = useState('');
    const [fileType, setFileType] = useState('json');
    const { showError } = useError();
    const fileLabelRef = useRef();

    const eventBus = modeler.get('eventBus');
    const defaultText = 'Import a local stored FPB.JS JSON or XML file';
    let fileReader;
    
    // Listen for import errors
    useEffect(() => {
        const handleImportError = (event) => {
            const { message, details } = event;
            showError(message, details);
            setIsImporting(false);
        };
        
        eventBus.on('import.error', handleImportError);
        
        return () => {
            eventBus.off('import.error', handleImportError);
        };
    }, [eventBus, showError]);

    const handleFileRead = (e) => {
        try {
            const fileContent = fileReader.result;
            
            // Detect file type from content instead of relying on state
            let actualFileType;
            if (fileContent.trim().startsWith('<')) {
                actualFileType = 'xml';
            } else {
                actualFileType = 'json';
            }
            
            console.log('Import: handleFileRead - detected fileType:', actualFileType);
            console.log('Import: handleFileRead - content start:', fileContent.substring(0, 50));
            
            if (actualFileType === 'json') {
                console.log('Import: Parsing as JSON');
                const parsedData = JSON.parse(fileContent);
                setFileData(parsedData);
            } else if (actualFileType === 'xml') {
                console.log('Import: Processing as XML');
                // For XML files, we pass the raw XML string
                setFileData(fileContent);
            }
            
            // Update the fileType state to match what we detected
            if (fileType !== actualFileType) {
                setFileType(actualFileType);
            }
        } catch (error) {
            console.log('Import: Error in handleFileRead:', error);
            const detectedType = fileContent && fileContent.trim().startsWith('<') ? 'xml' : 'json';
            showError(
                `Invalid ${detectedType.toUpperCase()} file`,
                `The selected file contains invalid ${detectedType.toUpperCase()} data: ${error.message}`
            );
            setIsImporting(false);
            setFileData(null);
        }
    };

    const handleFileChosen = (file) => {
        if (file) {
            // Validate file type and determine format
            const fileName = file.name.toLowerCase();
            let detectedFileType;
            
            if (fileName.endsWith('.json')) {
                detectedFileType = 'json';
            } else if (fileName.endsWith('.xml')) {
                detectedFileType = 'xml';
            } else {
                showError(
                    'Invalid file type',
                    'Please select a valid JSON (.json) or XML (.xml) file'
                );
                return;
            }
            
            setFileType(detectedFileType);
            
            // Validate file size (max 50MB)
            if (file.size > 50 * 1024 * 1024) {
                showError(
                    'File too large',
                    'The selected file is too large. Maximum file size is 50MB.'
                );
                return;
            }
            
            setSelectedFile(file);
            setFileName(file.name);
            fileReader = new FileReader();

            fileReader.onloadend = handleFileRead;
            fileReader.onerror = () => {
                showError(
                    'File read error',
                    'Unable to read the selected file. Please try again with a different file.'
                );
                setIsImporting(false);
            };
            fileReader.readAsText(file);
        }
    }
    function go() {
        if (fileData) {
            setIsImporting(true);
            try {
                if (fileType === 'json') {
                    eventBus.fire('FPBJS.import', {
                        data: fileData
                    });
                } else if (fileType === 'xml') {
                    eventBus.fire('FPBJS.import.xml', {
                        data: fileData
                    });
                }
                handleClose();
            } catch (error) {
                showError(
                    'Import failed',
                    `An error occurred during import: ${error.message}`
                );
                setIsImporting(false);
            }
        } else {
            showError(
                'No file selected',
                `Please select a valid ${fileType.toUpperCase()} file before importing.`
            );
        }
    };

    const handleClose = () => {
        if (!isImporting) {
            setShow(false);
            setSelectedFile(null);
            setFileData(null);
            setFileName('');
        }
    };
    const handleShow = () => setShow(true);
    let tooltTipImportOptions = 'Import Options';

    return (
        <div className="upload-properties" key='ul-properties'>

            <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId2_upload`}>
                {tooltTipImportOptions}
            </Tooltip>}>
                <Button variant="secondary-outline" onClick={handleShow} >
                    <FontAwesomeIcon icon="upload" size="lg" />
                </Button>
            </OverlayTrigger>

            <Modal bg="light" show={show} onHide={handleClose} centered >
                <Modal.Header>
                    <Container fluid>
                        <Row as={Modal.Title}>
                            <Col>Import Options</Col>
                            <Col md="auto">
                                <Button variant="secondary" size="sm">
                                    <FontAwesomeIcon icon="rectangle-xmark" size="lg" onClick={handleClose} />

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
                                accept='.json,.xml'
                                onChange={e => handleFileChosen(e.target.files[0])} />

                            <label htmlFor="file" ref={fileLabelRef} className="fileLabel"> 
                                {fileName || defaultText} 
                            </label>
                        </Row>

                    </Container>


                </Modal.Body>
                <Modal.Footer>
                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-uniqueId`}>
                        Import
                    </Tooltip>}>
                        <Button 
                            variant="secondary" 
                            onClick={() => { go() }}
                            disabled={!selectedFile || isImporting}
                        >
                            {isImporting ? (
                                <>
                                    <FontAwesomeIcon icon="spinner" spin size="lg" className="me-2" />
                                    Importing...
                                </>
                            ) : (
                                <FontAwesomeIcon icon="paper-plane" size="lg" />
                            )}
                        </Button>
                    </OverlayTrigger>

                </Modal.Footer>
            </Modal>
        </div>
    );
});