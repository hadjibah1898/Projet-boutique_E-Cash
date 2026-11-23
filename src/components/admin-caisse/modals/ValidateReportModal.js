/**
 * @file ValidateReportModal.js
 * @description Modale de validation d'un rapport de caisse.
 */

import React from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';

const ValidateReportModal = ({
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
        <Modal.Title>Valider le Rapport de Caisse</Modal.Title>
      </Modal.Header>
      <Form onSubmit={onConfirm}>
        <Modal.Body>
          <Alert variant="info">
            En validant ce rapport, le montant théorique de <strong>{formatCurrency(selectedReport.mTheoreticalBalance || selectedReport.soldeTheorique)}</strong> sera ajouté à la Caisse Centrale.
          </Alert>
          {ecart !== 0 && (
            <Alert variant="danger" className="border-3 border-danger shadow-sm">
              <div className="d-flex align-items-center mb-2">
                <span style={{ fontSize: '24px' }} className="me-2">⚠</span>
                <strong className="fs-5">ALERTE ÉCART : {formatCurrency(ecart)}</strong>
              </div>
              <div className="p-2 bg-white rounded border small text-dark">
                <strong>Justification du gérant :</strong><br />
                {selectedReport.vcManagerComment || selectedReport.commentairesGérant || "Aucune explication fournie."}
              </div>
            </Alert>
          )}
          <Form.Group>
            <Form.Label>Commentaire Admin (Optionnel)</Form.Label>
            <Form.Control as="textarea" rows={3} value={adminComment} onChange={(e) => setAdminComment(e.target.value)} placeholder="Observation sur l'écart ou la validation..." />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Annuler</Button>
          <Button variant="success" type="submit" disabled={isValidating}>
            {isValidating ? 'Validation...' : 'Valider et Encaisser'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default ValidateReportModal;
