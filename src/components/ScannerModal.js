/**
 * @file ScannerModal.js
 * @description Modale qui héberge le lecteur de code-barres via la caméra.
 * Elle contient un conteneur `<div id="reader">` où la librairie `html5-qrcode`
 * va injecter l'interface de la caméra.
 * Elle affiche également les messages d'erreur liés au scan.
 */
import React from 'react';
import { Modal, Alert } from 'react-bootstrap';

const ScannerModal = ({ show, onHide, error }) => {
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>Scanner un code-barres</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div id="reader" width="100%"></div>
                <p className="text-center text-muted mt-2 small">Le scanner reste ouvert pour ajouter plusieurs articles.</p>
                {error && <Alert variant="danger" className="mt-2 py-2 small text-center">{error}</Alert>}
            </Modal.Body>
        </Modal>
    );
};

export default ScannerModal;