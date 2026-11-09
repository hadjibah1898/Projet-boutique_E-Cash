/**
 * @file BarDashboard.js
 * @description Tableau de bord Bar (AdminBar, GérantBar) : stats spécifiques bar, doses.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Row, Col, Card, Badge, Button, Table, Spinner, Alert, Modal, Form, ProgressBar } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { articleAPI, caisseAPI, mouvementAPI, dashboardAPI, boutiqueAPI } from '../services/api';
import { toast } from 'react-toastify';
import NotificationPopover from './NotificationPopover';
import Chart from 'react-apexcharts';

const BarDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        ventesAujourdhui: 0,
        revenuAujourdhui: 0,
        totalArticles: 0,
        articlesPeuStock: 0,
        salesProfit: { categories: [], series: [] }
    });
    const [allArticles, setAllArticles] = useState([]);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [isCaisseOpen, setIsCaisseOpen] = useState(false);
    const [boutiqueConfig, setBoutiqueConfig] = useState(null);

    // État pour la maintenance
    const [showLossModal, setShowLossModal] = useState(false);
    const [lossFormData, setLossFormData] = useState({ articleId: '', quantite: 1, raison: 'Casse', details: '' });

    const fetchData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            const boutiqueId = localStorage.getItem('boutiqueId');

            const [dashboardRes, articlesRes, caisseRes, mvtsRes, boutiqueRes] = await Promise.all([
                dashboardAPI.getStats({ range: 'monthly' }),
                articleAPI.getAll({ boutique: boutiqueId, limit: 0 }),
                caisseAPI.getStatut().catch(() => ({ data: null })),
                mouvementAPI.getAll({ type: 'Transfert', statutTransfert: 'EXPEDIE' }),
                boutiqueAPI.getDetailsForServeur(boutiqueId)
            ]);

            const dStats = dashboardRes.data || {};
            const caisseData = caisseRes?.data;
            const rawArticles = Array.isArray(articlesRes.data) ? articlesRes.data : (articlesRes.data?.data || []);
            const rawMvts = mvtsRes.data || [];
            const mvtsList = Array.isArray(rawMvts) ? rawMvts : (rawMvts?.data || []);

            setBoutiqueConfig(boutiqueRes?.data);
            setAllArticles(rawArticles);
            setPendingTransfers(mvtsList.filter(m => (m.boutiqueDestination?._id || m.boutiqueDestination) === boutiqueId));
            setIsCaisseOpen(!!caisseData);
            setStats({
                ventesAujourdhui: caisseData ? (caisseData.session?.nombreVentes || 0) : 0,
                revenuAujourdhui: caisseData ? (caisseData.session?.totalVentes || 0) : 0,
                totalArticles: rawArticles.length,
                articlesPeuStock: rawArticles.filter(a => a.quantite <= (a.seuilAlerte || 10)).length,
                salesProfit: dStats.salesProfit || { categories: [], series: [] }
            });
        } catch (err) {
            console.error("Erreur Dashboard Bar:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const revenueChartOptions = useMemo(() => ({
        chart: { type: 'area', toolbar: { show: false }, foreColor: '#cdd9e5' },
        colors: ['#8957e5'],
        stroke: { curve: 'smooth', width: 3 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 } },
        xaxis: { categories: stats.salesProfit?.categories || [] },
        grid: { borderColor: '#444c56' },
        tooltip: { theme: 'dark' }
    }), [stats.salesProfit]);

    if (loading) return <div className="p-5 text-center"><Spinner animation="border" variant="primary" /></div>;

    return (
        <div className="p-4 bar-account-theme animate__animated animate__fadeIn">
            {/* En-tête Spécifique Bar */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h2 className="fw-bold mb-0 text-primary">
                        <iconify-icon icon="solar:wine-glass-bold-duotone" className="me-2"></iconify-icon>
                        Gestion du Bar
                    </h2>
                    <p className="text-muted mb-0">Maintenance du stock et suivi des consommations bouteilles.</p>
                </div>
                <div className="d-flex gap-2">
                    <NotificationPopover />
                    <Button as={Link} to="/gerant/ventes" variant="primary" className="rounded-pill px-4 shadow-neon fw-bold">
                        <iconify-icon icon="solar:cart-plus-bold" className="me-2"></iconify-icon>
                        Vente Tactile
                    </Button>
                </div>
            </div>

            {/* Alertes de maintenance */}
            {pendingTransfers.length > 0 && (
                <Alert variant="info" className="border-0 shadow-sm rounded-4 mb-4">
                    <iconify-icon icon="solar:delivery-bold" className="me-2"></iconify-icon>
                    <strong>{pendingTransfers.length} Colis en route :</strong> Réceptionnez vos bouteilles pour mettre à jour le stock.
                </Alert>
            )}

            {/* Stats Flash */}
            <Row className="g-4 mb-4">
                <Col lg={3} sm={6}>
                    <Card className="stat-card-bar bg-primary-subtle border-0 h-100">
                        <Card.Body>
                            <h6 className="text-primary-emphasis text-uppercase small fw-bold">Recette Session</h6>
                            <h3 className="fw-bold mb-0 text-primary">{stats.revenuAujourdhui.toLocaleString()} GNF</h3>
                            <ProgressBar now={100} variant="primary" className="mt-2" style={{ height: '4px' }} />
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="stat-card-bar bg-success-subtle border-0 h-100">
                        <Card.Body>
                            <h6 className="text-success-emphasis text-uppercase small fw-bold">Bouteilles Vendues</h6>
                            <h3 className="fw-bold mb-0 text-success">{stats.ventesAujourdhui}</h3>
                            <ProgressBar now={100} variant="success" className="mt-2" style={{ height: '4px' }} />
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="stat-card-bar bg-danger-subtle border-0 h-100">
                        <Card.Body>
                            <h6 className="text-danger-emphasis text-uppercase small fw-bold">Alertes Rupture</h6>
                            <h3 className="fw-bold mb-0 text-danger">{stats.articlesPeuStock}</h3>
                            <ProgressBar now={(stats.articlesPeuStock / stats.totalArticles) * 100} variant="danger" className="mt-2" style={{ height: '4px' }} />
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="stat-card-bar bg-info-subtle border-0 h-100">
                        <Card.Body>
                            <h6 className="text-info-emphasis text-uppercase small fw-bold">Caisse Status</h6>
                            <h3 className="fw-bold mb-0 text-info">{isCaisseOpen ? 'OUVERTE' : 'FERMÉE'}</h3>
                            <Link to="/gerant/caisse" className="small text-decoration-none">Gérer la session →</Link>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="g-4">
                {/* Graphique de maintenance */}
                <Col lg={8}>
                    <Card className="border-0 shadow-sm rounded-4 mb-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-4">Flux des Ventes (Session)</h5>
                            <Chart options={revenueChartOptions} series={[{ name: 'Revenu', data: stats.salesProfit.series?.[0]?.data || [] }]} type="area" height={300} />
                        </Card.Body>
                    </Card>

                    {/* Section Maintenance : Articles Critiques */}
                    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                        <Card.Header className="bg-body py-3 d-flex justify-content-between align-items-center">
                            <h5 className="fw-bold mb-0">Maintenance de l'Inventaire</h5>
                            <Button variant="outline-danger" size="sm" className="rounded-pill" onClick={() => setShowLossModal(true)}>
                                <iconify-icon icon="solar:danger-triangle-bold" className="me-1"></iconify-icon>
                                Déclarer Casse
                            </Button>
                        </Card.Header>
                        <Card.Body className="p-0">
                            <Table hover responsive className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4">Produit</th>
                                        <th className="text-center">Stock</th>
                                        <th className="text-center">Statut</th>
                                        <th className="pe-4 text-end">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allArticles.filter(a => a.quantite <= (a.seuilAlerte || 10)).slice(0, 6).map(article => (
                                        <tr key={article._id}>
                                            <td className="ps-4 fw-bold">{article.nom}</td>
                                            <td className="text-center">
                                                <Badge bg={article.quantite === 0 ? 'danger' : 'warning'} pill>{article.quantite}</Badge>
                                            </td>
                                            <td className="text-center">
                                                {article.quantite === 0 ? 'RUPTURE' : 'CRITIQUE'}
                                            </td>
                                            <td className="pe-4 text-end">
                                                <Button as={Link} to="/gerant/articles" variant="link" size="sm">Approvisionner</Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {allArticles.filter(a => a.quantite <= 10).length === 0 && (
                                        <tr><td colSpan="4" className="text-center py-4 text-muted small">Aucune anomalie de stock détectée.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Col>

                {/* Raccourcis Rapides */}
                <Col lg={4}>
                    <Card className="border-0 shadow-sm rounded-4 bg-dark text-white mb-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-3">Actions de Maintenance</h5>
                            <div className="d-grid gap-2">
                                <Button as={Link} to="/gerant/articles?tab=receptions" variant="outline-info" className="text-start py-3 rounded-4 border-dashed">
                                    <iconify-icon icon="solar:box-bold" className="me-2 fs-4 align-middle"></iconify-icon>
                                    Valider Réceptions Bouteilles
                                </Button>
                                <Button as={Link} to="/gerant/historique" variant="outline-light" className="text-start py-3 rounded-4 border-dashed">
                                    <iconify-icon icon="solar:history-bold" className="me-2 fs-4 align-middle"></iconify-icon>
                                    Vérifier Dernières Ventes
                                </Button>
                                <Button as={Link} to="/gerant/equipe" variant="outline-light" className="text-start py-3 rounded-4 border-dashed">
                                    <iconify-icon icon="solar:users-group-bold" className="me-2 fs-4 align-middle"></iconify-icon>
                                    Superviser les Serveurs
                                </Button>
                            </div>
                        </Card.Body>
                    </Card>

                    {/* Info Boutique */}
                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="text-muted text-uppercase small fw-bold">Établissement</h6>
                            <div className="d-flex align-items-center mt-3">
                                <div className="bg-primary-subtle text-primary rounded-circle p-3 me-3">
                                    <iconify-icon icon="solar:wine-glass-bold" style={{ fontSize: '24px' }}></iconify-icon>
                                </div>
                                <div>
                                    <h6 className="fw-bold mb-0">{boutiqueConfig?.nom || 'Mon Bar'}</h6>
                                    <p className="text-muted small mb-0">{boutiqueConfig?.adresse || 'Adresse...'}</p>
                                </div>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Modale de Casse (Identique au Dashboard Gérant mais intégrée ici) */}
            <Modal show={showLossModal} onHide={() => setShowLossModal(false)} centered>
                <Modal.Header closeButton className="border-0">
                    <Modal.Title className="fw-bold">Déclarer une Bouteille Cassée / Perte</Modal.Title>
                </Modal.Header>
                <Form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                        await mouvementAPI.declarerPerte(lossFormData);
                        toast.success("Perte enregistrée.");
                        setShowLossModal(false);
                        fetchData(true);
                    } catch (err) { toast.error("Erreur d'enregistrement."); }
                }}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted">Bouteille concernée</Form.Label>
                            <Form.Select required value={lossFormData.articleId} onChange={e => setLossFormData({ ...lossFormData, articleId: e.target.value })}>
                                <option value="">Sélectionner...</option>
                                {allArticles.map(a => <option key={a._id} value={a._id}>{a.nom} (Stock: {a.quantite})</option>)}
                            </Form.Select>
                        </Form.Group>
                        <Row>
                            <Col xs={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted">Quantité</Form.Label>
                                    <Form.Control type="number" min="1" required value={lossFormData.quantite} onChange={e => setLossFormData({ ...lossFormData, quantite: e.target.value })} />
                                </Form.Group>
                            </Col>
                            <Col xs={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted">Raison</Form.Label>
                                    <Form.Select value={lossFormData.raison} onChange={e => setLossFormData({ ...lossFormData, raison: e.target.value })}>
                                        <option value="Casse">Casse Bouteille</option>
                                        <option value="Péremption">Péremption</option>
                                        <option value="Vol">Vol / Manquant</option>
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        </Row>
                        <Form.Group>
                            <Form.Label className="small fw-bold text-muted">Détails</Form.Label>
                            <Form.Control as="textarea" rows={2} value={lossFormData.details} onChange={e => setLossFormData({ ...lossFormData, details: e.target.value })} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer className="border-0">
                        <Button variant="light" onClick={() => setShowLossModal(false)}>Annuler</Button>
                        <Button variant="danger" type="submit" className="rounded-pill px-4">Valider</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default BarDashboard;