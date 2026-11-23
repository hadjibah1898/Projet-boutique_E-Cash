import React from 'react';
import { Row, Col, Card } from 'react-bootstrap';

// ✅ On définit les fonctions utilitaires directement ici pour éviter les bugs
const safeNum = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v.$numberDecimal) return parseFloat(v.$numberDecimal) || 0;
    const parsed = parseFloat(v);
    return isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (amount) => {
    return (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

const KPIsRow = ({ stats }) => {
    // Sécurité si stats n'est pas encore chargé
    const totalEncaissements = stats?.totalEncaissements || 0;
    const totalFintech = stats?.totalFintech || 0;
    const totalTheorique = stats?.totalTheorique || 0;
    const totalEcarts = safeNum(stats?.totalEcarts);

    return (
        <Row className="mb-4 g-3">
            <Col lg={3} sm={6}>
                <Card className="border-0 shadow-sm bg-primary-subtle text-primary h-100">
                    <Card.Body className="d-flex align-items-center justify-content-between">
                        <div>
                            <h6 className="mb-1">Total des Encaissements</h6>
                            <h4 className="fw-bold mb-0">{formatCurrency(totalEncaissements)}</h4>
                        </div>
                        <iconify-icon icon="solar:wallet-money-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                    </Card.Body>
                </Card>
            </Col>
            <Col lg={3} sm={6}>
                <Card className="border-0 shadow-sm h-100" style={{ backgroundColor: '#FFF5EB' }}>
                    <Card.Body className="d-flex flex-column justify-content-between">
                        <div className="d-flex align-items-center justify-content-between">
                            <div style={{ color: '#FF6600' }}>
                                <h6 className="mb-1 text-muted">Flux Fintech (OM/Mobi)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(totalFintech)}</h4>
                            </div>
                            <iconify-icon icon="solar:phone-calling-bold-duotone" style={{ fontSize: '40px', opacity: 0.5, color: '#FF6600' }}></iconify-icon>
                        </div>
                    </Card.Body>
                </Card>
            </Col>
            <Col lg={3} sm={6}>
                <Card className="border-0 shadow-sm bg-success-subtle text-success h-100">
                    <Card.Body className="d-flex align-items-center justify-content-between">
                        <div>
                            <h6 className="mb-1">Total Espèces Attendu</h6>
                            <h4 className="fw-bold mb-0">{formatCurrency(totalTheorique)}</h4>
                        </div>
                        <iconify-icon icon="solar:chart-square-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                    </Card.Body>
                </Card>
            </Col>
            <Col lg={3} sm={6}>
                <Card className={`border-0 shadow-sm h-100 ${totalEcarts < 0 ? 'bg-danger-subtle text-danger' : totalEcarts > 0 ? 'bg-warning-subtle text-warning' : 'bg-light text-muted'}`}>
                    <Card.Body className="d-flex align-items-center justify-content-between">
                        <div>
                            <h6 className="mb-1">Somme des Écarts (Période)</h6>
                            {/* ✅ Affichage sécurisé du montant */}
                            <h4 className="fw-bold mb-0">
                                {totalEcarts > 0 ? '+' : ''}{formatCurrency(totalEcarts)}
                            </h4>
                        </div>
                        <iconify-icon icon="solar:danger-triangle-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    );
};

export default KPIsRow;