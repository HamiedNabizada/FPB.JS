import React, { useState, useEffect, useRef, memo } from 'react';

import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import XMLMapper from '../../xml/XMLMapper.js';
import { exportPNG } from '../../export/PngExporter.js';
import { exportPDF, exportMultiLayerPDF } from '../../export/PdfExporter.js';

// Regex pattern for invalid filename characters (Windows/Unix compatible)
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Validate filename and return sanitized version or error
function validateFilename(filename) {
    if (!filename || filename.trim() === '') {
        return { valid: false, error: 'Filename cannot be empty', sanitized: 'FPB' };
    }

    const trimmed = filename.trim();

    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(trimmed.toUpperCase())) {
        return { valid: false, error: `"${trimmed}" is a reserved filename`, sanitized: 'FPB' };
    }

    // Check for invalid characters
    if (INVALID_FILENAME_CHARS.test(trimmed)) {
        const sanitized = trimmed.replace(INVALID_FILENAME_CHARS, '_');
        return { valid: false, error: 'Filename contains invalid characters', sanitized };
    }

    // Check length (max 200 chars for safety)
    if (trimmed.length > 200) {
        return { valid: false, error: 'Filename is too long (max 200 characters)', sanitized: trimmed.substring(0, 200) };
    }

    return { valid: true, error: null, sanitized: trimmed };
}

