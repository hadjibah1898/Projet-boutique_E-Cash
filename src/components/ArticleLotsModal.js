import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, Form, Spinner, Alert, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { articleAPI } from '../services/api';

const ArticleLotsModal = ({ show, onHide, article, storeId }) => {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (show && article) {
      fetchLots();
    }
  }, [show, article, storeId]);

  const fetchLots = async () => {
    setLoading(true);
    try {
      const res = await articleAPI.getProductLots(article._id, storeId);
      const data = Array.isArray(res) ? res : (res?.data || []);
      setLots(data);
    } catch (err) {
      toast.error("Impossible de charger les lots.");
      onHide();
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (lotId, newDate) => {
    setLots(lots.map(l => l.stockLotId === lotId ? { ...l, dtExpirationAt: newDate } : l));
  };

  const handleSaveDate = async (lot) => {
    if (!lot.dtExpirationAt) return toast.warning("Veuillez saisir une date.");
    setSavingId(lot.stockLotId);
    try {
      await articleAPI.updateLotExpiration(article._id, lot.stockLotId, storeId, lot.dtExpirationAt);
      toast.success("Date de péremption mise à jour !");
    } catch (err) {
      toast.error(err.response?.data?.message || "Erreur lors de la mise à jour.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton className="bg-light">
        <Modal.Title className="fw-bold">Gestion des Lots & Péremption</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="small mb-3">
          <iconify-icon icon="solar:info-circle-bold" className="me-2"></iconify-icon>
          La modification d'un lot ne modifie pas les autres. Article : <strong>{article?.nom}</strong>
        </Alert>

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : lots.length === 0 ? (
          <Alert variant="warning">Aucun lot actif trouvé pour cet article dans cette boutique.</Alert>
        ) : (
          <Table responsive hover className="align-middle">
            <thead className="table-light">
              <tr>
                <th>N° Lot</th>
                <th>Qté Initiale</th>
                <th>Qté Restante</th>
                <th>Date de Péremption</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const dateValue = lot.dtExpirationAt ? lot.dtExpirationAt.split('T')[0] : '';
                const isExpiring = dateValue && new Date(dateValue) < new Date();
                
                return (
                  <tr key={lot.stockLotId}>
                    <td><Badge bg="secondary">{lot.vcLotNumber}</Badge></td>
                    <td>{lot.dcInitialQuantity}</td>
                    <td className="fw-bold">{lot.dcRemainingQuantity}</td>
                    <td>
                      <Form.Control 
                        type="date" 
                        size="sm"
                        value={dateValue}
                        onChange={(e) => handleDateChange(lot.stockLotId, e.target.value)}
                        className={isExpiring ? 'border-danger text-danger fw-bold' : ''}
                      />
                    </td>
                    <td>
                      <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={() => handleSaveDate(lot)}
                        disabled={savingId === lot.stockLotId}
                      >
                        {savingId === lot.stockLotId ? <Spinner size="sm" /> : 'Enregistrer'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light">
        <Button variant="secondary" onClick={onHide}>Fermer</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ArticleLotsModal;