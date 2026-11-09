/**
 * @file DemandeRemiseButton.js
 * @description Composant React.
 */

import React, { useState } from 'react';
import { Button, Modal, Form, Alert } from 'react-bootstrap';
import { articleAPI } from '../services/api';

const DemandeRemiseButton = ({ articleId, onSuccess }) => {
  const [show, setShow] = useState(false);
  const [remise, setRemise] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await articleAPI.demanderRemise(articleId, { remise: parseFloat(remise), clientNom });
      setSuccess("Demande envoyée à l'administrateur !");
      setRemise('');
      setClientNom('');
      setShow(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la demande.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="warning" size="sm" onClick={() => setShow(true)}>
        Demander une remise
      </Button>
      <Modal show={show} onHide={() => setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Demander une remise</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Pourcentage de remise (%)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={50}
                value={remise}
                onChange={e => setRemise(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Nom du client (Optionnel)</Form.Label>
              <Form.Control
                type="text"
                value={clientNom}
                onChange={e => setClientNom(e.target.value)}
                placeholder="Ex: M. Diallo"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShow(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Envoi...' : 'Envoyer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
      {success && <Alert variant="success" className="mt-2">{success}</Alert>}
    </>
  );
};

export default DemandeRemiseButton;
