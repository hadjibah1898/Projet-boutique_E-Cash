/**
 * @file GerantCaisseValidation.js
 * @description Vue de validation des rapports de caisse pour le Gérant.
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Spinner, Alert, Modal, Row, Col } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { caisseAPI } from '../services/api';
import { toast } from 'react-toastify';

const GerantCaisseValidation = () => {
    const [rapports, setRapports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRapport, setSelectedRapport] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [rapportDetails, setRapportDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [caisseOuverte, setCaisseOuverte] = useState(null);
    const [checkingCaisse, setCheckingCaisse] = useState(true);

    useEffect(() => {
        loadRapports();
        checkCaisseStatus();
    }, []);

    const checkCaisseStatus = async () => {
        try {
            setCheckingCaisse(true);
            const statut = await caisseAPI.getStatut();
            setCaisseOuverte(!!statut);
        } catch (err) {
            setCaisseOuverte(false);
        } finally {
            setCheckingCaisse(false);
        }
    };

    const loadRapports = async () => {
        try {
            setLoading(true);
            const res = await caisseAPI.listerRapports();
            const data = Array.isArray(res) ? res : (res?.data || []);
            
            // Sécurité : on ne garde que ceux en attente
            const rapportsEnAttente = data.filter(r => r.cashReportStatusId === 1);
            setRapports(rapportsEnAttente);
        } catch (err) {
            console.error("Erreur API loadRapports:", err);
            toast.error(err.response?.data?.message || "Erreur lors du chargement des rapports");
        } finally {
            setLoading(false);
        }
    };

    const extractId = (rapport) => {
        return rapport?.cashReportId || rapport?.cashSessionId || rapport?.id;
    };

    const handleViewDetails = async (rapport) => {
        setSelectedRapport(rapport);
        setShowDetailModal(true);
        setLoadingDetails(true);
        try {
            const id = extractId(rapport);
            const res = await caisseAPI.getReportDetails(id);
            setRapportDetails(res);
        } catch (err) {
            console.error("Erreur API details:", err);
            toast.error(err.response?.data?.message || "Erreur lors du chargement des détails");
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleValidate = async (rapportId) => {
        if (!rapportId) return toast.error("ID du rapport invalide.");
        if (!window.confirm("Êtes-vous sûr de vouloir valider ce rapport ?")) return;

        setActionLoading(rapportId);
        try {
            await caisseAPI.validerRapport(rapportId, { commentairesAdmin: 'Validé par le gérant' });
            toast.success("Rapport validé avec succès !");
            setShowDetailModal(false);
            loadRapports();
        } catch (err) {
            toast.error(err.response?.data?.message || "Erreur lors de la validation");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (rapportId) => {
        if (!rapportId) return toast.error("ID du rapport invalide.");
        const motif = prompt("Motif du rejet (obligatoire) :");
        if (!motif) return;

        setActionLoading(rapportId);
        try {
            await caisseAPI.rejeterRapport(rapportId, { commentairesAdmin: motif });
            toast.success("Rapport rejeté avec succès !");
            setShowDetailModal(false);
            loadRapports();
        } catch (err) {
            toast.error(err.response?.data?.message || "Erreur lors du rejet");
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (statusId) => {
        if (statusId === 1) return <Badge bg="warning">En attente</Badge>;
        if (statusId === 2) return <Badge bg="info">Validé Gérant</Badge>;
        if (statusId === 3) return <Badge bg="success">Validé Admin</Badge>;
        if (statusId === 4) return <Badge bg="danger">Rejeté</Badge>;
        return <Badge bg="secondary">Inconnu</Badge>;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const formatMoney = (amount) => {
        const num = Number(amount);
        if (isNaN(num)) return '0 GNF';
        return num.toLocaleString() + ' GNF';
    };

    if (loading) {
        return <div className="text-center p-5"><Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} /></div>;
    }

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Validation des Rapports Caissiers</h3>
                    <p className="text-muted mb-0">Validez ou rejetez les rapports de clôture de vos caissiers</p>
                </div>
                <Button variant="outline-primary" onClick={loadRapports} className="rounded-pill">
                    <iconify-icon icon="solar:refresh-bold" className="me-2"></iconify-icon>
                    Actualiser
                </Button>
            </div>

            {!checkingCaisse && caisseOuverte === false && (
                <Alert variant="warning" className="d-flex align-items-center justify-content-between mb-4">
                    <div className="d-flex align-items-center">
                        <iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '32px' }} className="me-3 text-danger"></iconify-icon>
                        <div>
                            <strong>Votre caisse est fermée.</strong><br />
                            <span className="small">Vous devez ouvrir votre caisse avant de pouvoir valider ou rejeter les rapports de vos caissiers.</span>
                        </div>
                    </div>
                    <Link to="/gerant-dashboard/caisse" className="btn btn-danger rounded-pill">Ouvrir ma caisse</Link>
                </Alert>
            )}

            {rapports.length === 0 ? (
                <Alert variant="info" className="text-center">
                    <iconify-icon icon="solar:clipboard-list-bold-duotone" style={{ fontSize: '48px' }} className="mb-2"></iconify-icon>
                    <p className="mb-0">Aucun rapport de caisse en attente de validation pour le moment.</p>
                </Alert>
            ) : (
                <Card className="border-0 shadow-sm">
                    <Card.Body className="p-0">
                        <Table responsive hover className="align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Date</th>
                                    <th>Caissier</th>
                                    <th>Fond Initial</th>
                                    <th>Total Ventes</th>
                                    <th>Montant Clôture</th>
                                    <th>Écart</th>
                                    <th>Statut</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rapports.map(rapport => {
                                    const currentId = extractId(rapport);
                                    const currentStatus = rapport.cashReportStatusId;
                                    
                                    return (
                                    <tr key={currentId || Math.random()}>
                                        {/* ✅ CORRECTION : dtCreatedAt */}
                                        <td className="ps-4"><div className="fw-bold">{formatDate(rapport.dtCreatedAt)}</div></td>
                                        <td>{rapport.userName || 'Caissier'}</td>
                                        <td>{formatMoney(rapport.mOpeningCaisse)}</td>
                                        <td className="fw-bold text-success">+{formatMoney(rapport.mTotalSales)}</td>
                                        
                                        {/* ✅ CORRECTION : mClosingAmount et mDifferenceAmount */}
                                        <td className="fw-bold">{formatMoney(rapport.mClosingAmount)}</td>
                                        <td>
                                            <span className={`fw-bold ${rapport.mDifferenceAmount === 0 ? 'text-success' : 'text-danger'}`}>
                                                {rapport.mDifferenceAmount === 0 ? '✓ 0' : `${rapport.mDifferenceAmount > 0 ? '+' : ''}${formatMoney(rapport.mDifferenceAmount)}`}
                                            </span>
                                        </td>
                                        <td>{getStatusBadge(currentStatus)}</td>
                                        <td className="text-end pe-4">
                                            <Button variant="outline-primary" size="sm" onClick={() => handleViewDetails(rapport)} className="me-1">
                                                <iconify-icon icon="solar:eye-bold"></iconify-icon>
                                            </Button>
                                            {currentStatus === 1 && (
                                                <>
                                                    <Button variant="outline-success" size="sm" onClick={() => handleValidate(currentId)} disabled={actionLoading === currentId} className="me-1">
                                                        {actionLoading === currentId ? <Spinner size="sm" /> : <iconify-icon icon="solar:check-circle-bold"></iconify-icon>}
                                                    </Button>
                                                    <Button variant="outline-danger" size="sm" onClick={() => handleReject(currentId)} disabled={actionLoading === currentId}>
                                                        {actionLoading === currentId ? <Spinner size="sm" /> : <iconify-icon icon="solar:close-circle-bold"></iconify-icon>}
                                                    </Button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </Table>
                    </Card.Body>
                </Card>
            )}

            {/* Modale de détails */}
            <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg">
                <Modal.Header closeButton><Modal.Title>Détails du Rapport</Modal.Title></Modal.Header>
                <Modal.Body>
                    {loadingDetails ? (
                        <div className="text-center p-5"><Spinner animation="border" /></div>
                    ) : rapportDetails ? (
                        <div>
                            <Row className="g-3 mb-4">
                                <Col md={6}>
                                    <Card className="bg-light">
                                        <Card.Body>
                                            <h6 className="text-muted mb-2">Informations Générales</h6>
                                            {/* ✅ CORRECTION : dtCreatedAt */}
                                            <p className="mb-1"><strong>Date :</strong> {formatDate(rapportDetails.rapport?.dtCreatedAt)}</p>
                                            <p className="mb-1"><strong>Caissier :</strong> {rapportDetails.rapport?.userName || 'N/A'}</p>
                                            <p className="mb-0"><strong>Boutique :</strong> {rapportDetails.rapport?.storeName || 'N/A'}</p>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={6}>
                                    <Card className="bg-light">
                                        <Card.Body>
                                            <h6 className="text-muted mb-2">Résumé Financier</h6>
                                            <p className="mb-1"><strong>Fond Initial :</strong> {formatMoney(rapportDetails.rapport?.mOpeningCaisse)}</p>
                                            <p className="mb-1"><strong>Total Ventes :</strong> {formatMoney(rapportDetails.rapport?.mTotalSales)}</p>
                                            {/* ✅ CORRECTION : mClosingAmount */}
                                            <p className="mb-0"><strong>Montant Clôture :</strong> {formatMoney(rapportDetails.rapport?.mClosingAmount)}</p>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            </Row>
                            <Row className="g-3 mb-4">
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-success-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Solde Théorique</h6>
                                            <h4 className="fw-bold text-success">{formatMoney(rapportDetails.rapport?.mTheoreticalBalance)}</h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-info-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Écart</h6>
                                            {/* ✅ CORRECTION : mDifferenceAmount */}
                                            <h4 className={`fw-bold ${rapportDetails.rapport?.mDifferenceAmount === 0 ? 'text-success' : 'text-danger'}`}>
                                                {formatMoney(rapportDetails.rapport?.mDifferenceAmount)}
                                            </h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-warning-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Statut</h6>
                                            <h4 className="fw-bold">{getStatusBadge(rapportDetails.rapport?.cashReportStatusId)}</h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            </Row>
                        </div>
                    ) : <Alert variant="info">Aucun détail disponible</Alert>}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDetailModal(false)}>Fermer</Button>
                    {selectedRapport && selectedRapport.cashReportStatusId === 1 && (
                        <>
                            <Button variant="success" onClick={() => handleValidate(extractId(selectedRapport))} disabled={actionLoading === extractId(selectedRapport)}>Valider</Button>
                            <Button variant="danger" onClick={() => handleReject(extractId(selectedRapport))} disabled={actionLoading === extractId(selectedRapport)}>Rejeter</Button>
                        </>
                    )}
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GerantCaisseValidation;