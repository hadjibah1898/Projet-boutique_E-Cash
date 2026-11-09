/**
 * @file ImagePreviewModal.js
 * @description Modale simple pour afficher un aperçu en grand format d'une image de produit.
 * Ce composant est purement présentationnel. Il reçoit l'URL de l'image à afficher
 * et la fonction `onHide` pour gérer sa fermeture.
 */
import React from 'react';
import { Modal } from 'react-bootstrap';

const ImagePreviewModal = ({ show, onHide, image }) => {
    return (
        <Modal show={show} onHide={onHide} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Aperçu du produit</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center bg-light p-4">
                {image && <img src={image} alt="Aperçu grand format" className="img-fluid rounded shadow" style={{ maxHeight: '80vh' }} />}
            </Modal.Body>
        </Modal>
    );
};

export default ImagePreviewModal;