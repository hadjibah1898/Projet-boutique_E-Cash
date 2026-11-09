// src/components/ShopsView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { toast } from 'react-toastify';
import ErrorBoundary from './common/ErrorBoundary';
import { boutiqueAPI, articleAPI, userAPI } from '../services/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import RestockModal from './RestockModal';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const blueIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const RecenterMap = ({ center }) => {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
};

const ShopsView = () => {
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  const [currentBoutique, setCurrentBoutique] = useState({
    _id: '', code: '', nom: '', adresse: '', ville: '', active: true, type: 'Secondaire',
    vendeurs: [], tipPercentage: 5, tipsEnabled: true,
    orangeMoneyQrCode: '', orangeMoneyAccount: '', mobicashQrCode: '', mobicashAccount: '', paycardQrCode: '', paycardAccount: '',
    latitude: 9.6412, longitude: -13.5784
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [searchTerm, setSearchTerm] = useState('');
  const [allGerants, setAllGerants] = useState([]);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ sourceId: '', targetId: '' });
  const [transferMessage, setTransferMessage] = useState({ type: '', text: '' });
  const [sourceArticles, setSourceArticles] = useState([]);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [transferQuantities, setTransferQuantities] = useState({});
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSearchTerm, setTransferSearchTerm] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [boutiqueToDelete, setBoutiqueToDelete] = useState(null);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [centralShop, setCentralShop] = useState(null);

  const [viewMode, setViewMode] = useState('list');
  const [forcedCenter, setForcedCenter] = useState(null);
  const [selectedBoutiqueId, setSelectedBoutiqueId] = useState(null);
  const [radius, setRadius] = useState(500);
  const markerRefs = useRef({});

  useEffect(() => {
    fetchBoutiques();
    fetchGerants();
  }, []);

  const fetchBoutiques = async () => {
    try {
      setLoading(true);
      const boutiques = await boutiqueAPI.getAll();
      setBoutiques(boutiques);
      const centrale = boutiques.find(b => b.type === 'Centrale' || b.type === 'Bar');
      setCentralShop(centrale);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchGerants = async () => {
    try {
      const res = await userAPI.getAll();
      const users = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      
      // ✅ DÉDOUBLONNAGE : On filtre par rôle ET on supprime les doublons par _id
      const uniqueGerants = Array.from(
        new Map(
          users
            .filter(u => u.role === 'MANAGER' || u.role === 'Gérant')
            .map(u => [u._id, u])
        ).values()
      );
      
      setAllGerants(uniqueGerants);
    } catch (err) {
      console.error("Erreur lors de la récupération des gérants", err);
    }
  };

  useEffect(() => {
    if (viewMode === 'map' && selectedBoutiqueId && markerRefs.current[selectedBoutiqueId]) {
      setTimeout(() => { markerRefs.current[selectedBoutiqueId]?.openPopup(); }, 100);
    }
  }, [selectedBoutiqueId, viewMode]);

  useEffect(() => {
    if (transferData.sourceId) {
      setLoadingArticles(true);
      articleAPI.getAll().then(res => {
        const articlesData = (Array.isArray(res.data) ? res.data : []);
        const shopArticles = articlesData.filter(a => (a.boutique?._id || a.boutique) === transferData.sourceId);
        setSourceArticles(shopArticles);
        setSelectedArticles([]);
        setTransferQuantities({});
      }).catch(err => console.error(err)).finally(() => setLoadingArticles(false));
    } else {
      setSourceArticles([]);
      setSelectedArticles([]);
      setTransferQuantities({});
    }
  }, [transferData.sourceId]);

  const handleShowModal = (boutique = null) => {
    if (boutique) {
      // ✅ On extrait uniquement les IDs des vendeurs
      let vendeursIds = [];
      if (Array.isArray(boutique.vendeurs)) {
        vendeursIds = boutique.vendeurs.map(v => Number(typeof v === 'object' ? v._id : v));
      } else if (boutique.vendeurs) {
        vendeursIds = [Number(typeof boutique.vendeurs === 'object' ? boutique.vendeurs._id : boutique.vendeurs)];
      }

      setCurrentBoutique({
        ...boutique,
        code: boutique.code || boutique.vcStoreCode || '',
        vendeurs: vendeursIds,
        ville: boutique.ville || '',
        orangeMoneyQrCode: boutique.orangeMoneyQrCode || '',
        orangeMoneyAccount: boutique.orangeMoneyAccount || '',
        mobicashQrCode: boutique.mobicashQrCode || '',
        mobicashAccount: boutique.mobicashAccount || '',
        paycardQrCode: boutique.paycardQrCode || '',
        paycardAccount: boutique.paycardAccount || ''
      });
      setEditMode(true);
    } else {
      setCurrentBoutique({
        code: '', nom: '', adresse: '', ville: '', active: true, type: 'Secondaire',
        vendeurs: [], tipPercentage: 5, tipsEnabled: true,
        orangeMoneyQrCode: '', orangeMoneyAccount: '', mobicashQrCode: '', mobicashAccount: '', paycardQrCode: '', paycardAccount: '',
        latitude: 9.6412, longitude: -13.5784
      });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleShowCreateCentralModal = () => {
    setCurrentBoutique({
      code: 'STORE-PRINCIPAL', nom: 'Dépôt Principal', adresse: 'Adresse du Dépôt Principal',
      ville: '', active: true, type: 'Centrale', vendeurs: [], tipPercentage: 5, tipsEnabled: true,
      orangeMoneyQrCode: '', orangeMoneyAccount: '', mobicashQrCode: '', mobicashAccount: '', paycardQrCode: '', paycardAccount: '',
      latitude: 9.6412, longitude: -13.5784
    });
    setEditMode(false);
    setShowModal(true);
  };

  const handleCloseModal = () => setShowModal(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentBoutique({
      ...currentBoutique,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === "" ? "" : parseFloat(value)) : value)
    });
  };

  const handleQrCodeChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => { setCurrentBoutique({ ...currentBoutique, [field]: event.target.result }); };
      reader.readAsDataURL(file);
    }
  };

  const isGerantTaken = (gerantId) => {
    return boutiques.some(b =>
      b._id !== currentBoutique._id &&
      (b.vendeurs?.some(v => Number(v._id || v) === Number(gerantId)))
    );
  };

  // ✅ CORRECTION MAJEURE : On force la comparaison avec Number() pour éviter les problèmes de type (String vs Int)
  const handleGerantToggle = (gerantId) => {
    const idToToggle = Number(gerantId);
    const currentVendeurs = Array.isArray(currentBoutique.vendeurs) 
      ? currentBoutique.vendeurs.map(Number) 
      : [];
      
    if (currentVendeurs.includes(idToToggle)) {
      setCurrentBoutique({ 
        ...currentBoutique, 
        vendeurs: currentVendeurs.filter(id => id !== idToToggle) 
      });
    } else {
      setCurrentBoutique({ 
        ...currentBoutique, 
        vendeurs: [...currentVendeurs, idToToggle] 
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      if (!currentBoutique.code || !currentBoutique.code.trim()) {
        setError("Le code boutique est obligatoire.");
        return;
      }

      const boutiquePayload = {
        ...currentBoutique,
        code: currentBoutique.code.trim().toUpperCase(),
        vendeurs: (currentBoutique.vendeurs || []).filter(id => id !== '' && !isNaN(id))
      };

      if (boutiquePayload.type === 'Centrale') {
        const existingCentrale = boutiques.find(b => b.type === 'Centrale' && b._id !== boutiquePayload._id);
        if (existingCentrale) {
          setError("Vous ne pouvez avoir qu'un seul Dépôt Principal (Centrale).");
          return;
        }
      }

      const { _id, articleCount, createdAt, updatedAt, __v, ...cleanPayload } = boutiquePayload;

      if (editMode) {
        await boutiqueAPI.update(_id, cleanPayload);
        setSuccessMessage('Boutique modifiée avec succès !');
      } else {
        await boutiqueAPI.create(cleanPayload);
        setSuccessMessage('Boutique créée avec succès !');
      }
      fetchBoutiques();
      handleCloseModal();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Erreur d\'enregistrement');
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferLoading(true);
    setTransferMessage({ type: '', text: '' });
    if (transferData.sourceId === transferData.targetId) {
      setTransferLoading(false);
      return setTransferMessage({ type: 'danger', text: "La boutique source et destination doivent être différentes." });
    }

    if (selectedArticles.length === 0) {
      setTransferLoading(false);
      return setTransferMessage({ type: 'warning', text: "Veuillez sélectionner au moins un article." });
    }

    const articlesPayload = selectedArticles.map(id => ({
      articleId: id,
      quantite: transferQuantities[id] || sourceArticles.find(a => a._id === id)?.quantite || 1
    }));

    try {
      const res = await articleAPI.transferStock({ ...transferData, articles: articlesPayload });
      setShowTransferModal(false);
      setSuccessMessage(res.data.message);
      setTransferData({ sourceId: '', targetId: '' });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setTransferMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du transfert." });
    } finally {
      setTransferLoading(false);
    }
  };

  const executeDelete = async () => {
    try {
      await boutiqueAPI.delete(boutiqueToDelete);
      fetchBoutiques();
      setShowDeleteModal(false);
      setSuccessMessage('Boutique supprimée avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de suppression');
      setShowDeleteModal(false);
    }
  };

  const columns = [
    {
      key: 'nom', label: 'Nom',
      render: (nom, boutique) => (
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div className="d-flex align-items-center">
            <iconify-icon icon={boutique.type === 'Centrale' ? "solar:home-2-bold" : (boutique.type === 'Bar' ? "solar:wine-glass-bold-duotone" : "solar:shop-2-linear")} className={`me-2 fs-5 ${boutique.type === 'Centrale' || boutique.type === 'Bar' ? 'text-primary' : 'text-muted'}`}></iconify-icon>
            <span className={boutique.type === 'Centrale' || boutique.type === 'Bar' ? 'fw-bold text-primary' : ''}>{nom}</span>
            {(boutique.code || boutique.vcStoreCode) && (
              <Badge bg="light" text="dark" className="border ms-2 fw-normal" style={{ fontSize: '0.7rem' }}>
                {boutique.code || boutique.vcStoreCode}
              </Badge>
            )}
          </div>
        </div>
      )
    },
    { key: 'adresse', label: 'Adresse' },
    { key: 'type', label: 'Type', render: (value) => (<Badge pill bg={value === 'Centrale' ? 'primary' : 'secondary'}>{value === 'Centrale' ? 'Dépôt Principal' : (value || 'Secondaire')}</Badge>) },
    { key: 'active', label: 'Statut', render: (value) => (<Badge pill bg={value ? 'success' : 'danger'}>{value ? 'Active' : 'Inactive'}</Badge>) },
    {
      key: 'vendeurs', label: 'Gérants Assignés',
      render: (vendeurs) => {
        const displayList = vendeurs || [];
        return (
          <div className="d-flex flex-wrap gap-1">
            {displayList.length > 0 ? (
              displayList.map((v, i) => (
                <Badge key={i} bg="light" text="dark" className="border fw-normal">
                  <iconify-icon icon="solar:user-bold" className="me-1 small"></iconify-icon>
                  {typeof v === 'object' ? (v.nom || 'Gérant') : 'Gérant'}
                </Badge>
              ))
            ) : <span className="text-muted small italic">Aucun</span>}
          </div>
        );
      }
    },
    {
      key: 'actions', label: 'Actions',
      render: (_, boutique) => (
        <div className="d-flex gap-2">
          <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(boutique)}><iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon></Button>
          <Button variant="link" className="text-danger p-0" onClick={() => { setBoutiqueToDelete(boutique._id); setShowDeleteModal(true); }}><iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon></Button>
        </div>
      )
    }
  ];

  const filteredBoutiques = (boutiques || []).filter(b => b.nom.toLowerCase().includes(searchTerm.toLowerCase()));
  const currentBoutiques = filteredBoutiques.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredBoutiques.length / itemsPerPage);

  if (loading) return <Spinner animation="border" />;

  return (
    <ErrorBoundary>
      <div className="p-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
          <h3 className="fw-bold mb-0 text-body">Gestion des Boutiques</h3>
          <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">Ajouter une Boutique</Button>
        </div>

        <div className="mb-4">
          <Form.Control type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{ maxWidth: '300px' }} className="shadow-sm" />
        </div>

        {successMessage && <Alert variant="success">{successMessage}</Alert>}
        {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
          <Card.Body className="p-0">
            <TableComponent columns={columns} data={currentBoutiques} emptyMessage="Aucune boutique trouvée" />
            {totalPages > 1 && (
              <div className="d-flex justify-content-center p-3 border-top">
                <Pagination className="mb-0">
                  <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                  <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                </Pagination>
              </div>
            )}
          </Card.Body>
        </Card>

        {/* MODALE EDITION / CREATION */}
        <Modal show={showModal} onHide={handleCloseModal}>
          <Modal.Header closeButton><Modal.Title>{editMode ? 'Modifier' : 'Nouvelle'} Boutique</Modal.Title></Modal.Header>
          <Form onSubmit={handleSubmit}>
            <Modal.Body>
              <Form.Group className="mb-3"><Form.Label>Nom</Form.Label><Form.Control type="text" name="nom" value={currentBoutique.nom} onChange={handleChange} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Code <span className="text-danger">*</span></Form.Label><Form.Control type="text" name="code" value={currentBoutique.code || ''} onChange={handleChange} required maxLength={20} /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Adresse</Form.Label><Form.Control as="textarea" name="adresse" value={currentBoutique.adresse} onChange={handleChange} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Ville</Form.Label><Form.Control type="text" name="ville" value={currentBoutique.ville} onChange={handleChange} required /></Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Type</Form.Label>
                <Form.Select name="type" value={currentBoutique.type} onChange={handleChange} required>
                  <option value="Secondaire">Secondaire</option>
                  <option value="Bar">Bar</option>
                  <option value="Centrale">Dépôt Principal</option>
                </Form.Select>
              </Form.Group>

              {/* ✅ SECTION GÉRANTS CORRIGÉE */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Assigner des Gérants</Form.Label>
                <div className="border rounded p-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {allGerants.length > 0 ? (
                    allGerants.map(gerant => {
                      const gerantId = Number(gerant._id);
                      const isTaken = isGerantTaken(gerantId);
                      const isChecked = currentBoutique.vendeurs.includes(gerantId);

                      return (
                        <Form.Check
                          key={gerantId}
                          type="checkbox"
                          id={`gerant-${gerantId}`}
                          label={<span>{gerant.nom} {isTaken && <small className="text-danger ms-1">(Déjà assigné)</small>}</span>}
                          checked={isChecked}
                          onChange={() => handleGerantToggle(gerantId)}
                          disabled={isTaken}
                          className="mb-1"
                        />
                      );
                    })
                  ) : (
                    <small className="text-muted italic">Aucun gérant disponible.</small>
                  )}
                </div>
                <Form.Text className="text-muted">{currentBoutique.vendeurs.length} gérant(s) sélectionné(s)</Form.Text>
              </Form.Group>

              <div className="row">
                <div className="col-md-6"><Form.Group className="mb-3"><Form.Label>Latitude</Form.Label><Form.Control type="number" step="any" name="latitude" value={currentBoutique.latitude} onChange={handleChange} /></Form.Group></div>
                <div className="col-md-6"><Form.Group className="mb-3"><Form.Label>Longitude</Form.Label><Form.Control type="number" step="any" name="longitude" value={currentBoutique.longitude} onChange={handleChange} /></Form.Group></div>
              </div>
              <Form.Group className="mb-3"><Form.Check type="checkbox" name="active" label="Boutique active" checked={currentBoutique.active} onChange={handleChange} /></Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={handleCloseModal}>Annuler</Button>
              <Button variant="primary" type="submit">{editMode ? 'Modifier' : 'Créer'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* MODALE SUPPRESSION */}
        <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
          <Modal.Header closeButton><Modal.Title className="text-danger">Supprimer la boutique ?</Modal.Title></Modal.Header>
          <Modal.Body>Cette action est irréversible.</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
            <Button variant="danger" onClick={executeDelete}>Supprimer</Button>
          </Modal.Footer>
        </Modal>
      </div>
    </ErrorBoundary>
  );
};

export default ShopsView;