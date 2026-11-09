import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, OverlayTrigger, Tooltip, Card, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { authAPI, boutiqueAPI, venteAPI } from '../services/api';
import { toast } from 'react-toastify';

const ManagersView = () => {
  const [managers, setManagers] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBoutique, setFilterBoutique] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentManagerId, setCurrentManagerId] = useState(null);
  const [formData, setFormData] = useState({ nom: '', prenom: '', email: '', password: '', storeId: '' });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [managerHistory, setManagerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedManager, setSelectedManager] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = { page: currentPage, limit: itemsPerPage, search: searchTerm, role: 'Gérant', boutique: filterBoutique || undefined };
      
      const [managersRes, boutiquesRes] = await Promise.all([
        authAPI.getUsers(params),
        boutiqueAPI.getAll()
      ]);

      let managersList = [];
      if (Array.isArray(managersRes)) managersList = managersRes;
      else if (Array.isArray(managersRes?.data)) managersList = managersRes.data;
      else if (Array.isArray(managersRes?.data?.data)) managersList = managersRes.data.data;

      let boutiquesList = [];
      if (Array.isArray(boutiquesRes)) boutiquesList = boutiquesRes;
      else if (Array.isArray(boutiquesRes?.data)) boutiquesList = boutiquesRes.data;
      else if (Array.isArray(boutiquesRes?.data?.data)) boutiquesList = boutiquesRes.data.data;

      // ✅ On normalise l'email ET on croise le storeId pour trouver le nom de la boutique
      const normalizedManagers = managersList.map(m => {
        // Chercher l'ID de la boutique dans toutes les propriétés possibles
        const bId = m.storeId || m.boutique?._id || m.boutique;
        // Trouver le nom dans la liste des boutiques chargées
        const foundBoutique = boutiquesList.find(b => String(b._id || b.storeId) === String(bId));
        
        return {
          ...m,
          email: m.email || m.vcEmail || 'N/A',
          boutiqueNom: foundBoutique ? foundBoutique.nom : (m.boutique?.nom || m.boutiqueNom || 'N/A'),
          storeId: bId || ''
        };
      });

      setManagers(normalizedManagers);
      setTotalPages(managersRes?.totalPages || managersRes?.data?.totalPages || 1);
      setBoutiques(boutiquesList.filter(b => b.type !== 'Centrale' && b.type !== 'Bar'));
      
    } catch (err) {
      console.error("Erreur complète :", err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des données.');
      toast.error("Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, filterBoutique]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (manager = null) => {
    if (manager) {
      setEditMode(true);
      setCurrentManagerId(manager._id);
      const fullName = manager.nom || '';
      const nameParts = fullName.trim().split(/\s+/);
      const prenom = nameParts[0] || '';
      const nom = nameParts.slice(1).join(' ') || '';
      
      setFormData({ 
        nom: nom, 
        prenom: prenom, 
        email: manager.email || manager.vcEmail || '', 
        password: '', 
        storeId: String(manager.storeId || '') // Le storeId est maintenant garanti
      });
    } else {
      setEditMode(false);
      setFormData({ nom: '', prenom: '', email: '', password: '', storeId: filterBoutique || '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!editMode && !formData.storeId) return toast.error("Veuillez sélectionner une boutique.");

    try {
      if (editMode) {
        const updatePayload = { nom: `${formData.prenom} ${formData.nom}`.trim(), email: formData.email, ...(formData.password ? { password: formData.password } : {}) };
        await authAPI.updateManager(currentManagerId, updatePayload);
        setSuccessMessage('Le profil du gérant a été mis à jour avec succès !');
      } else {
        const managerPayload = { nom: formData.nom, prenom: formData.prenom, email: formData.email, password: formData.password, storeId: parseInt(formData.storeId, 10) };
        await authAPI.createManager(managerPayload);
        setSuccessMessage('Nouveau gérant créé avec succès !');
      }
      setShowModal(false);
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      const msg = err.response?.data?.message || "Une erreur est survenue lors de l'enregistrement.";
      setError(msg);
      toast.error(msg);
    }
  };

  const loadHistory = async (manager, page = 1) => {
    setHistoryLoading(true);
    setHistoryPage(page);
    if (manager) setSelectedManager(manager);
    const mId = manager ? manager._id : selectedManager?._id;
    try {
      const res = await venteAPI.getHistorique({ gerantId: mId, page, limit: 10 });
      const allSales = (res.data && res.data.ventes) ? res.data.ventes : (res.ventes || res.data || []);
      setManagerHistory(allSales);
      setHistoryTotalPages((res.data && res.data.totalPages) ? res.data.totalPages : (res.totalPages || 1));
      setShowHistoryModal(true);
    } catch (err) {
      setError("Impossible de charger l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const columns = [
    { 
      key: 'nom', 
      label: 'Nom / Email',
      render: (nom, manager) => (
        <div>
          <div className="fw-bold">{nom}</div>
          <div className="text-muted small">{manager.email}</div>
        </div>
      )
    },
    { 
      key: 'boutiqueNom', // ✅ Utilisation de la propriété croisée
      label: 'Boutique', 
      render: (nomBoutique) => <span className="fw-medium">{nomBoutique}</span>
    },
    { 
      key: 'active', 
      label: 'Statut', 
      render: (a) => <Badge bg={a ? 'success' : 'danger'}>{a ? 'Actif' : 'Inactif'}</Badge> 
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, manager) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Ventes</Tooltip>}>
            <Button variant="link" className="text-info p-0" onClick={() => loadHistory(manager, 1)}>
              <iconify-icon icon="solar:bill-list-bold" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
            <Button variant="link" className="text-primary p-0" onClick={() => handleOpenModal(manager)}>
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold">Gestion des Gérants</h3>
        <Button variant="primary" onClick={() => handleOpenModal()} className="rounded-pill px-4">
          Ajouter un Gérant
        </Button>
      </div>

      <div className="d-flex gap-3 mb-4 align-items-center">
        <Form.Control className="w-25 shadow-sm" placeholder="Rechercher..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
        <Form.Select className="w-25 shadow-sm" value={filterBoutique} onChange={(e) => { setFilterBoutique(e.target.value); setCurrentPage(1); }}>
          <option value="">Toutes les boutiques</option>
          {boutiques.map(b => <option key={b._id || b.storeId} value={b._id || b.storeId}>{b.nom || b.vcStoreName}</option>)}
        </Form.Select>
      </div>

      {successMessage && <Alert variant="success" dismissible onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <TableComponent columns={columns} data={managers} emptyMessage="Aucun gérant." />
        
        {totalPages > 1 && (
          <div className="d-flex justify-content-center p-3 border-top">
            <Pagination className="mb-0">
              <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
              <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
            </Pagination>
          </div>
        )}
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editMode ? 'Modifier' : 'Ajouter'} un gérant</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Prénom</Form.Label>
              <Form.Control value={formData.prenom} onChange={e => setFormData({...formData, prenom: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Nom</Form.Label>
              <Form.Control value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </Form.Group>
            {!editMode && (
              <Form.Group className="mb-3">
                <Form.Label>Mot de passe</Form.Label>
                <Form.Control type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
              </Form.Group>
            )}
            <Form.Group>
              <Form.Label>Boutique</Form.Label>
              <Form.Select value={formData.storeId} onChange={e => setFormData({...formData, storeId: e.target.value})} required>
                <option value="">Sélectionner une boutique</option>
                {boutiques.map(b => <option key={b._id || b.storeId} value={b._id || b.storeId}>{b.nom || b.vcStoreName}</option>)}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Historique de {selectedManager?.nom}</Modal.Title></Modal.Header>
        <Modal.Body>
          {historyLoading ? <div className="text-center p-4"><Spinner animation="border" /></div> : (
            <>
              <TableComponent 
                columns={[
                  { key: 'createdAt', label: 'Date', render: d => new Date(d).toLocaleDateString() },
                  { key: 'article', label: 'Article', render: a => a?.nom || 'N/A' },
                  { key: 'prixTotal', label: 'Total', render: p => p.toLocaleString() + ' GNF' }
                ]} 
                data={managerHistory} 
              />
              {historyTotalPages > 1 && (
                <Pagination className="justify-content-center mt-3">
                  {[...Array(historyTotalPages)].map((_, i) => (
                    <Pagination.Item key={i+1} active={i+1 === historyPage} onClick={() => loadHistory(null, i+1)}>
                      {i+1}
                    </Pagination.Item>
                  ))}
                </Pagination>
              )}
            </>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default ManagersView;