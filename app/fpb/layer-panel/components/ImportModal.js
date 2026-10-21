import React, { useState, memo, useEffect, useRef } from 'react';

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Container from 'react-bootstrap/Container';
import Alert from 'react-bootstrap/Alert';
import Form from 'react-bootstrap/Form';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useError } from '../../context/ErrorContext';
import XMLMapper from '../../xml/XMLMapper.js';
import useReadOnly from '../../read-only/useReadOnly';
import { isAmlText as isAml } from '../../aml/detect';
import { useThemeAttributes } from '../hooks/useThemeAttributes';

const ImportModal = memo(({ modeler }) => {
    const themeAttributes = useThemeAttributes(modeler);
    const [show, setShow] = useState(false);
    // read-only: an import would replace the model the user only looks at
    const readOnly = useReadOnly(modeler);
    useEffect(() => {
        if (readOnly) {
            setShow(false);
        }
    }, [readOnly]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [fileData, setFileData] = useState(null);
    const [fileName, setFileName] = useState('');
    const [fileType, setFileType] = useState('json');
    const [isDragging, setIsDragging] = useState(false);
    // AutomationML: the text, its FPD hierarchies and the one to open (feature 028)
    const [aml, setAml] = useState(null);
    const [hierarchyId, setHierarchyId] = useState(null);
    const { showError } = useError();
    const fileLabelRef = useRef();

    const eventBus = modeler.get('eventBus');
    // AML only when the host added the AML module (the web app does)
    const amlSupport = modeler.get('amlSupport', false);
    const defaultText = amlSupport
        ? 'Import a local stored FPB.js JSON file, XML file or AutomationML (.aml) file, or drop it here'
        : 'Import a local stored FPB.js JSON file or XML file, or drop it here';
    let fileReader;
    
    useEffect(() => {
        // The notification itself comes from ImportNotificationBridge, which
        // is mounted even while the panel is collapsed.
        // Busy ends with the import, however it ends: before, only an error
        // reset it, and after the first good import the button stayed on
        // "Importing..." until the page was reloaded.
        const handleImportEnd = () => {
            setIsImporting(false);
        };

        eventBus.on('import.error', handleImportEnd);
        eventBus.on('import.done', handleImportEnd);

        return () => {
            eventBus.off('import.error', handleImportEnd);
            eventBus.off('import.done', handleImportEnd);
        };
    }, [eventBus]);

    const handleFileRead = async (e) => {
        try {
            const fileContent = fileReader.result;

            // AutomationML: everything else in the file is kept for the AML export
            if (isAml(fileContent)) {
                if (!amlSupport) {
                    throw new Error('AutomationML files are not supported in this installation of FPB.js.');
                }
                setFileType('aml');
                setFileData(null);
                const hierarchies = await amlSupport.inspect(fileContent);
                setAml({ text: fileContent, hierarchies });
                setHierarchyId(hierarchies.length ? hierarchies[0].id : null);
                return;
            }
            setAml(null);

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
            } else if (amlSupport && fileName.endsWith('.aml')) {
                detectedFileType = 'aml';
            } else {
                showError(
                    'Invalid file type',
                    amlSupport
                        ? 'Please select a valid JSON (.json), XML (.xml) or AutomationML (.aml) file'
                        : 'Please select a valid JSON (.json) or XML (.xml) file'
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
            setAml(null);
            setFileData(null);
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
        if (aml) {
            setIsImporting(true);
            amlSupport.importAml(aml.text, { fileName, hierarchyId }).then((result) => {
                // without FPD content the model starts empty: no import runs
                if (!result.hierarchy) {
                    setIsImporting(false);
                }
            }).catch((error) => {
                showError('Import failed', `The AutomationML file could not be imported: ${error.message}`);
                setIsImporting(false);
            });
            handleClose();
            return;
        }
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
            setAml(null);
            setHierarchyId(null);
        }
    };

    const handleShow = () => setShow(true);

    // The whole dialog body takes a dropped file, so it need not hit the label.
    // Without preventDefault the browser would open the dropped file itself.
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDragging(false);
        }
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
            handleFileChosen(file);
        }
    };
    let tooltTipImportOptions = readOnly ? 'Import (not in read-only mode)' : 'Import Options';

    return (
        <div className="upload-properties" key='ul-properties'>
            <OverlayTrigger trigger={['hover', 'focus']} placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId2_upload`}>
                {tooltTipImportOptions}
            </Tooltip>}>
                <Button id="importOptionsButton" variant="secondary-outline" onClick={handleShow} disabled={readOnly} aria-label={tooltTipImportOptions}>
                    <FontAwesomeIcon icon="upload" size="lg" />
                </Button>
            </OverlayTrigger>

            <Modal bg="light" show={show} onHide={handleClose} centered  {...themeAttributes}>
                <Modal.Header>
                    <Container fluid>
                        <Row as={Modal.Title}>
                            <Col>Import Options</Col>
                            <Col md="auto">
                                <Button variant="secondary" size="sm" aria-label="Close import options" onClick={handleClose}>
                                    <FontAwesomeIcon icon="rectangle-xmark" size="lg" />
                                </Button>
                            </Col>
                        </Row>
                    </Container>
                </Modal.Header>
                <Modal.Body onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                    <Container>
                        <Row>
                            <input type="file"
                                id='file'
                                className='inputfile'
                                accept={amlSupport ? '.json,.xml,.aml' : '.json,.xml'}
                                onChange={e => handleFileChosen(e.target.files[0])} />

                            <label htmlFor="file" ref={fileLabelRef} className={isDragging ? 'fileLabel fileLabel--dragover' : 'fileLabel'}> 
                                {fileName || defaultText} 
                            </label>
                        </Row>
                        {aml && aml.hierarchies.length > 1 && (
                            <Row className="aml-hierarchies">
                                <Form.Label as="legend" id="aml-hierarchies-label">
                                    The file contains {aml.hierarchies.length} process views. Which one should FPB.js open?
                                    The others stay unchanged in the file.
                                </Form.Label>
                                <div role="radiogroup" aria-labelledby="aml-hierarchies-label">
                                    {aml.hierarchies.map((h) => (
                                        <Form.Check
                                            key={h.id}
                                            type="radio"
                                            id={'aml-hierarchy-' + h.id}
                                            name="aml-hierarchy"
                                            label={h.name || h.id}
                                            checked={hierarchyId === h.id}
                                            onChange={() => setHierarchyId(h.id)}
                                        />
                                    ))}
                                </div>
                            </Row>
                        )}
                        {aml && !aml.hierarchies.length && (
                            <Row>
                                <Alert variant="info" className="aml-no-fpd">
                                    The file contains no FPD process. FPB.js starts with an empty model;
                                    exporting as AML adds the process to this file and keeps everything else in it.
                                </Alert>
                            </Row>
                        )}
                    </Container>
                </Modal.Body>
                <Modal.Footer>
                    <OverlayTrigger trigger={['hover', 'focus']} placement="top" overlay={<Tooltip id={`tooltip-uniqueId`}>
                        Import
                    </Tooltip>}>
                        <Button 
                            variant="secondary" 
                            onClick={() => { go() }}
                            disabled={!selectedFile || isImporting || (fileType === 'aml' && !aml)}
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
