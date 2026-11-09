/**
 * @file AdjustmentModals.js
 * @description Modales de gestion des ajustements de stock (pertes, casses).
 */

import React from 'react';
import { Modal, Form, Row, Col, Button, Spinner, Alert } from 'react-bootstrap';

/**
 * Composant regroupant les modales liées au workflow d'ajustement de stock.
 */
const AdjustmentModals = ({
    showAdjustmentModal, 
    setShowAdjustmentModal, 
    handleAdjustmentSubmit, 
    adjustmentFormData, 
    setAdjustmentFormData, 
    articles, 
    handleAdjustmentPhotoChange, 
    adjSubmitLoading,
    showValidationModal, 
    setShowValidationModal, 
    valDecision, 
    handleValSubmit, 
    selectedAdj, 
    valComment, 
    setValComment, 
    valLoading
}) => {
    return (
        <>
            {/* Modale de Déclaration (Gérant) */}
            <Modal show={showAdjustmentModal} onHide={() => setShowAdjustmentModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fw-bold">Déclarer un écart de stock</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleAdjustmentSubmit}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Article concerné</Form.Label>
                            <Form.Select required value={adjustmentFormData.article} onChange={e => setAdjustmentFormData({...adjustmentFormData, article: e.target.value})} className="rounded-pill shadow-sm">
                                <option value="">Choisir un article...</option>
                                {articles.map(a => <option key={a._id} value={a._id}>{a.nom} (Stock: {a.quantite})</option>)}
                            </Form.Select>
                        </Form.Group>
                        <Row>
                            <Col md={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted text-uppercase">Quantité perdue</Form.Label>
                                    <Form.Control type="number" min="1" required value={adjustmentFormData.quantite} onChange={e => setAdjustmentFormData({...adjustmentFormData, quantite: e.target.value})} className="rounded-pill shadow-sm" />
                                </Form.Group>
                            </Col>
                            <Col md={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted text-uppercase">Raison de l'écart</Form.Label>
                                    <Form.Select value={adjustmentFormData.raison} onChange={e => setAdjustmentFormData({...adjustmentFormData, raison: e.target.value})} className="rounded-pill shadow-sm">
                                        <option value="Casse">Casse</option>
                                        <option value="Perte">Perte</option>
                                        <option value="Vol">Vol</option>
                                        <option value="Péremption">Péremption</option>
                                        <option value="Erreur Inventaire">Erreur Inventaire</option>
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        </Row>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Justification détaillée</Form.Label>
                            <Form.Control as="textarea" rows={3} required value={adjustmentFormData.justification} onChange={e => setAdjustmentFormData({...adjustmentFormData, justification: e.target.value})} placeholder="Expliquez les circonstances..." className="rounded-4 shadow-sm" />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-bold text-primary small text-uppercase">
                                <iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Photo du justificatif
                            </Form.Label>
                            <Form.Control 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                onChange={handleAdjustmentPhotoChange} 
                                className="bg-light rounded-pill"
                            />
                            {adjustmentFormData.imageJustificatif && (
                                <div className="mt-3 text-center">
                                    <img src={adjustmentFormData.imageJustificatif} alt="Aperçu" className="img-fluid rounded-4 shadow-sm border" style={{maxHeight: '180px'}} />
                                    <p className="small text-muted mt-1">Photo prête pour envoi</p>
                                </div>
                            )}
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="rounded-pill px-4" onClick={() => setShowAdjustmentModal(false)}>Annuler</Button>
                        <Button variant="danger" type="submit" className="rounded-pill px-4 shadow-sm fw-bold" disabled={adjSubmitLoading}>
                            {adjSubmitLoading ? <Spinner size="sm" /> : 'Envoyer pour Validation'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modale de Validation/Rejet (Admin) */}
            <Modal show={showValidationModal} onHide={() => setShowValidationModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fw-bold">{valDecision === 'VALIDE' ? '✅ Valider l\'ajustement' : '❌ Rejeter l\'ajustement'}</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleValSubmit}>
                    <Modal.Body>
                        {valDecision === 'VALIDE' && (
                            <Alert variant="info" className="small rounded-4 border-0 shadow-sm">
                                En validant, la quantité de <strong>{selectedAdj?.quantite}</strong> sera définitivement retirée du stock de l'article <strong>{selectedAdj?.article?.nom}</strong>.
                            </Alert>
                        )}
                        <Form.Group>
                            <Form.Label className="small fw-bold text-muted text-uppercase">Commentaire ou motif {valDecision === 'REJETE' && <span className="text-danger">*</span>}</Form.Label>
                            <Form.Control as="textarea" rows={3} value={valComment} onChange={e => setValComment(e.target.value)} required={valDecision === 'REJETE'} placeholder="Ajoutez une observation..." className="rounded-4 shadow-sm" />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" className="rounded-pill px-4" onClick={() => setShowValidationModal(false)}>Annuler</Button>
                        <Button variant={valDecision === 'VALIDE' ? 'success' : 'danger'} type="submit" className="rounded-pill px-4 shadow-sm fw-bold" disabled={valLoading}>
                            {valLoading ? <Spinner size="sm" /> : (valDecision === 'VALIDE' ? 'Confirmer la validation' : 'Confirmer le rejet')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </>
    );
};


export default AdjustmentModals;