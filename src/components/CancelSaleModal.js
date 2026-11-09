/**
 * @file CancelSaleModal.js
 * @description Modale de confirmation simple pour l'annulation d'une vente.
 * Ce composant est purement présentationnel. Il reçoit les fonctions `onHide` et `onConfirm`
 * pour gérer sa fermeture et la confirmation de l'action.
 */
import React from 'react';
import { Modal, Button } from 'react-bootstrap';

const CancelSaleModal = ({ show, onHide, onConfirm }) => {
    return (
        <Modal show={show} onHide={onHide}>
            <Modal.Header closeButton><Modal.Title>Annuler la vente</Modal.Title></Modal.Header>
            <Modal.Body>Êtes-vous sûr de vouloir annuler cette vente ? Le stock sera restauré.</Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Non</Button>
                <Button variant="danger" onClick={onConfirm}>Oui, annuler</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default CancelSaleModal;