/**
 * @file ClientModal.js
 * @description Composant React.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Row, Col, Spinner } from 'react-bootstrap';
import { clientAPI } from '../../services/api';

const ClientModal = ({ show, onHide, clientToEdit, onSuccess }) => {
    const [currentClient, setCurrentClient] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [modalError, setModalError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (show) {
            setModalError('');
            if (clientToEdit) {
                setCurrentClient(clientToEdit);
                setEditMode(true);
            } else {
// Default for new client
                setCurrentClient({ vcLastName: '', vcFirstName: '', vcEmail: '', vcPhoneNumber: '', vcQuartier: '', vcCity: '', customerTypeCode: 'INDIVIDUAL' });
                setEditMode(false);
            }
        }
    }, [show, clientToEdit]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCurrentClient(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setModalError('');
        setLoading(true);
        
        try {
            let response;
            if (editMode) {
                response = await clientAPI.update(currentClient.customerId, currentClient);
            } else {
                response = await clientAPI.create(currentClient);
            }
            onSuccess(response, editMode); // response is already the extracted data (interceptor)
        } catch (err) {
            setModalError(err.response?.data?.message || "Erreur d'enregistrement");
        } finally {
            setLoading(false);
        }
    };

    if (!currentClient) return null; // Ne rien rendre si le client n'est pas prêt

    return (
        <Modal show={show} onHide={onHide}>
            <Modal.Header closeButton>
                <Modal.Title>{editMode ? 'Modifier le Client' : 'Nouveau Client / Ouvrier'}</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {modalError && <Alert variant="danger">{modalError}</Alert>}
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Nom</Form.Label>
                                <Form.Control type="text" name="vcLastName" value={currentClient.vcLastName} onChange={handleChange} required />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Prénom</Form.Label>
                                <Form.Control type="text" name="vcFirstName" value={currentClient.vcFirstName} onChange={handleChange} required />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Téléphone</Form.Label>
                                <Form.Control type="text" name="vcPhoneNumber" value={currentClient.vcPhoneNumber} onChange={handleChange} />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control type="email" name="vcEmail" value={currentClient.vcEmail} onChange={handleChange} placeholder="client@exemple.com" />
                    </Form.Group>
{/* Adresse supprimée - pas de champ SQL correspondant */}
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Quartier</Form.Label>
                                <Form.Control type="text" name="vcQuartier" value={currentClient.vcQuartier} onChange={handleChange} placeholder="Ex: Madina" />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Ville</Form.Label>
                                <Form.Control type="text" name="vcCity" value={currentClient.vcCity} onChange={handleChange} placeholder="Ex: Conakry" />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Form.Group className="mb-3">
                        <Form.Label>Type</Form.Label>
                        <Form.Select name="customerTypeCode" value={currentClient.customerTypeCode} onChange={handleChange}>
                            <option value="INDIVIDUAL">Client Standard</option>
                            <option value="WORKER">Ouvrier / Apporteur d'affaires</option>
                        </Form.Select>
                    </Form.Group>
                    
                    {/* Commission non gérée dans tblCustomer SQL - supprimé */}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide} disabled={loading}>Annuler</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? <Spinner as="span" size="sm" /> : 'Enregistrer'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default ClientModal;