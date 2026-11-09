/**
 * @file BarCommandesView.js
 * @description Vue Gérant Bar : suivi des commandes par table, statuts (Attente, Prêt, Payé)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Row, Col, Card, Badge, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { venteAPI } from '../services/api';
import { toast } from 'react-toastify';
import { formatCurrency } from '../utils/formatUtils';

const BarCommandesView = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [commandes, setCommandes] = useState([]);
    const [error, setError] = useState('');

    // Modal confirmation paiement
    const [showPayConfirm, setShowPayConfirm] = useState(false);
    const [selectedCommande, setSelectedCommande] = useState(null);
    const [paymentMode, setPaymentMode] = useState('');
    const [transactionRef, setTransactionRef] = useState('');
    const [confirming, setConfirming] = useState(false);

    const fetchData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            else setRefreshing(true);

            const boutiqueId = localStorage.getItem('boutiqueId');
            const res = await venteAPI.getHistorique({ 
                limit: 50, 
                boutique: boutiqueId,
                startDate: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
                endDate: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
                groupBy: 'table'
            });

            const allSales = res.data?.ventes || res.data?.data || res.data || [];
            setCommandes(allSales.filter(c => !c.isCancelled && c.statut !== 'finalisee'));
        } catch (err) {
            console.error("Erreur chargement commandes:", err);
            setError("Impossible de charger les commandes.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    // Grouper par table
    const groupedByTable = useMemo(() => {
        const groups = {};
        commandes.forEach(c => {
            const table = c.numeroTable || 'Emporter';
            if (!groups[table]) groups[table] = [];
            groups[table].push(c);
        });
        return groups;
    }, [commandes]);

    // En attente / Prêt
    const attente = commandes.filter(c => c.statut === 'commande');
    const pretes = commandes.filter(c => c.statut === 'en_preparation');

    const handleConfirmPayment = async () => {
        if (!selectedCommande || !paymentMode) return;

        const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
        if (digitalModes.includes(paymentMode) && !transactionRef.trim()) {
            toast.warning(`Référence de transaction requise pour ${paymentMode}.`);
            return;
        }

        setConfirming(true);
        try {
            await venteAPI.updateGroupStatus(selectedCommande.orderGroupId, {
                status: 'finalisee',
                modePaiement: paymentMode,
                transactionRef: digitalModes.includes(paymentMode) ? transactionRef : undefined
            });
            toast.success(`Paiement confirmé pour la Table ${selectedCommande.numeroTable || 'Emporter'} !`);
            setShowPayConfirm(false);
            setPaymentMode('');
            setTransactionRef('');
            setSelectedCommande(null);
            fetchData(true);
        } catch (err) {
            toast.error("Erreur lors de la confirmation du paiement.");
        } finally {
            setConfirming(false);
        }
    };

    const getRelativeTime = (date) => {
        const diff = new Date() - new Date(date);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "À l'instant";
        if (mins < 60) return `Il y a ${mins} min`;
        return `${Math.floor(mins / 60)}h${mins % 60}`;
    };

    if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="primary" /><p className="text-muted mt-2">Chargement des commandes...</p></div>;

    return (
        <div className="p-4 bar-account-theme animate__animated animate__fadeIn">
            {/* En-tête */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="fw-bold mb-0 text-primary">
                        <iconify-icon icon="solar:clipboard-list-bold-duotone" className="me-2"></iconify-icon>
                        Commandes en Cours
                    </h2>
                    <p className="text-muted small mb-0">Suivez les commandes table par table.</p>
                </div>
                <div className="d-flex gap-2">
                    <Badge bg="warning" className="fs-6 px-3 py-2 rounded-pill">
                        {attente.length} En Attente
                    </Badge>
                    <Badge bg="success" className="fs-6 px-3 py-2 rounded-pill">
                        {pretes.length} Prêtes
                    </Badge>
                    <Button variant="outline-secondary" size="sm" className="rounded-pill" onClick={() => fetchData(true)} disabled={refreshing}>
                        {refreshing ? <Spinner size="sm" /> : <iconify-icon icon="solar:refresh-bold"></iconify-icon>}
                    </Button>
                </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            {/* Tableaux de commandes par table */}
            {Object.keys(groupedByTable).length === 0 ? (
                <Card className="border-0 shadow-sm rounded-4 text-center py-5">
                    <Card.Body>
                        <iconify-icon icon="solar:cup-hot-bold-duotone" style={{ fontSize: '80px', opacity: '0.2' }}></iconify-icon>
                        <h4 className="text-muted mt-3">Aucune commande en cours</h4>
                        <p className="text-muted">Les nouvelles commandes des serveurs apparaîtront ici.</p>
                    </Card.Body>
                </Card>
            ) : (
                <Row className="g-4">
                    {Object.entries(groupedByTable).map(([tableNum, orders]) => {
                        const tableTotal = orders.reduce((sum, o) => sum + (o.totalGroupPrice || 0), 0);
                        const tableStatus = orders.some(o => o.statut === 'commande') ? 'commande' : 'en_preparation';
                        const tableItems = orders.flatMap(o => o.items || []);
                        const serveurName = orders[0]?.gerant?.nom || orders[0]?.serveur?.nom || 'N/A';

                        return (
                            <Col xl={3} lg={4} md={6} key={tableNum}>
                                <Card className={`border-0 shadow-sm rounded-4 h-100 overflow-hidden ${tableStatus === 'commande' ? 'border-warning border-top border-4' : 'border-success border-top border-4'}`}>
                                    <Card.Header className="bg-white py-3 border-0">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <Badge bg={tableStatus === 'commande' ? 'warning' : 'success'} className="fs-6 px-3 py-2 rounded-pill">
                                                <iconify-icon icon="solar:chair-bold" className="me-2 align-middle"></iconify-icon>
                                                TABLE {tableNum}
                                            </Badge>
                                            <div className="text-end">
                                                <small className="text-muted d-block">{getRelativeTime(orders[0]?.createdAt)}</small>
                                                <small className="fw-bold text-primary">{serveurName}</small>
                                            </div>
                                        </div>
                                    </Card.Header>
                                    <Card.Body className="p-2 bg-light bg-opacity-25" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                        {tableItems.map((item, idx) => (
                                            <div key={idx} className={`d-flex align-items-center p-2 mb-2 bg-white rounded-3 shadow-sm ${item.isCancelled ? 'opacity-50' : ''}`}>
                                                {item.article?.image ? (
                                                    <img src={item.article.image} alt="" className="rounded me-2" style={{ width: '35px', height: '35px', objectFit: 'cover' }} />
                                                ) : (
                                                    <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: '40px', height: '40px' }}>
                                                        <iconify-icon icon="solar:wine-glass-bold" className="text-primary"></iconify-icon>
                                                    </div>
                                                )}
                                                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                    <div className="fw-bold small">{item.article?.nom || 'Article'}</div>
                                                    <div className="d-flex align-items-center mt-1">
                                                        <Badge bg="dark" pill className="me-2">x{item.quantite}</Badge>
                                                        <span className="text-success small fw-bold">{item.prixTotal?.toLocaleString()} GNF</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </Card.Body>
                                    <Card.Footer className="bg-white border-0 pt-0 pb-3 px-3">
                                        <div className="d-flex justify-content-between align-items-center mb-3 pt-3 border-top">
                                            <span className="text-muted small fw-bold">TOTAL</span>
                                            <span className="fw-bold fs-5 text-dark">{formatCurrency(tableTotal)}</span>
                                        </div>
                                        {tableStatus === 'commande' ? (
                                            <Button
                                                variant="outline-success"
                                                className="w-100 rounded-pill fw-bold"
                                                onClick={async () => {
                                                    try {
                                                        await venteAPI.updateGroupStatus(orders[0].orderGroupId, { status: 'en_preparation' });
                                                        toast.success(`Table ${tableNum} marquée comme Prête !`);
                                                        fetchData(true);
                                                    } catch (err) {
                                                        toast.error("Erreur lors du marquage.");
                                                    }
                                                }}
                                            >
                                                <iconify-icon icon="solar:cup-hot-bold" className="me-2"></iconify-icon>
                                                Marquer comme Prête
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="primary"
                                                className="w-100 rounded-pill fw-bold shadow-sm"
                                                onClick={() => {
                                                    setSelectedCommande(orders[0]);
                                                    setShowPayConfirm(true);
                                                }}
                                            >
                                                <iconify-icon icon="solar:wallet-money-bold" className="me-2"></iconify-icon>
                                                Confirmer Paiement
                                            </Button>
                                        )}
                                    </Card.Footer>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
            )}

            {/* Modal confirmation de paiement */}
            <Modal show={showPayConfirm} onHide={() => setShowPayConfirm(false)} centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold">Confirmer le Paiement</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                    <div className="mb-3">
                        <Badge bg="dark" className="fs-5 px-4 py-2 rounded-pill mb-2">
                            TABLE {selectedCommande?.numeroTable || 'N/A'}
                        </Badge>
                        <h2 className="fw-bold text-success mt-3">
                            {formatCurrency(selectedCommande?.totalGroupPrice || 0)}
                        </h2>
                    </div>

                    <div className="mt-4 pt-3 border-top text-start">
                        <Form.Label className="small fw-bold text-muted">MODE DE PAIEMENT</Form.Label>
                        <div className="d-flex flex-wrap gap-2 mb-3">
                            {['Cash', 'Orange Money', 'MobiCash', 'PayCard', 'Virement'].map(mode => (
                                <Button
                                    key={mode}
                                    variant={paymentMode === mode ? (mode === 'Cash' ? 'success' : 'primary') : 'outline-secondary'}
                                    size="sm"
                                    className="rounded-pill px-3 fw-bold"
                                    onClick={() => setPaymentMode(mode)}
                                >
                                    {mode}
                                </Button>
                            ))}
                        </div>

                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(paymentMode) && (
                            <Form.Group className="mb-3 animate__animated animate__fadeIn">
                                <Form.Label className="small fw-bold text-muted">RÉFÉRENCE DE TRANSACTION</Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder={`ID transaction ${paymentMode}`}
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    className="rounded-pill"
                                    required
                                />
                            </Form.Group>
                        )}

                        <Alert variant="info" className="small mb-0">
                            <iconify-icon icon="solar:info-circle-bold" className="me-1 align-middle"></iconify-icon>
                            Un rapport sera automatiquement envoyé à l'Admin après validation.
                        </Alert>
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 justify-content-center pb-4">
                    <Button variant="light" onClick={() => setShowPayConfirm(false)} className="rounded-pill px-4">Annuler</Button>
                    <Button
                        variant="success"
                        onClick={handleConfirmPayment}
                        className="rounded-pill px-4 fw-bold"
                        disabled={!paymentMode || confirming}
                    >
                        {confirming ? <Spinner size="sm" /> : 'Valider le Paiement'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default BarCommandesView;