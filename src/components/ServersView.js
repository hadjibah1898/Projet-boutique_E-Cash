/**
 * @file ServersView.js
 * @description Vue de gestion des serveurs par le Gérant.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, Table } from 'react-bootstrap';
import { authAPI, serveurAPI } from '../services/api';

const ServersView = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ nom: '', email: '', password: '' });
  const [error, setError] = useState('');

  const boutiqueId = localStorage.getItem('boutiqueId');

  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      // Utilisation de l'API dédiée : le filtrage est fait par le serveur
      const res = await serveurAPI.getEquipe(); 
      setServers(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des serveurs.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!boutiqueId) {
        setError("Erreur : Votre compte gérant n'est pas rattaché à une boutique. Déconnectez-vous et reconnectez-vous.");
        return;
    }

    try {
      const payload = { ...formData, role: 'Serveur', boutique: boutiqueId };
      await authAPI.register(payload);
      setShowModal(false);
      fetchServers();
    } catch (err) { setError(err.response?.data?.message || "Erreur."); }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between mb-4">
        <h3 className="fw-bold">Mon Équipe (Serveurs)</h3>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Ajouter Serveur</Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <Card className="border-0 shadow-sm rounded-4">
        <Table hover responsive className="align-middle mb-0">
          <thead className="bg-light">
            <tr><th>Nom</th><th>Email</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {servers.map(s => (
              <tr key={s._id}>
                <td>{s.nom}</td><td>{s.email}</td>
                <td><Badge bg="success">Actif</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton><Modal.Title>Nouveau Serveur</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom Complet</Form.Label>
              <Form.Control value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email / Identifiant</Form.Label>
              <Form.Control type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mot de passe</Form.Label>
              <Form.Control type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="primary" type="submit">Créer le compte</Button></Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};
export default ServersView;