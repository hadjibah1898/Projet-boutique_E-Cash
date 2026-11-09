/**
 * @file CaissierDashboard.js
 * @description Tableau de bord Caissier : résumé des ventes, accès rapide POS.
 */

import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Button, Badge, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { caisseAPI, venteAPI } from '../services/api';
import { toast } from 'react-toastify';

const CaissierDashboard = () => {
    const navigate = useNavigate();
    const userName = localStorage.getItem('userName') || 'Caissier';
    
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        ventesAujourdhui: 0,
        nombreTransactions: 0,
        montantTotal: 0
    });

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const [caisseRes, ventesRes] = await Promise.all([
                caisseAPI.getStatut().catch(() => null),
                venteAPI.getHistorique({ limit: 100 }).catch(() => null)
            ]);

            setCaisseStatut(caisseRes || null);

            // Calculer les statistiques du jour
            if (ventesRes?.data?.ventes || ventesRes?.ventes) {
                const ventes = ventesRes.data?.ventes || ventesRes.ventes || [];
                const aujourdhui = new Date();
                aujourdhui.setHours(0, 0, 0, 0);

                const ventesDuJour = ventes.filter(v => {
                    const dateVente = new Date(v.createdAt);
                    dateVente.setHours(0, 0, 0, 0);
                    return dateVente.getTime() === aujourdhui.getTime() && !v.isCancelled;
                });

                setStats({
                    ventesAujourdhui: ventesDuJour.length,
                    nombreTransactions: ventesDuJour.length,
                    montantTotal: ventesDuJour.reduce((sum, v) => sum + (v.totalGroupPrice || v.prixTotal || 0), 0)
                });
            }
        } catch (err) {
            console.error("Erreur chargement dashboard:", err);
        } finally {
            setLoading(false);
        }
    };

    const shortcuts = [
        { 
            title: 'Nouvelle Vente', 
            icon: 'solar:cart-plus-bold-duotone', 
            path: '/caissier/pos', 
            variant: 'primary',
            description: 'Effectuer un nouveau paiement'
        },
        { 
            title: 'Gestion de la Caisse', 
            icon: 'solar:wallet-money-bold-duotone', 
            path: '/caissier/caisse', 
            variant: 'success',
            description: 'Consulter le statut de la caisse'
        },
        { 
            title: 'Créances Clients', 
            icon: 'solar:user-id-bold-duotone', 
            path: '/caissier/creances', 
            variant: 'info',
            description: 'Gérer les dettes clients'
        },
        { 
            title: 'Mon Profil', 
            icon: 'solar:user-circle-bold-duotone', 
            path: '/profile', 
            variant: 'secondary',
            description: 'Modifier mes informations'
        },
    ];

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100">
                <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Chargement...</span>
                </Spinner>
            </div>
        );
    }

    return (
        <div className="p-4 animate__animated animate__fadeIn">
            {/* En-tête de bienvenue */}
            <Row className="mb-4">
                <Col>
                    <h3 className="fw-bold mb-1">Bonjour, {userName} ! 👋</h3>
                    <p className="text-muted mb-0">
                        {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </Col>
            </Row>

            {/* Statistiques du jour */}
            <Row className="g-3 mb-4">
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-primary-subtle">
                        <Card.Body className="p-3">
                            <div className="d-flex justify-content-between align-items-center">
                                <div>
                                    <small className="text-muted">Ventes aujourd'hui</small>
                                    <h4 className="fw-bold mb-0 text-primary">{stats.ventesAujourdhui}</h4>
                                </div>
                                <iconify-icon icon="solar:cart-bold-duotone" style={{ fontSize: '40px', color: '#0d6efd' }}></iconify-icon>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-success-subtle">
                        <Card.Body className="p-3">
                            <div className="d-flex justify-content-between align-items-center">
                                <div>
                                    <small className="text-muted">Montant total</small>
                                    <h4 className="fw-bold mb-0 text-success">{stats.montantTotal.toLocaleString()} GNF</h4>
                                </div>
                                <iconify-icon icon="solar:banknote-bold-duotone" style={{ fontSize: '40px', color: '#198754' }}></iconify-icon>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-warning-subtle">
                        <Card.Body className="p-3">
                            <div className="d-flex justify-content-between align-items-center">
                                <div>
                                    <small className="text-muted">Statut caisse</small>
                                    <h4 className="fw-bold mb-0">
                                        {caisseStatut ? (
                                            <Badge bg="success" pill>Ouverte</Badge>
                                        ) : (
                                            <Badge bg="danger" pill>Fermée</Badge>
                                        )}
                                    </h4>
                                </div>
                                <iconify-icon icon={caisseStatut ? "solar:lock-unlocked-bold-duotone" : "solar:lock-keyhole-bold-duotone"} style={{ fontSize: '40px', color: '#ffc107' }}></iconify-icon>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Actions rapides */}
            <Row className="mb-4">
                <Col>
                    <h5 className="fw-bold mb-3">Actions Rapides</h5>
                </Col>
            </Row>

            <Row className="g-3">
                {shortcuts.map((shortcut, index) => (
                    <Col md={6} lg={3} key={index}>
                        <Card 
                            className="border-0 shadow-sm h-100 cursor-pointer"
                            onClick={() => navigate(shortcut.path)}
                            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <Card.Body className="p-4 text-center">
                                <div className={`text-${shortcut.variant} mb-3`} style={{ fontSize: '56px' }}>
                                    <iconify-icon icon={shortcut.icon}></iconify-icon>
                                </div>
                                <h5 className="fw-bold mb-2">{shortcut.title}</h5>
                                <p className="text-muted small mb-3">{shortcut.description}</p>
                                <Button 
                                    variant={shortcut.variant}
                                    className="rounded-pill px-4"
                                >
                                    Accéder
                                </Button>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Dernières ventes */}
            {stats.ventesAujourdhui > 0 && (
                <Row className="mt-4">
                    <Col>
                        <Card className="border-0 shadow-sm">
                            <Card.Header className="bg-white py-3">
                                <h5 className="fw-bold mb-0">Résumé du jour</h5>
                            </Card.Header>
                            <Card.Body>
                                <Alert variant="success" className="mb-0">
                                    <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                                    <strong>Excellent travail !</strong> Vous avez effectué {stats.ventesAujourdhui} vente(s) aujourd'hui pour un total de {stats.montantTotal.toLocaleString()} GNF.
                                </Alert>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}
        </div>
    );
};

export default CaissierDashboard;
