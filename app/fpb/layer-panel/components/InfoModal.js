import React, { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Table from 'react-bootstrap/Table';
import Badge from 'react-bootstrap/Badge';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Nav from 'react-bootstrap/Nav';
import Tab from 'react-bootstrap/Tab';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const InfoModal = ({ show, onHide }) => {
  const [activeKey, setActiveKey] = useState('about');
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    {
      category: 'Zoom & Navigation',
      items: [
        { keys: [`${ctrlKey}++`], description: 'Zoom in' },
        { keys: [`${ctrlKey}+-`], description: 'Zoom out' },
        { keys: [`${ctrlKey}+0`], description: 'Reset zoom' },
        { keys: [`${ctrlKey}+Arrow Keys`], description: 'Pan canvas' },
        { keys: ['Space + Mouse'], description: 'Hand tool (drag canvas)' }
      ]
    },
    {
      category: 'Element Movement',
      items: [
        { keys: ['Arrow Keys'], description: 'Move selected elements (1px)' },
        { keys: ['Shift+Arrow Keys'], description: 'Move selected elements (10px)' },
        { keys: ['Escape'], description: 'Cancel current operation' }
      ]
    },
    {
      category: 'Canvas Panning',
      items: [
        { keys: [`${ctrlKey}+Shift+Arrow Keys`], description: 'Fast canvas pan (200px)' },
        { keys: [`${ctrlKey}+Arrow Keys`], description: 'Slow canvas pan (50px)' }
      ]
    }
  ];

  const renderKeyBadge = (key) => (
    <Badge key={key} bg="secondary" className="me-1">
      {key}
    </Badge>
  );

  return (
    <Modal bg="light" show={show} onHide={onHide} size="lg" centered>
      <Modal.Header>
        <Container fluid>
          <Row as={Modal.Title}>
            <Col>FPB.js Information</Col>
            <Col md="auto">
              <Button variant="secondary" size="sm" onClick={onHide}>
                <FontAwesomeIcon icon="rectangle-xmark" size="lg" />
              </Button>
            </Col>
          </Row>
        </Container>
      </Modal.Header>
      
      <Modal.Body>
        <Container>
          <Tab.Container activeKey={activeKey} onSelect={(k) => setActiveKey(k)}>
            <Row>
              <Col sm={3}>
                <Nav className="flex-column">
                  <Nav.Item>
                    <Nav.Link 
                      eventKey="about" 
                      className={`text-dark border-0 ${activeKey === 'about' ? 'bg-light' : ''}`}
                      style={{ borderRadius: '0.25rem' }}
                    >
                      <FontAwesomeIcon icon="info-circle" className="me-2" />
                      About
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link 
                      eventKey="shortcuts" 
                      className={`text-dark border-0 ${activeKey === 'shortcuts' ? 'bg-light' : ''}`}
                      style={{ borderRadius: '0.25rem' }}
                    >
                      <FontAwesomeIcon icon="keyboard" className="me-2" />
                      Keyboard Shortcuts
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link 
                      eventKey="help" 
                      className={`text-dark border-0 ${activeKey === 'help' ? 'bg-light' : ''}`}
                      style={{ borderRadius: '0.25rem' }}
                    >
                      <FontAwesomeIcon icon="folder" className="me-2" />
                      Help
                    </Nav.Link>
                  </Nav.Item>
                </Nav>
              </Col>
              <Col sm={9}>
                <Tab.Content>
                  <Tab.Pane eventKey="about">
                    <h5>FPB.js</h5>
                    <p className="text-muted">
                      A JavaScript library for creating formalized process descriptions according to VDI/VDE 3682 standard.
                    </p>
                  </Tab.Pane>
                  
                  <Tab.Pane eventKey="shortcuts">
                    <h5>Available Keyboard Shortcuts</h5>
                    <p className="text-muted mb-3">
                      Use these keyboard shortcuts to navigate:
                    </p>

                    {shortcuts.map((section, index) => (
                      <div key={index} className="mb-4">
                        <h6 className="mb-2">
                          <FontAwesomeIcon icon="folder" className="me-2" />
                          {section.category}
                        </h6>
                        
                        <Table striped bordered hover size="sm">
                          <thead>
                            <tr>
                              <th style={{width: '40%'}}>Key Combination</th>
                              <th>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.items.map((item, itemIndex) => (
                              <tr key={itemIndex}>
                                <td>
                                  {item.keys.map(renderKeyBadge)}
                                </td>
                                <td>{item.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    ))}
                  </Tab.Pane>
                  
                  <Tab.Pane eventKey="help">
                    <h5>Report Issues</h5>
                    <p>
                      Found a bug or have a feature request? Please report it on our GitHub repository:
                    </p>
                    <p>
                      <a href="https://github.com/hamiedNabizada/fpb.js/issues" target="_blank" rel="noopener noreferrer">
                        <FontAwesomeIcon icon="folder" className="me-2" />
                        GitHub Issues
                      </a>
                    </p>
                  </Tab.Pane>
                </Tab.Content>
              </Col>
            </Row>
          </Tab.Container>
        </Container>
      </Modal.Body>
    </Modal>
  );
};

export default InfoModal;