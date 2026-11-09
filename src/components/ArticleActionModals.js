/**
 * @file ArticleActionModals.js
 * @description Composant React.
 */

import React from 'react';
import { Modal, Button, Alert, Form, Table, Spinner } from 'react-bootstrap';

const ArticleActionModals = ({
    showDeleteModal, setShowDeleteModal, executeDelete,
    showAutoPromoModal, setShowAutoPromoModal, handleAutoPromoSubmit, autoPromoConfig, setAutoPromoConfig, autoPromoLoading,
    showReceptionModal, setShowReceptionModal, handleFinalReception, selectedMovement, receptionItems, setReceptionItems, globalReceptionComment, setGlobalReceptionComment, valLoading
}) => {
    return (
        <>
            {/* Modale de Suppression */}
            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
                <Modal.Header closeButton><Modal.Title className="text-danger">⚠️ Suppression d'Article</Modal.Title></Modal.Header>
                <Modal.Body>
                    <p className="fw-bold">Êtes-vous sûr de vouloir supprimer cet article ?</p>
                    <Alert variant="warning" className="mb-0 small">Cette action est irréversible.</Alert>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
                    <Button variant="danger" onClick={executeDelete}>Supprimer définitivement</Button>
                </Modal.Footer>
            </Modal>

            {/* Modale Promo Automatique */}
            <Modal show={showAutoPromoModal} onHide={() => setShowAutoPromoModal(false)} centered>
                <Modal.Header closeButton><Modal.Title>Promotions Automatiques</Modal.Title></Modal.Header>
                <Form onSubmit={handleAutoPromoSubmit}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Articles expirant dans (jours) :</Form.Label>
                            <Form.Control type="number" value={autoPromoConfig.jours} onChange={e => setAutoPromoConfig({...autoPromoConfig, jours: e.target.value})} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Réduction (%) :</Form.Label>
                            <Form.Control type="number" value={autoPromoConfig.pourcentage} onChange={e => setAutoPromoConfig({...autoPromoConfig, pourcentage: e.target.value})} required />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowAutoPromoModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={autoPromoLoading}>{autoPromoLoading ? <Spinner size="sm" /> : 'Appliquer'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modale de Réception Détaillée */}
            <Modal show={showReceptionModal} onHide={() => setShowReceptionModal(false)} size="lg" centered>
                <Modal.Header closeButton>
                    {/* 🟢 CORRECTION ICI : Utilisation de String() pour éviter le crash sur _id qui est un nombre */}
                    <Modal.Title className="fw-bold">
                        Réception de Colis : #{String(selectedMovement?._id || '').slice(-6).toUpperCase()}
                    </Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleFinalReception}>
                    <Modal.Body>
                        <Table responsive striped bordered hover className="align-middle">
                            <thead className="bg-light">
                                <tr><th>Article</th><th className="text-center">Attendu</th><th className="text-center" style={{ width: '120px' }}>Reçu</th><th>Note / État</th></tr>
                            </thead>
                            <tbody>
                                {receptionItems.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="fw-bold">{item.nomArticle}</td>
                                        <td className="text-center">{item.quantiteAttendue}</td>
                                        <td>
                                            <Form.Control type="number" size="sm" min="0" max={item.quantiteAttendue} value={item.quantiteRecue}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    const updated = [...receptionItems];
                                                    updated[idx].quantiteRecue = Math.min(val, item.quantiteAttendue);
                                                    setReceptionItems(updated);
                                                }} className="text-center" />
                                        </td>
                                        <td>
                                            <Form.Control type="text" size="sm" placeholder="Ex: 1 gâté..." value={item.commentaire}
                                                onChange={(e) => {
                                                    const updated = [...receptionItems];
                                                    updated[idx].commentaire = e.target.value;
                                                    setReceptionItems(updated);
                                                }} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <Form.Group className="mt-3"><Form.Label className="small fw-bold">Commentaire global</Form.Label><Form.Control as="textarea" rows={2} value={globalReceptionComment} onChange={e => setGlobalReceptionComment(e.target.value)} /></Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowReceptionModal(false)}>Annuler</Button>
                        <Button variant="success" type="submit" disabled={valLoading}>{valLoading ? <Spinner size="sm" /> : 'Valider & Imprimer'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </>
    );
};

export default ArticleActionModals;