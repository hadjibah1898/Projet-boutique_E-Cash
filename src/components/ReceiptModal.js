/**
 * @file ReceiptModal.js
 * @description Modale qui s'affiche après une vente réussie pour proposer l'impression du ticket.
 * Ce composant est purement présentationnel. Il reçoit les fonctions `onHide` (pour ignorer)
 * et `onPrint` (pour imprimer) via ses props.
 * Le paramètre `backdrop="static"` empêche la fermeture en cliquant à l'extérieur.
 */
import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

const ReceiptModal = ({ show, onHide, onPrint, canPrint = true }) => {
    const [includeTip, setIncludeTip] = useState(true);

    const handlePrint = () => {
        onPrint(includeTip);
    };

    return (
        <Modal show={show} onHide={onHide} centered backdrop="static" keyboard={false}>
            <Modal.Header>
                <Modal.Title>Ticket de Caisse</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center py-3">
                <iconify-icon icon="solar:printer-bold-duotone" style={{ fontSize: '64px' }} className="text-primary mb-3"></iconify-icon>
                <h5 className="mb-3">Vente enregistrée avec succès !</h5>

                {canPrint ? (
                    <>
                        <div className="bg-light p-3 rounded-4 mb-3 text-start">
                            <Form.Check 
                                type="switch"
                                id="include-tip-switch"
                                label="Afficher le pourboire sur le ticket"
                                checked={includeTip}
                                onChange={(e) => setIncludeTip(e.target.checked)}
                                className="fw-bold"
                            />
                            <small className="text-muted">Si décoché, seul le total des articles apparaîtra.</small>
                        </div>
                        <p className="text-muted">Voulez-vous imprimer le ticket de caisse ?</p>
                    </>
                ) : (
                    <p className="text-muted">La commande a été transmise au bar/cuisine pour préparation.</p>
                )}
            </Modal.Body>
            <Modal.Footer className="justify-content-center gap-3 border-0 pb-4">
                <Button variant="secondary" onClick={onHide} className="rounded-pill px-4">{canPrint ? 'Ignorer' : 'Fermer'}</Button>
                {canPrint && (
                    <Button variant="primary" onClick={handlePrint} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" className="me-2"></iconify-icon>Imprimer
                    </Button>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default ReceiptModal;