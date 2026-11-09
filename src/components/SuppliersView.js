// src/components/SuppliersView.js
// Composant de gestion des fournisseurs

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Card, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import { fournisseurAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import TableComponent from './common/Table';

const SuppliersView = () => {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // ✅ ÉTATS CORRIGÉS : Utilisation des noms SQL (vcBusinessName, vcPhoneNumber, vcEmail)
  const [showModal, setShowModal] = useState(false);
  const [currentFournisseur, setCurrentFournisseur] = useState({ 
    vcBusinessName: '', 
    vcPhoneNumber: '', 
    vcEmail: '' 
  });
  const [editMode, setEditMode] = useState(false);

  // États pour la confirmation de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);

  const fetchFournisseurs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
      };
      const res = await fournisseurAPI.getAll(params);
      
      // L'intercepteur Axios extrait déjà `data`, donc on reçoit directement le tableau
      const list = Array.isArray(res) ? res : (res.data || []);
      setFournisseurs(list);
      setTotalPages(res.totalPages || res.pagination?.totalPages || 1);
    } catch (err) {
      setError("Erreur chargement fournisseurs");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchFournisseurs();
  }, [fetchFournisseurs]);

  // --- Gestion Fournisseurs ---
  const handleShowModal = (fournisseur = null) => {
    if (fournisseur) {
      // ✅ On mappe les données pour l'édition
      setCurrentFournisseur({ 
        _id: fournisseur._id || fournisseur.supplierId,
        vcBusinessName: fournisseur.vcBusinessName || fournisseur.nom || '', 
        vcPhoneNumber: fournisseur.vcPhoneNumber || fournisseur.telephone || '',
        vcEmail: fournisseur.vcEmail || fournisseur.email || ''
      });
      setEditMode(true);
    } else {
      setCurrentFournisseur({ vcBusinessName: '', vcPhoneNumber: '', vcEmail: '' });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleSubmitFournisseur = async (e) => {
    e.preventDefault();
    try {
      // ✅ Payload propre avec les champs SQL attendus
      const payload = {
        vcBusinessName: currentFournisseur.vcBusinessName,
        vcPhoneNumber: currentFournisseur.vcPhoneNumber,
        vcEmail: currentFournisseur.vcEmail || null
      };
      
      if (editMode) {
        await fournisseurAPI.update(currentFournisseur._id, payload);
        setSuccessMessage("Fournisseur mis à jour");
      } else {
        await fournisseurAPI.create(payload);
        setSuccessMessage("Fournisseur créé");
      }
      setShowModal(false);
      fetchFournisseurs();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'enregistrement");
    }
  };

  const confirmDelete = (id) => {
    setSupplierToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    try {
      await fournisseurAPI.delete(supplierToDelete);
      setSuccessMessage("Fournisseur supprimé avec succès.");
      fetchFournisseurs();
    } catch (err) {
      setError(err.response?.data?.message || "Impossible de supprimer ce fournisseur.");
    } finally {
      setShowDeleteModal(false);
      setSupplierToDelete(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    const res = await fournisseurAPI.getAll({ search: searchTerm, limit: 0 });
    const allFournisseurs = Array.isArray(res) ? res : (res.data || []);

    const dataToExport = allFournisseurs.map(f => ({
      'Nom': f.vcBusinessName || f.nom,
      'Téléphone': f.vcPhoneNumber || f.telephone,
      'Email': f.vcEmail || f.email || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fournisseurs");
    XLSX.writeFile(workbook, `export_fournisseurs_${new Date().toISOString().split('T')[0]}.xlsx`);
    setLoading(false);
  };

  const columns = [
    { key: 'vcBusinessName', label: 'Nom', render: (val, row) => val || row.nom || '-' },
    { key: 'vcPhoneNumber', label: 'Téléphone', render: (val, row) => val || row.telephone || '-' },
    { key: 'vcEmail', label: 'Email', render: (val, row) => val || row.email || '-' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, fournisseur) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
            <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(fournisseur)}>
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Supprimer</Tooltip>}>
            <Button variant="link" className="text-danger p-0" onClick={() => confirmDelete(fournisseur.supplierId || fournisseur._id)}>
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <h3 className="fw-bold mb-0">Gestion des Fournisseurs</h3> 
        <div className="d-flex gap-2">
          <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
            <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
            Exporter Excel
          </Button>
          <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
            <iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle"></iconify-icon>
            Ajouter un Fournisseur
          </Button>
        </div>
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <div className="mb-4">
        <Form.Control
          type="text"
          placeholder="Rechercher un fournisseur par nom..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent columns={columns} data={fournisseurs} emptyMessage="Aucun fournisseur trouvé." />
        </Card.Body>
        {totalPages > 1 && (
            <Card.Footer className="d-flex justify-content-center border-0 pt-0">
                <Pagination className="mb-0">
                    <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                    <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                    <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                    <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                </Pagination>
            </Card.Footer>
        )}
      </Card>

      {/* Modale Création/Edition */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editMode ? 'Modifier' : 'Nouveau'} Fournisseur</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmitFournisseur}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom de l'entreprise / Fournisseur</Form.Label>
              <Form.Control 
                type="text" 
                name="vcBusinessName"
                value={currentFournisseur.vcBusinessName} 
                onChange={e => setCurrentFournisseur({...currentFournisseur, vcBusinessName: e.target.value})} 
                required 
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Téléphone</Form.Label>
              <Form.Control 
                type="text" 
                name="vcPhoneNumber"
                value={currentFournisseur.vcPhoneNumber} 
                onChange={e => setCurrentFournisseur({...currentFournisseur, vcPhoneNumber: e.target.value})} 
                required 
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control 
                type="email" 
                name="vcEmail"
                value={currentFournisseur.vcEmail} 
                onChange={e => setCurrentFournisseur({...currentFournisseur, vcEmail: e.target.value})} 
                placeholder="exemple@email.com" 
              />
              <Form.Text className="text-muted">L'email est optionnel.</Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Confirmation de Suppression */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">⚠️ Suppression de Fournisseur</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">Êtes-vous sûr de vouloir supprimer ce fournisseur ?</p>
          <Alert variant="warning" className="mb-0 small">
            Cette action est irréversible.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
          <Button variant="danger" onClick={executeDelete}>Supprimer définitivement</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SuppliersView;