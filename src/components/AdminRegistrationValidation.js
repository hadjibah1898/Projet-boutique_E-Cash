// src/components/AdminRegistrationValidation.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Table, Spinner, Alert, Badge, Modal, Form } from 'react-bootstrap';
import { authAPI } from '../services/api';

const AdminRegistrationValidation = () => {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { loadRegistrations(); }, []);

  const loadRegistrations = async () => {
    try {
      setLoading(true);
      const data = await authAPI.getPendingAdminRegistrations();
      setRegistrations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Impossible de charger les demandes.');
    } finally { setLoading(false); }
  };

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      await authAPI.processAdminRegistration(id, { isApproved: true });
      setRegistrations(registrations.filter(r => r.registrationRequestId !== id));
      window.dispatchEvent(new Event('registrationProcessed'));
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la validation.');
    } finally { setProcessingId(null); }
  };

  const handleRejectClick = (id) => {
    setRejectId(id);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    setProcessingId(rejectId);
    try {
      await authAPI.processAdminRegistration(rejectId, { isApproved: false, vcRejectionReason: rejectReason });
      setRegistrations(registrations.filter(r => r.registrationRequestId !== rejectId));
      setShowRejectModal(false);
      window.dispatchEvent(new Event('registrationProcessed'));
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors du rejet.');
    } finally { setProcessingId(null); }
  };

  if (loading) {
    return (<Container className="vh-100 d-flex align-items-center justify-content-center"><Spinner animation="border" variant="primary" /></Container>);
  }

  return (
    <Container>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      <Row className="mb-4">
        <Col lg={8}><h2 className="fw-bold">📋 Demandes d'inscription Admin en attente</h2></Col>
        <Col lg={4} className="text-end"><Button variant="outline-primary" onClick={loadRegistrations} size="sm">🔄 Rafraîchir</Button></Col>
      </Row>

      {registrations.length === 0 ? (
        <Card className="border-0 shadow-sm"><Card.Body className="text-center py-5"><Badge bg="secondary" fontSize="3rem">✓</Badge><h5 className="mt-3">Aucune demande en attente</h5><p className="text-muted">Tous les inscrits ont été traités.</p></Card.Body></Card>
      ) : (
        <Card className="border-0 shadow-sm rounded-4 overflow-hidden"><Table hover responsive className="align-middle mb-0"><thead className="bg-dark text-white"><tr><th>Nom</th><th>Email</th><th>Entreprise</th><th>Téléphone</th><th>Date demande</th><th className="text-end">Actions</th></tr></thead><tbody>{registrations.map((reg) => {
          const d = reg.dtRequestedAt ? new Date(reg.dtRequestedAt) : null;
          return (
            <tr key={reg.registrationRequestId}>
              <td className="fw-bold">{reg.vcLastName || ''} {reg.vcFirstName || ''}</td>
              <td>{reg.vcEmail}</td>
              <td>{reg.vcCompanyName}</td>
              <td>{reg.vcPhoneNumber || '—'}</td>
              <td>{d ? d.toLocaleDateString('fr-FR') : '—'}</td>
              <td className="text-end">
                <Button variant="success" size="sm" disabled={processingId === reg.registrationRequestId} onClick={() => handleApprove(reg.registrationRequestId)} className="me-2">{processingId === reg.registrationRequestId ? '...' : '✓ Approuver'}</Button>
                <Button variant="danger" size="sm" disabled={processingId === reg.registrationRequestId} onClick={() => handleRejectClick(reg.registrationRequestId)}>{processingId === reg.registrationRequestId ? '...' : '✗ Rejeter'}</Button>
              </td>
            </tr>
          );
        })}</tbody></Table></Card>
      )}

      <Modal show={showRejectModal} onHide={() => setShowRejectModal(false)}>
        <Modal.Header closeButton><Modal.Title>Rejeter la demande</Modal.Title></Modal.Header>
        <Form onSubmit={handleRejectSubmit}>
          <Modal.Body><Form.Group className="mb-3"><Form.Label>Motif du rejet</Form.Label><Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Expliquez pourquoi vous rejetez cette demande..." required /></Form.Group></Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRejectModal(false)}>Annuler</Button><Button variant="danger" type="submit" disabled={processingId === rejectId || !rejectReason.trim()}>{processingId === rejectId ? '...' : 'Confirmer le rejet'}</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default AdminRegistrationValidation;
