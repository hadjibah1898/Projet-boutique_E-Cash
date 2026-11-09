/**
 * @file ReceiveStockModal.js
 * @description Composant React.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, Form, Alert, Badge, Spinner } from 'react-bootstrap';
import { articleAPI } from '../services/api';

const ReceiveStockModal = ({ show, onHide, mouvement, onSuccess }) => {
    const [receivedItems, setReceivedQuantities] = useState({});
    const [commentaire, setCommentaire] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Initialiser les quantités reçues avec les quantités expédiées par défaut
    useEffect(() => {
        if (mouvement && mouvement.articles) {
            const initialQtys = {};
            mouvement.articles.forEach(item => {
                initialQtys[item.nomArticle] = item.quantite;
            });
            setReceivedQuantities(initialQtys);
            setCommentaire('');
            setError('');
        }
    }, [mouvement]);

    const handleQtyChange = (nom, val) => {
        const qty = parseInt(val) || 0;
        setReceivedQuantities(prev => ({ ...prev, [nom]: qty }));
    };

    const handleConfirm = async () => {
        setLoading(true);
        setError('');
        try {
            // Formatage des données pour le backend
            const itemsRecus = mouvement.articles.map(item => ({
                nomArticle: item.nomArticle,
                quantiteRecue: receivedItems[item.nomArticle]
            }));

            // Détection de livraison partielle pour confirmation utilisateur
            const isPartial = itemsRecus.some(item => {
                const original = mouvement.articles.find(a => a.nomArticle === item.nomArticle);
                return item.quantiteRecue < original.quantite;
            });

            if (isPartial && !window.confirm("Attention : Vous validez une réception PARTIELLE. Les articles manquants seront automatiquement retournés au Dépôt Principal. Continuer ?")) {
                setLoading(false);
                return;
            }

            await articleAPI.confirmTransferReception(mouvement._id, { itemsRecus, commentaire });
            onSuccess(isPartial ? "Réception partielle validée avec succès !" : "Stock reçu et mis à jour !");
            onHide();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de la validation.");
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async () => {
        if (!window.confirm("Êtes-vous sûr de vouloir REJETER ce bon ? Tout le stock sera renvoyé à la boutique source.")) return;
        setLoading(true);
        try {
            await articleAPI.rejectTransferReception(mouvement._id, { commentaire });
            onSuccess("Bon rejeté. Le stock a été restitué à la source.");
            onHide();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du rejet.");
        } finally {
            setLoading(false);
        }
    };

    if (!mouvement) return null;

    return (
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header closeButton className="bg-light">
                <Modal.Title className="fw-bold">Validation de Réception</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="mb-4 d-flex justify-content-between align-items-center bg-info bg-opacity-10 p-3 rounded-4">
                    <div>
                        <div className="small text-muted text-uppercase fw-bold">Provenance</div>
                        <h6 className="mb-0 fw-bold">{mouvement.boutiqueSource?.nom || 'Centrale'}</h6>
                    </div>
                    <div className="text-end">
                        <div className="small text-muted text-uppercase fw-bold">N° Bon</div>
                        <Badge bg="dark">#{(mouvement._id || '').slice(-6).toUpperCase()}</Badge>
                    </div>
                </div>

                {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

                <Table hover responsive className="align-middle border-0">
                    <thead className="table-light">
                        <tr>
                            <th className="border-0">Article</th>
                            <th className="text-center border-0">Quantité Expédiée</th>
                            <th className="text-center border-0" style={{ width: '160px' }}>Quantité Reçue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mouvement.articles.map((item, idx) => {
                            const valRecue = receivedItems[item.nomArticle] ?? item.quantite;
                            const isDiff = valRecue < item.quantite;
                            
                            return (
                                <tr key={idx}>
                                    <td className="fw-bold">{item.nomArticle}</td>
                                    <td className="text-center">
                                        <Badge bg="secondary" pill className="px-3 py-2 fs-6">{item.quantite}</Badge>
                                    </td>
                                    <td>
                                        <Form.Control 
                                            type="number" 
                                            size="sm"
                                            min="0"
                                            max={item.quantite}
                                            value={valRecue}
                                            onChange={(e) => handleQtyChange(item.nomArticle, e.target.value)}
                                            className={`text-center rounded-pill fw-bold ${isDiff ? 'border-warning bg-warning bg-opacity-10' : 'border-success'}`}
                                        />
                                        {isDiff && <div className="text-warning x-small text-center mt-1 fw-bold">Incomplet</div>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>

                <Form.Group className="mt-3">
                    <Form.Label className="small fw-bold text-muted text-uppercase">Commentaire / Justification (Optionnel)</Form.Label>
                    <Form.Control 
                        as="textarea" 
                        rows={2} 
                        placeholder="Ex: 2 bouteilles cassées, erreur de livraison..."
                        value={commentaire}
                        onChange={(e) => setCommentaire(e.target.value)}
                        className="rounded-3 shadow-sm border-info border-opacity-25"
                    />
                </Form.Group>
            </Modal.Body>
            <Modal.Footer className="border-0 justify-content-between gap-2 px-4 pb-4">
                <Button variant="outline-danger" className="rounded-pill px-4 fw-bold" onClick={handleReject} disabled={loading}>
                    Rejeter le Bon
                </Button>
                <div className="d-flex gap-2">
                    <Button variant="light" className="rounded-pill px-4 fw-bold" onClick={onHide}>Annuler</Button>
                    <Button variant="success" className="rounded-pill px-4 shadow-sm fw-bold" onClick={handleConfirm} disabled={loading}>
                        {loading ? <Spinner size="sm" className="me-2" /> : <iconify-icon icon="solar:check-circle-bold" className="me-2 align-middle"></iconify-icon>}
                        Valider la Réception
                    </Button>
                </div>
            </Modal.Footer>
        </Modal>
    );
};

export default ReceiveStockModal;