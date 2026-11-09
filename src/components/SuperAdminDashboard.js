// src/components/SuperAdminDashboard.js
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spinner, Alert, Badge, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { dashboardAPI, authAPI } from '../services/api';

const SuperAdminDashboard = () => {
    const [stats, setStats] = useState(null);
    const [pendingRegistrations, setPendingRegistrations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadPendingRegistrations = async () => {
        try {
            const regs = await authAPI.getPendingAdminRegistrations();
            setPendingRegistrations(Array.isArray(regs) ? regs : []);
        } catch (err) {
            // Non bloquant : le tableau reste vide mais le reste du dashboard fonctionne
            setPendingRegistrations([]);
        }
    };

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await dashboardAPI.getSuperAdminStats();
                setStats(res);
            } catch (err) {
                setError("Impossible de charger les statistiques globales.");
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
        loadPendingRegistrations();
    }, []);

    // Rafraîchissement après traitement d'une demande
    useEffect(() => {
        const handler = () => loadPendingRegistrations();
        window.addEventListener('registrationProcessed', handler);
        return () => window.removeEventListener('registrationProcessed', handler);
    }, []);

    const formatCurrency = (amount) => {
        return (Number(amount) || 0).toLocaleString('fr-FR') + ' GNF';
    };

    if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold">Tableau de Bord Global</h3>
                <Badge bg="dark" className="p-2">SuperAdmin</Badge>
            </div>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

            {/* Cartes de résumé */}
            <Row className="mb-4 g-3">
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm bg-primary-subtle text-primary h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Entreprises (Admins)</h6>
                                <h4 className="fw-bold mb-0">{stats?.totalAdmins || 0}</h4>
                            </div>
                            <iconify-icon icon="solar:shop-2-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm bg-success-subtle text-success h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Boutiques</h6>
                                <h4 className="fw-bold mb-0">{stats?.totalBoutiques || 0}</h4>
                            </div>
                            <iconify-icon icon="solar:shop-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm bg-warning-subtle text-warning h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Utilisateurs</h6>
                                <h4 className="fw-bold mb-0">{stats?.totalUsers || 0}</h4>
                            </div>
                            <iconify-icon icon="solar:users-group-two-rounded-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm bg-info-subtle text-info h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Chiffre d'Affaires Global</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(stats?.totalCA)}</h4>
                            </div>
                            <iconify-icon icon="solar:wallet-money-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Statistiques détaillées */}
            <Row className="mb-4 g-3">
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                            <h6 className="text-muted">Gérants</h6>
                            <h4 className="fw-bold">{stats?.totalGerants || 0}</h4>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                            <h6 className="text-muted">Boutiques Marchand</h6>
                            <h4 className="fw-bold">{stats?.totalMarchands || 0}</h4>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                            <h6 className="text-muted">Boutiques Bar</h6>
                            <h4 className="fw-bold">{stats?.totalBars || 0}</h4>
                        </Card.Body>
                    </Card>
                </Col>
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Body>
                            <h6 className="text-muted">Total Ventes</h6>
                            <h4 className="fw-bold">{stats?.totalVentes || 0}</h4>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Liste des entreprises */}
            <Card className="border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <Card.Header className="bg-white py-3">
                    <h5 className="fw-bold mb-0">Entreprises enregistrées</h5>
                </Card.Header>
                <Card.Body className="p-0">
                    <Table hover responsive className="align-middle mb-0">
                        <thead className="bg-light">
                            <tr>
                                <th className="ps-4 py-3">Nom</th>
                                <th>Email</th>
                                <th>Type</th>
                                <th>Boutiques</th>
                                <th>Statut</th>
                                <th className="pe-4">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(stats?.entreprises || []).map(ent => (
                                <tr key={ent._id}>
                                    <td className="ps-4 fw-bold">{ent.nom}</td>
                                    <td>{ent.email}</td>
                                    <td>
                                        {ent.typeCompte === 'Bar' 
                                            ? <Badge bg="dark">Bar</Badge> 
                                            : <Badge bg="primary">Marchand</Badge>}
                                    </td>
                                    <td>{ent.nbBoutiques || 0}</td>
                                    <td>
                                        {ent.active 
                                            ? <Badge bg="success">Actif</Badge> 
                                            : <Badge bg="warning" text="dark">En attente</Badge>}
                                    </td>
                                    <td className="pe-4">{new Date(ent.createdAt).toLocaleDateString('fr-FR')}</td>
                                </tr>
                            ))}
                            {(stats?.entreprises || []).length === 0 && (
                                <tr><td colSpan="6" className="text-center py-4 text-muted">Aucune entreprise enregistrée.</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
            {/* Validation des inscriptions Admin en attente */}
            <Card className="border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
                    <h5 className="fw-bold mb-0">📋 Demandes d'inscription Admin</h5>
                    <Link to="/admin/registrations/pending" className="btn btn-primary">
                        Voir et valider les demandes
                    </Link>
                </Card.Header>
                <Card.Body className="p-0">
                    <Table hover responsive className="align-middle mb-0">
                        <thead className="bg-light">
                            <tr>
                                <th className="ps-4 py-3">Nom</th>
                                <th>Email</th>
                                <th>Entreprise</th>
                                <th>Date demande</th>
                                <th className="pe-4">Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingRegistrations.map((reg) => {
                                const d = reg.dtRequestedAt ? new Date(reg.dtRequestedAt) : null;
                                return (
                                    <tr key={reg.registrationRequestId}>
                                        <td className="ps-4 fw-bold">{reg.vcLastName || ''} {reg.vcFirstName || ''}</td>
                                        <td>{reg.vcEmail}</td>
                                        <td>{reg.vcCompanyName}</td>
                                        <td>{d ? d.toLocaleDateString('fr-FR') : '—'}</td>
                                        <td className="pe-4"><Badge bg="warning" text="dark">En attente</Badge></td>
                                    </tr>
                                );
                            })}
                            {pendingRegistrations.length === 0 && (
                                <tr><td colSpan="5" className="text-center py-4 text-muted">Aucune demande en attente.</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </div>
    );
};

export default SuperAdminDashboard;