const DownloadModal = memo(({ modeler, processes, selectedProcess, selectedElements }) => {
    const [show, setShow] = useState(false);
    const [informationLevel, setInformationLevel] = useState('1');
    const [exportAsEvent, setExportAsEvent] = useState(false);
    const [exportAsDownload, setExportAsDownload] = useState(false);
    const [information, setInformation] = useState('information1');
    const [filename, setFilename] = useState('FPB');
    const [eventName, setEventName] = useState('fpbjs');
    const [exportFormat, setExportFormat] = useState('json');
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState(null);
    const [filenameError, setFilenameError] = useState(null);

    const handleInformationLevel = (infoLevel) => {
        setInformationLevel(infoLevel);
    };
    
    const handleExportAsEvent = (ev) => {
        setExportAsEvent(ev);
    };
    
    const handleExportAsDownload = (ev) => {
        setExportAsDownload(ev);
    };
    
    const handleInformation = (inf) => {
        setInformation(inf);
    };
    
    const handleFilename = (fn) => {
        const validation = validateFilename(fn);
        setFilenameError(validation.valid ? null : validation.error);
        setFilename(validation.sanitized);
    };
    
    const handleEventname = (en) => {
        setEventName(en);
    };
    
    const handleExportFormat = (format) => {
        setExportFormat(format);
    };

    const eventBus = modeler.get('eventBus');
    const eventCallbackRef = useRef(null);

    // Register event listener in useEffect with cleanup to prevent memory leaks
    useEffect(() => {
        const handler = (e) => {
            // Event listener for export events
        };
        eventCallbackRef.current = handler;
        eventBus.on(eventName, handler);
        return () => {
            eventBus.off(eventName, handler);
        };
    }, [eventBus, eventName]);

    function download(dataStr, fileExtension = exportFormat) {
        let tempLink = document.createElement('a');
        tempLink.href = dataStr;
        tempLink.setAttribute('download', `${filename}.${fileExtension}`);
        document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
        tempLink.click();
        document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);
    }

    async function downloadSnapshot() {
        setIsExporting(true);
        setExportError(null);

        try {
            const result = await new Promise((resolve, reject) => {
                modeler.saveSVG({}, function (err, svg) {
                    if (err) {
                        reject(err);
                    } else if (!svg) {
                        reject(new Error('SVG generation returned empty result'));
                    } else {
                        resolve(svg);
                    }
                });
            });

            const dataStr = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(result);
            const tempLink = document.createElement('a');
            tempLink.href = dataStr;
            tempLink.setAttribute('download', `${filename}.svg`);
            document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
            tempLink.click();
            document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);
        } catch (error) {
            console.error('SVG export failed:', error);
            setExportError(`SVG export failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    }

    async function downloadPNG() {
        setIsExporting(true);
        setExportError(null);

        try {
            const svg = await new Promise((resolve, reject) => {
                modeler.saveSVG({}, (err, result) => {
                    if (err) reject(err);
                    else if (!result) reject(new Error('SVG generation returned empty result'));
                    else resolve(result);
                });
            });
            const pngDataUrl = await exportPNG(svg, { scale: 2 });
            const tempLink = document.createElement('a');
            tempLink.href = pngDataUrl;
            tempLink.setAttribute('download', `${filename}.png`);
            document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
            tempLink.click();
            document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);
        } catch (error) {
            console.error('PNG export failed:', error);
            setExportError(`PNG export failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    }

    async function downloadPDF() {
        setIsExporting(true);
        setExportError(null);

        try {
            const modeling = modeler.get('modeling');
            const canvas = modeler.get('canvas');
            const currentRoot = canvas.getRootElement();
            const layers = [];

            // processes prop contains Shapes from useProcessManagement
            for (const processShape of processes) {
                modeling.switchProcess(processShape);
                const svg = await new Promise((resolve, reject) => {
                    modeler.saveSVG({}, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
                const png = await exportPNG(svg, { scale: 2 });
                const name = processShape.businessObject?.identification?.shortName
                    || processShape.businessObject?.name
                    || processShape.id;
                layers.push({ name, pngDataUrl: png });
            }

            modeling.switchProcess(currentRoot);

            const pdfBlob = layers.length === 1
                ? exportPDF(layers[0].pngDataUrl, { title: layers[0].name })
                : exportMultiLayerPDF(layers);

            const blobUrl = URL.createObjectURL(pdfBlob);
            const tempLink = document.createElement('a');
            tempLink.href = blobUrl;
            tempLink.setAttribute('download', `${filename}.pdf`);
            document.getElementsByClassName('layerPanel')[0].appendChild(tempLink);
            tempLink.click();
            document.getElementsByClassName('layerPanel')[0].removeChild(tempLink);
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('PDF export failed:', error);
            setExportError(`PDF export failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    }

    function replacer(name, val) {
        if (informationLevel === '2') {
            if (name === 'elementVisualInformation') {
                return undefined;
            }
        }
        
        // Helper function to extract ID from various object structures
        const extractId = (item) => {
            if (typeof item === 'string') return item;
            if (!item) return item;
            // Check for different ID properties
            return item.id || item.uniqueIdent || item.$id || item;
        };
        
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
    }

    async function go() {
        // Validate export options
        if (!exportAsDownload && !exportAsEvent) {
            setExportError('Please select at least one export method (Event or Download)');
            return;
        }

        // Validate filename if downloading
        if (exportAsDownload) {
            const validation = validateFilename(filename);
            if (!validation.valid) {
                setExportError(`Invalid filename: ${validation.error}`);
                return;
            }
        }

        setIsExporting(true);
        setExportError(null);

        try {
            eventBus.fire('dataStore.updateAll', {});
            let data;
            let dataStr;
            let dataEdited;
            let contentType;

            // Get data based on information selection
            if (information === 'information1') {
                data = modeler.getProcesses();
            }
            if (information === 'information2') {
                data = modeler.getProcess(selectedProcess.id);
            }
            if (information === 'information3') {
                data = modeler.getSelectedElements(selectedProcess.id, selectedElements)
            }
            if (data === undefined) {
                throw new Error('No data available for export');
            }

            // Export based on format selection
            if (exportFormat === 'json') {
                dataEdited = JSON.stringify(data, replacer, 4);
                contentType = "data:text/json;charset=utf-8,";
            } else if (exportFormat === 'xml') {
                const xmlMapper = new XMLMapper();
                dataEdited = await xmlMapper.convertToXML(data);
                contentType = "data:text/xml;charset=utf-8,";
            } else {
                throw new Error(`Unsupported export format: ${exportFormat}`);
            }

            dataStr = contentType + encodeURIComponent(dataEdited);

            if (exportAsDownload) {
                download(dataStr, exportFormat);
            }

            if (exportAsEvent) {
                const eventData = exportFormat === 'json' ? JSON.parse(dataEdited) : dataEdited;
                eventBus.fire(eventName, {
                    data: eventData,
                    format: exportFormat
                });
            }

            handleClose();
        } catch (error) {
            console.error('Export failed:', error);
            setExportError(`Export failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsExporting(false);
        }
    }

    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    let tooltTipExportOptions = 'Export Options';
    
    return (
        <div className="download-properties" key='dl-properties'>
            <OverlayTrigger placement="auto" flip={true} overlay={<Tooltip id={`tooltip-uniqueId2`}>
                {tooltTipExportOptions}
            </Tooltip>}>
                <Button variant="secondary-outline" onClick={handleShow} >
                    <FontAwesomeIcon icon="download" size="lg" />
                </Button>
            </OverlayTrigger>
            <Modal bg="light" show={show} onHide={handleClose} centered size="xl">
                <Modal.Header>
                    <Container fluid>
                        <Row as={Modal.Title}>
                            <Col>Export Options</Col>
                            <Col md="auto">
                                <Button variant="secondary" size="sm">
                                <FontAwesomeIcon  icon="rectangle-xmark" size="lg" onClick={handleClose} />
                                </Button>
                                </Col>
                        </Row>
                    </Container>
                </Modal.Header>
                <Modal.Body>
                    <Row>
                        <Col>
                            <Forms_Format onInformationLevel={handleInformationLevel} onExportAsEvent={handleExportAsEvent} onExportAsDownload={handleExportAsDownload} onExportFormat={handleExportFormat} />
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
                    {exportError && (
                        <Alert variant="danger" onClose={() => setExportError(null)} dismissible className="w-100 mb-2">
                            {exportError}
                        </Alert>
                    )}
                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-svg-export`}>
                        Download current process as SVG
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { downloadSnapshot() }} disabled={isExporting}>
                            {isExporting ? (
                                <Spinner animation="border" size="sm" />
                            ) : (
                                <FontAwesomeIcon icon="file-image" size="lg" />
                            )}
                            {' '}SVG
                        </Button>
                    </OverlayTrigger>

                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-png-export`}>
                        Download current process as PNG image
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { downloadPNG() }} disabled={isExporting}>
                            {isExporting ? (
                                <Spinner animation="border" size="sm" />
                            ) : (
                                <FontAwesomeIcon icon="image" size="lg" />
                            )}
                            {' '}PNG
                        </Button>
                    </OverlayTrigger>

                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-pdf-export`}>
                        Download all processes as multi-page PDF
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { downloadPDF() }} disabled={isExporting}>
                            {isExporting ? (
                                <Spinner animation="border" size="sm" />
                            ) : (
                                <FontAwesomeIcon icon="file-pdf" size="lg" />
                            )}
                            {' '}PDF
                        </Button>
                    </OverlayTrigger>

                    <OverlayTrigger placement="top" overlay={<Tooltip id={`tooltip-export`}>
                        Export data in selected format
                    </Tooltip>}>
                        <Button variant="secondary" onClick={() => { go() }} disabled={isExporting}>
                            {isExporting ? (
                                <Spinner animation="border" size="sm" />
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

const Forms_Format = memo(function Forms_Format(props) {
    function handleInformationLevelChange(e) {
        props.onInformationLevel(e.target.value);
    }
    function handleExportAsDownloadChange(e) {
        props.onExportAsDownload(e.target.checked);
    }
    function handleExportAsEventChange(e) {
        props.onExportAsEvent(e.target.checked);
    }
    function handleExportFormatChange(e) {
        props.onExportFormat(e.target.value);
    }
    return (
        <Card>
            <Card.Header as="h5">Format</Card.Header>
            <Card.Body>
                <fieldset>
                    <Form.Group as={Row} onChange={(e) => { handleExportFormatChange(e) }}>
                        <Form.Label as="legend" column sm={4}>
                            <h6>File Format</h6>
                        </Form.Label>
                        <Col sm={6}>
                            <Form.Check
                                type="radio"
                                label="JSON"
                                name="exportFormat"
                                id="formatJSON"
                                value="json"
                                defaultChecked
                            />
                            <div>
                                <Form.Check
                                    type="radio"
                                    label="XML (Beta)"
                                    name="exportFormat"
                                    id="formatXML"
                                    value="xml"
                                />
                                <div style={{fontSize: '11px', color: '#6c757d', marginTop: '2px', marginLeft: '20px'}}>
                                    Based on: <a
                                        href="https://www.researchgate.net/publication/361951781_Vorschlag_fur_eine_XML-Reprasentation_der_Formalisierten_Prozessbeschreibung_nach_VDIVDE_3682"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{color: '#007bff', textDecoration: 'none'}}
                                        onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                                        onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                                    >
                                        Vorschlag für eine XML-Repräsentation der Formalisierten Prozessbeschreibung nach VDI/VDE 3682
                                    </a>
                                </div>
                            </div>
                        </Col>
                    </Form.Group>
                </fieldset>
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
                                defaultChecked
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
});

const Forms_Data = memo(function Forms_Data(props) {
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
});

const Forms_Event = memo(function Forms_Event(props) {
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
});

const Forms_Download = memo(function Forms_Download(props) {
    const [localError, setLocalError] = useState(null);

    function handleFilenameChange(e) {
        const value = e.target.value;
        const validation = validateFilename(value);
        setLocalError(validation.valid ? null : validation.error);
        props.onFileNameChange(value);
    }
    return (
        <Card>
            <Card.Header as="h5">Download</Card.Header>
            <Card.Body>
                <Form>
                    <Form.Group as={Row} controlId="formDownloadFileName">
                        <Form.Label as="legend" column sm={4}><h6>Filename</h6></Form.Label>
                        <Col>
                            <Form.Control
                                type="text"
                                defaultValue="FPB"
                                onChange={(e) => { handleFilenameChange(e) }}
                                isInvalid={!!localError}
                            />
                            <Form.Control.Feedback type="invalid">
                                {localError}
                            </Form.Control.Feedback>
                            <Form.Text className="text-muted">
                                Avoid special characters: {'< > : " / \\ | ? *'}
                            </Form.Text>
                        </Col>
                    </Form.Group>
                </Form>
            </Card.Body>
        </Card>
    )
});

export default DownloadModal;