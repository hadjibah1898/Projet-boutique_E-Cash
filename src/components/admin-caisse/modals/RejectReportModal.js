/**
 * @file RejectReportModal.js
 * @description Modale de rejet d'un rapport de caisse.
 */

import React from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';

const RejectReportModal = ({
  show,
  onHide,
  selectedReport,
  adminComment,
  setAdminComment,
  isValidating,
  onConfirm,
  formatCurrency,
  resolveGerantName
}) => {
  if (!selectedReport) return null;

  const ecart = selectedReport.mDifferenceAmount !== undefined ? selectedReport.mDifferenceAmount : selectedReport.ecart;

  return (
    <Modal show={show} onHide={onHide} centered animation={false}>
      <Modal.Header closeButton>
        <Modal.Title className="text-danger">Rejeter le Rapport</Modal.Title>
      </Modal.Header>
      <Form onSubmit={onConfirm}>
        <Modal.Body>
          <p>Vous êtes sur le point de rejeter le rapport de <strong>{resolveGerantName(selectedReport)}</strong>.</p>
          {ecart !== 0 && (
            <Alert variant="warning">
              <strong>Rappel :</strong> Il y a un écart de {formatCurrency(ecart)} dans ce rapport.
            </Alert>
          )}
          <Form.Group>
            <Form.Label>Motif du rejet (Obligatoire)</Form.Label>
            <Form.Control as="textarea" rows={3} value={adminComment} onChange={(e) => setAdminComment(e.target.value)} required placeholder="Expliquez pourquoi le rapport est rejeté..." />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Annuler</Button>
          <Button variant="danger" type="submit" disabled={isValidating}>
            {isValidating ? 'Rejet...' : 'Confirmer le Rejet'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RejectReportModal;
