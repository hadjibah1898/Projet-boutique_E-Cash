// src/components/OnboardingSuccess.js
// Page de confirmation post-inscription avec guide des prochaines étapes
import React from 'react';
import { Container, Row, Col, Card, Button, Badge } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import './Auth.css';

const OnboardingSuccess = () => {
    const location = useLocation();
    const { accountType, entrepriseNom, nom } = location.state || {};

    const isMarchand = accountType === 'Marchand';
    const isBar = accountType === 'Bar';

    return (
        <div className="auth-page odoo-theme">
            <Container fluid className="p-0">
                <Row className="g-0 vh-100">
                    {/* Panneau gauche : Gradient Odoo */}
                    <Col lg={5} className="d-none d-lg-flex odoo-gradient align-items-center justify-content-center text-white p-5 position-relative overflow-hidden">
                        <div className="z-1 position-relative text-center" style={{ maxWidth: '450px' }}>
                            <div className="mb-4">
                                <iconify-icon icon="solar:check-read-bold-duotone" style={{ fontSize: '80px' }} className="text-success"></iconify-icon>
                            </div>
                            <h2 className="fw-bold mb-4">Inscription réussie ! 🎉</h2>
                            <p className="opacity-75 mb-4">
                                {isMarchand
                                    ? "Votre compte marchand a été créé. Vous pourrez bientôt gérer vos stocks, vos boutiques et vos équipes."
                                    : "Votre compte Bar/Boîte de nuit a été créé. Vous pourrez bientôt suivre vos ventes, vos stocks et vos caisses."}
                            </p>
                            <div className="d-flex justify-content-center gap-2 flex-wrap">
                                <Badge bg="success" className="px-3 py-2 fs-6">📧 Validation par email</Badge>
                                <Badge bg="primary" className="px-3 py-2 fs-6">✅ Compte créé</Badge>
                            </div>
                        </div>
                    </Col>

                    {/* Panneau droit : Prochaines étapes */}
                    <Col lg={7} className="d-flex align-items-center justify-content-center bg-white p-4 p-md-5 overflow-auto">
                        <div style={{ maxWidth: '600px', width: '100%' }} className="animate__animated animate__fadeInUp">
                            <div className="text-center mb-5">
                                <iconify-icon icon="solar:cup-star-bold-duotone" style={{ fontSize: '64px', color: '#198754' }}></iconify-icon>
                                <h2 className="fw-bold mt-3 text-dark">
                                    Bienvenue{nom ? ` ${nom}` : ''} !
                                </h2>
                                {entrepriseNom && (
                                    <p className="text-muted mb-0">
                                        <iconify-icon icon="solar:shop-2-bold" className="me-1 align-middle"></iconify-icon>
                                        {entrepriseNom}
                                    </p>
                                )}
                                <Badge bg={isMarchand ? 'primary' : 'warning'} text={isMarchand ? 'white' : 'dark'} className="mt-2">
                                    {isMarchand ? 'Compte Marchand' : 'Compte Bar / Boîte de Nuit'}
                                </Badge>
                            </div>

                            <Card className="border-0 shadow-sm text-center mb-4">
                                <Card.Body className="p-4">
                                    <h5 className="fw-bold text-primary mb-4">
                                        <iconify-icon icon="solar:clipboard-list-bold-duotone" className="me-2"></iconify-icon>
                                        Prochaines Étapes
                                    </h5>

                                    <div className="d-flex flex-column gap-4">
                                        {/* Étape 1 */}
                                        <div className="d-flex text-start align-items-start gap-3">
                                            <div className="bg-primary-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                                                <span className="fw-bold text-primary">1</span>
                                            </div>
                                            <div>
                                                <h6 className="fw-bold mb-1">Validation par l'Administrateur</h6>
                                                <p className="text-muted small mb-0">
                                                    Votre compte est en attente de validation par le Super Administrateur. 
                                                    Vous recevrez une notification par email une fois validé.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Étape 2 */}
                                        <div className="d-flex text-start align-items-start gap-3">
                                            <div className="bg-info-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                                                <span className="fw-bold text-info">2</span>
                                            </div>
                                            <div>
                                                <h6 className="fw-bold mb-1">Première Connexion</h6>
                                                <p className="text-muted small mb-0">
                                                    Connectez-vous avec vos identifiants. Un guide interactif vous accompagnera 
                                                    pour découvrir toutes les fonctionnalités de votre espace.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Étape 3 (spécifique au type de compte) */}
                                        <div className="d-flex text-start align-items-start gap-3">
                                            <div className="bg-success-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                                                <span className="fw-bold text-success">3</span>
                                            </div>
                                            <div>
                                                <h6 className="fw-bold mb-1">
                                                    {isMarchand ? 'Configurez votre réseau' : 'Paramétrez votre établissement'}
                                                </h6>
                                                <p className="text-muted small mb-0">
                                                    {isMarchand
                                                        ? "Créez vos boutiques, ajoutez vos gérants et commencez à gérer vos stocks depuis la centrale."
                                                        : "Configurez vos articles (bouteilles, verres, doses), votre POS et paramétrez vos équipes."}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Étape 4 */}
                                        <div className="d-flex text-start align-items-start gap-3">
                                            <div className="bg-warning-subtle rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                                                <span className="fw-bold text-warning">4</span>
                                            </div>
                                            <div>
                                                <h6 className="fw-bold mb-1">Lancez votre activité</h6>
                                                <p className="text-muted small mb-0">
                                                    Ajoutez vos premiers articles, ouvrez votre caisse et commencez à enregistrer des ventes !
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>

                            {/* Résumé des fonctionnalités selon le type */}
                            <Card className="border-0 shadow-sm bg-light mb-4">
                                <Card.Body className="p-4">
                                    <h6 className="fw-bold mb-3">
                                        <iconify-icon icon="solar:star-bold-duotone" className="me-2 text-warning"></iconify-icon>
                                        Fonctionnalités incluses
                                    </h6>
                                    <Row className="g-2">
                                        {isMarchand ? (
                                            <>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Gestion multi-boutiques
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Transferts de stock
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Gestion des gérants
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Rapports consolidés
                                                    </div>
                                                </Col>
                                            </>
                                        ) : (
                                            <>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Interface POS tactile
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Gestion des doses/verres
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Clôtures de caisse
                                                    </div>
                                                </Col>
                                                <Col xs={6}>
                                                    <div className="d-flex align-items-center small">
                                                        <iconify-icon icon="solar:check-read-bold" className="text-success me-2 flex-shrink-0"></iconify-icon>
                                                        Suivi des pourboires
                                                    </div>
                                                </Col>
                                            </>
                                        )}
                                    </Row>
                                </Card.Body>
                            </Card>

                            <div className="d-grid mb-3">
                                <Button
                                    as={Link}
                                    to="/login"
                                    variant="primary"
                                    size="lg"
                                    className="fw-bold py-3"
                                >
                                    <iconify-icon icon="solar:login-3-bold" className="me-2"></iconify-icon>
                                    Se connecter maintenant
                                </Button>
                            </div>
                            <div className="text-center">
                                <small className="text-muted">
                                    <iconify-icon icon="solar:info-circle-linear" className="me-1 align-middle"></iconify-icon>
                                    En attendant la validation, vous ne pourrez pas encore accéder au dashboard.
                                </small>
                            </div>
                        </div>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default OnboardingSuccess;