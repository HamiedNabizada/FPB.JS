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
import XMLMapper from '../../xml/XMLMapper.js';

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
    const defaultText = 'Import a local stored FPB.js JSON file or XML file';
    let fileReader;
    
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

    const handleFileRead = async (e) => {
        try {
            const fileContent = fileReader.result;
            
            // Auto-detect file type using the mapper
            const detectedType = XMLMapper.detectFileType(fileContent);
            
            if (detectedType === 'fpb-json') {
                // Handle JSON format
                const parsedData = JSON.parse(fileContent);
                setFileData(parsedData);
                setFileType('json');
            } else if (detectedType === 'vdi-xml') {
                // Handle XML format
                const xmlMapper = new XMLMapper();
                const convertedData = await xmlMapper.convertFromXML(fileContent);
                setFileData(convertedData);
                setFileType('xml');
            } else {
                // Try to parse as JSON as fallback
                try {
                    const parsedData = JSON.parse(fileContent);
                    setFileData(parsedData);
                    setFileType('json');
                } catch (jsonError) {
                    throw new Error('File format not recognized. Please select a valid FPB.js JSON file or XML file.');
                }
            }
            
        } catch (error) {
            console.error('Import: File parsing failed:', error);
            showError(
                'Invalid file format',
                `The selected file could not be parsed: ${error.message}`
            );
            setIsImporting(false);
            setFileData(null);
        }
    };

    const handleFileChosen = (file) => {
        if (file) {
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
                eventBus.fire('FPBJS.import', {
                    data: fileData
                });
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

export default ImportModal;