/**
 * @file ReceptionsTab.js
 * @description Composant React.
 */

import React from 'react';
import { Row, Col, Alert, Badge, Button, Form, Card } from 'react-bootstrap';

const ReceptionsTab = ({
    userRole,
    showReceptionHistory,
    setShowReceptionHistory,
    filterReceptionBoutique,
    setFilterReceptionBoutique,
    boutiques,
    pendingMovements,
    receivedMovements,
    getTimeElapsed,
    handleGenerateReceptionPDF,
    handleOpenReceptionModal,
    handleRemindManager,
    handleCancelTransfer
}) => {
    const movements = showReceptionHistory ? receivedMovements : pendingMovements;

    return (
        <div className="animate__animated animate__fadeIn">
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <h5 className="fw-bold mb-0">
                    {showReceptionHistory ? 'Historique des colis acceptés' : (userRole === 'Admin' ? 'Transferts en transit (Attente Gérant)' : 'Colis en attente de réception')}
                </h5>
                
                <div className="d-flex gap-2 align-items-center flex-wrap">
                    {userRole === 'Admin' && (
                        <Form.Select 
                            size="sm" 
                            className="rounded-pill shadow-sm"
                            value={filterReceptionBoutique}
                            onChange={(e) => setFilterReceptionBoutique(e.target.value)}
                            style={{ width: '200px' }}
                        >
                            <option value="">Toutes les destinations</option>
                            {boutiques.filter(b => b.type !== 'Centrale').map(b => (
                                <option key={b._id} value={b._id}>{b.nom}</option>
                            ))}
                        </Form.Select>
                    )}
                    <Button 
                        variant={showReceptionHistory ? "outline-primary" : "outline-secondary"} 
                        size="sm" 
                        className="rounded-pill shadow-sm d-flex align-items-center gap-2 px-3"
                        onClick={() => setShowReceptionHistory(!showReceptionHistory)}
                    >
                        <iconify-icon icon={showReceptionHistory ? "solar:box-minimalistic-bold" : "solar:history-bold"} className="fs-5"></iconify-icon>
                        {showReceptionHistory ? 'Voir les colis à recevoir' : 'Voir les acceptés'}
                    </Button>
                </div>
            </div>

            {movements.length === 0 ? (
                <Alert variant="info" className="border-0 shadow-sm rounded-4">
                    <iconify-icon icon="solar:info-circle-bold" className="me-2 align-middle"></iconify-icon>
                    {showReceptionHistory ? 'Aucune réception passée trouvée.' : 'Aucun colis en attente de réception.'}
                </Alert>
            ) : (
                <Row className="g-3">
                    {movements.map(mvt => (
                        <Col md={6} key={mvt._id}>
                            <Card className={`border-0 shadow-sm rounded-4 h-100 ${showReceptionHistory ? 'border-start border-4 border-success' : 'border-start border-4 border-warning'}`}>
                                <Card.Body className="d-flex flex-column justify-content-between p-3">
                                    <div>
                                        <div className="fw-bold mb-1 d-flex justify-content-between align-items-center">
                                            <div className="d-flex align-items-center gap-2">
                                                <iconify-icon icon={showReceptionHistory ? "solar:check-circle-bold" : "solar:delivery-bold-duotone"} className={`fs-4 ${showReceptionHistory ? 'text-success' : 'text-warning'}`}></iconify-icon>
                                                <span className="text-uppercase small text-muted letter-spacing-1">#{mvt._id.slice(-6)}</span>
                                            </div>
                                            <Badge bg={showReceptionHistory ? "success" : "dark"} className="opacity-75 small">{showReceptionHistory ? 'REÇU' : 'EN TRANSIT'}</Badge>
                                        </div>
                                        <div className="my-3 p-2 bg-light rounded-3 d-flex align-items-center justify-content-center gap-3 border border-light">
                                            <div className="text-center">
                                                <div className="small text-muted text-uppercase fw-bold" style={{ fontSize: '0.65rem' }}>Source</div>
                                                <div className="fw-bold text-dark">{mvt.boutiqueSource?.type === 'Centrale' ? 'Dépôt Principal' : (mvt.boutiqueSource?.nom || 'Dépôt')}</div>
                                            </div>
                                            <iconify-icon icon="solar:arrow-right-bold" className="text-primary fs-5"></iconify-icon>
                                            <div className="text-center">
                                                <div className="small text-muted text-uppercase fw-bold" style={{ fontSize: '0.65rem' }}>Destination</div>
                                                <div className="fw-bold text-primary">{mvt.boutiqueDestination?.nom || 'Boutique'}</div>
                                            </div>
                                        </div>
                                        <div className="small text-muted mb-2">
                                            <div className="d-flex justify-content-between">
                                                <span>{mvt.articles.length} articles</span>
                                                <span className="fw-bold">{mvt.articles.reduce((acc, a) => acc + (a.quantite * (a.prixAchatUnitaire || 0)), 0).toLocaleString()} GNF</span>
                                            </div>
                                            {!showReceptionHistory && <div className="mt-1 small fw-bold text-muted">Envoyé {getTimeElapsed(mvt.createdAt)}</div>}
                                        </div>
                                    </div>
                                    {showReceptionHistory ? (
                                        <Button variant="outline-success" size="sm" className="rounded-pill w-100 mt-2 fw-bold" onClick={() => handleGenerateReceptionPDF(mvt, mvt.articles.map(a => ({...a, quantiteRecue: a.quantite, quantiteAttendue: a.quantite})), mvt.details)}>
                                            Réimprimer le reçu
                                        </Button>
                                    ) : userRole === 'Gérant' ? (
                                        <Button variant="danger" size="sm" className="rounded-pill w-100 mt-2 fw-bold" onClick={() => handleOpenReceptionModal(mvt)}>Vérifier & Réceptionner</Button>
                                    ) : (
                                        <div className="d-flex gap-2 mt-2">
                                            <Button variant="outline-danger" size="sm" className="rounded-pill flex-grow-1 fw-bold" onClick={() => handleCancelTransfer(mvt._id)}>Annuler</Button>
                                            <Button variant="outline-warning" size="sm" className="rounded-pill flex-grow-1 fw-bold text-dark" onClick={() => handleRemindManager(mvt._id)}>Relancer</Button>
                                        </div>
                                    )}
                                </Card.Body>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
};

export default ReceptionsTab;