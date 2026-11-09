/**
 * @file CashiersView.js
 * @description Vue de gestion des caissiers par le Gérant.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, Table } from 'react-bootstrap';
import { authAPI } from '../services/api';

const CashiersView = () => {
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentCashierId, setCurrentCashierId] = useState(null);
  const [formData, setFormData] = useState({ nom: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  // États pour la confirmation d'activation / désactivation
  const [showToggleModal, setShowToggleModal] = useState(false);
  const [selectedCashier, setSelectedCashier] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const boutiqueId = localStorage.getItem('boutiqueId');

  const fetchCashiers = useCallback(async () => {
    try {
      setLoading(true);
      // Récupérer les utilisateurs (Serveurs et Caissiers) de la boutique du gérant
      const res = await authAPI.getUsers({});
      const data = res.data || res;
      // Filtrer pour ne garder que les caissiers de cette boutique
      const cashiersList = Array.isArray(data) ? data.filter(u => {
        const userBoutiqueId = u.boutique?._id || u.boutique;
        return u.role === 'Caissier' && userBoutiqueId && userBoutiqueId.toString() === boutiqueId;
      }) : [];
      console.log('Caissiers chargés:', cashiersList);
      setCashiers(cashiersList);
    } catch (err) {
      console.error('Erreur chargement caissiers:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des caissiers.');
    } finally { setLoading(false); }
  }, [boutiqueId]);

  useEffect(() => { fetchCashiers(); }, [fetchCashiers]);

  const handleOpenModal = (cashier = null) => {
    setError('');
    if (cashier) {
      setEditMode(true);
      setCurrentCashierId(cashier._id);
      setFormData({ nom: cashier.nom || '', email: cashier.email || '', password: '' });
    } else {
      setEditMode(false);
      setCurrentCashierId(null);
      setFormData({ nom: '', email: '', password: '' });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditMode(false);
    setCurrentCashierId(null);
    setFormData({ nom: '', email: '', password: '' });
  };

  const handleOpenToggleModal = (cashier) => {
    setSelectedCashier(cashier);
    setShowToggleModal(true);
  };

  const handleToggleActive = async () => {
    if (!selectedCashier) return;
    setToggleLoading(true);
    setError('');
    try {
      const newStatus = !selectedCashier.active;
      await authAPI.updateManager(selectedCashier._id, { active: newStatus });
      setSuccessMessage(
        newStatus
          ? `Compte de ${selectedCashier.nom} activé avec succès !`
          : `Compte de ${selectedCashier.nom} désactivé avec succès !`
      );
      setShowToggleModal(false);
      setSelectedCashier(null);
      fetchCashiers();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Erreur changement statut caissier:', err);
      setError(err.response?.data?.message || "Erreur lors du changement de statut du caissier.");
      setShowToggleModal(false);
    } finally {
      setToggleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editMode && !boutiqueId) {
        setError("Erreur : Votre compte gérant n'est pas rattaché à une boutique.");
        return;
    }

    setSubmitLoading(true);
    setError('');

    try {
      if (editMode) {
        // Mode modification : on n'envoie le mot de passe que s'il est renseigné
        const payload = { nom: formData.nom, email: formData.email };
        if (formData.password && formData.password.trim() !== '') {
          payload.password = formData.password;
        }
        await authAPI.updateManager(currentCashierId, payload);
        setSuccessMessage('Caissier modifié avec succès !');
      } else {
        // Mode création : utiliser l'endpoint create-cashier
        const payload = { 
          nom: formData.nom,
          email: formData.email,
          password: formData.password,
          role: 'Caissier', 
          boutique: boutiqueId 
        };
        console.log('Payload création caissier:', payload);
        const result = await authAPI.createCashier(payload);
        console.log('Résultat création:', result);
        setSuccessMessage('Caissier créé avec succès !');
      }
      handleCloseModal();
      fetchCashiers();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) { 
      console.error('Erreur détaillée:', err);
      const errorMsg = err.response?.data?.message || err.message || (editMode ? "Erreur lors de la modification du caissier." : "Erreur lors de la création du caissier.");
      setError(`Détails: ${errorMsg}`); 
    } finally { 
      setSubmitLoading(false); 
    }
  };

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }}></Spinner></div>;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold mb-1">Gestion des Caissiers</h3>
          <p className="text-muted mb-0">Créez et gérez les comptes caissiers de votre boutique</p>
        </div>
        <Button variant="primary" onClick={() => handleOpenModal()} className="rounded-pill">
          <iconify-icon icon="solar:add-circle-bold" className="me-2"></iconify-icon>
          Nouveau Caissier
        </Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
      {successMessage && <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>{successMessage}</Alert>}

      {cashiers.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <Card.Body className="text-center py-5">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone" style={{ fontSize: '64px', opacity: 0.3 }}></iconify-icon>
            <p className="text-muted mt-3 mb-0">Aucun caissier créé pour le moment</p>
            <Button variant="primary" onClick={() => handleOpenModal()} className="mt-3 rounded-pill">
              Créer votre premier caissier
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <Card.Body className="p-0">
            <Table hover responsive className="align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="ps-4">Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Date de création</th>
                  <th className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map(cashier => (
                  <tr key={cashier._id}>
                    <td className="ps-4">
                      <div className="d-flex align-items-center">
                        <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: '40px', height: '40px' }}>
                          <iconify-icon icon="solar:user-bold" style={{ fontSize: '20px' }}></iconify-icon>
                        </div>
                        <span className="fw-bold">{cashier.nom}</span>
                      </div>
                    </td>
                    <td>{cashier.email}</td>
                    <td><Badge bg="info">Caissier</Badge></td>
                    <td>
                      <Badge bg={cashier.active ? "success" : "warning"}>
                        {cashier.active ? "Actif" : "En attente"}
                      </Badge>
                    </td>
                    <td>{new Date(cashier.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="text-end pe-4">
                      <div className="d-flex gap-2 justify-content-end">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className="rounded-pill px-3"
                          onClick={() => handleOpenModal(cashier)}
                          title="Modifier ce caissier"
                        >
                          <iconify-icon icon="solar:pen-new-square-linear" className="me-1"></iconify-icon>
                          Modifier
                        </Button>
                        <Button
                          variant={cashier.active ? "outline-warning" : "outline-success"}
                          size="sm"
                          className="rounded-pill px-3"
                          onClick={() => handleOpenToggleModal(cashier)}
                          title={cashier.active ? "Désactiver ce caissier (bloque sa connexion)" : "Activer ce caissier (autorise sa connexion)"}
                        >
                          <iconify-icon icon={cashier.active ? "solar:lock-keyhole-minimalistic-linear" : "solar:check-circle-linear"} className="me-1"></iconify-icon>
                          {cashier.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Modale de création / modification de caissier */}
      <Modal show={showModal} onHide={handleCloseModal} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>
              <iconify-icon icon={editMode ? "solar:pen-new-square-bold-duotone" : "solar:user-plus-bold-duotone"} className="me-2"></iconify-icon>
              {editMode ? 'Modifier le Caissier' : 'Nouveau Caissier'}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {!editMode && (
            <Alert variant="info" className="mb-3">
              <small>
                <iconify-icon icon="solar:info-circle-bold" className="me-1"></iconify-icon>
                Le caissier aura accès uniquement aux fonctionnalités de vente, caisse et créances de votre boutique.
              </small>
            </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Nom Complet <span className="text-danger">*</span></Form.Label>
              <Form.Control 
                type="text" 
                value={formData.nom} 
                onChange={e => setFormData({...formData, nom: e.target.value})} 
                required
                placeholder="Ex: Jean Dupont"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email <span className="text-danger">*</span></Form.Label>
              <Form.Control 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                required
                placeholder="Ex: caissier@boutique.com"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mot de passe {!editMode && <span className="text-danger">*</span>} {editMode && <span className="text-muted fw-normal">(optionnel — laissez vide pour garder l'actuel)</span>}</Form.Label>
              <Form.Control 
                type="text" 
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                required={!editMode}
                placeholder={editMode ? "Nouveau mot de passe (optionnel)" : "Mot de passe temporaire"}
              />
              {!editMode && (
              <Form.Text className="text-muted">
                Le caissier devra changer ce mot de passe à sa première connexion.
              </Form.Text>
              )}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal} disabled={submitLoading}>
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={submitLoading}>
              {submitLoading ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  {editMode ? 'Enregistrement...' : 'Création...'}
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                  {editMode ? 'Enregistrer' : 'Créer le compte'}
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de confirmation activation / désactivation */}
      <Modal show={showToggleModal} onHide={() => !toggleLoading && setShowToggleModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <iconify-icon
              icon={selectedCashier?.active ? "solar:lock-keyhole-minimalistic-bold-duotone" : "solar:check-circle-bold-duotone"}
              className="me-2"
            ></iconify-icon>
            {selectedCashier?.active ? 'Désactiver le caissier' : 'Activer le caissier'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedCashier?.active ? (
            <Alert variant="warning" className="mb-0">
              Voulez-vous vraiment <strong>désactiver</strong> le compte de <strong>{selectedCashier?.nom}</strong> ({selectedCashier?.email}) ?<br />
              <small>Il ne pourra plus se connecter jusqu'à sa réactivation.</small>
            </Alert>
          ) : (
            <Alert variant="success" className="mb-0">
              Voulez-vous vraiment <strong>activer</strong> le compte de <strong>{selectedCashier?.nom}</strong> ({selectedCashier?.email}) ?<br />
              <small>Il pourra de nouveau se connecter à sa caisse.</small>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowToggleModal(false)} disabled={toggleLoading}>
            Annuler
          </Button>
          <Button
            variant={selectedCashier?.active ? "warning" : "success"}
            onClick={handleToggleActive}
            disabled={toggleLoading}
          >
            {toggleLoading ? (
              <>
                <Spinner as="span" animation="border" size="sm" className="me-2" />
                Traitement...
              </>
            ) : (
              selectedCashier?.active ? 'Désactiver' : 'Activer'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CashiersView;