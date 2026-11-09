/**
 * @file ServeurDashboard.js
 * @description Tableau de bord Serveur : commandes en cours, tables, pourboires.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Row, Col, Card, Badge, Table, Spinner, Alert, Button, Modal, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { generateReceiptPDF } from '../utils/pdfUtils'; // Import de la fonction de génération de PDF
import { venteAPI, boutiqueAPI, serveurAPI } from '../services/api';
import ReceiptModal from './ReceiptModal';
import NotificationPopover from './NotificationPopover'; // Import NotificationPopover

const ServeurDashboard = () => {
    const [historique, setHistorique] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [boutiqueConfig, setBoutiqueConfig] = useState(null);
    const [error, setError] = useState('');
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [currentReceiptData, setCurrentReceiptData] = useState(null);
    const [paymentMode, setPaymentMode] = useState('');
    const [transactionRef, setTransactionRef] = useState('');
    const [showQrCodeFullscreenModal, setShowQrCodeFullscreenModal] = useState(false);
    const [fullscreenQrCode, setFullscreenQrCode] = useState('');
    const [ecoMode, setEcoMode] = useState(() => localStorage.getItem('ecoMode') === 'true');
    const [serverStats, setServerStats] = useState({
        totalVentes: 0,
        totalPourboires: 0,
        nombreTickets: 0,
        commandesEnAttente: 0,
        commandesPretes: 0
    });

    const prevReadyCount = React.useRef(0);

    // Effet de vibration pour les nouvelles commandes prêtes
    useEffect(() => {
        const readyCount = historique.filter(v => v.statut === 'en_preparation').length;
        // Ne vibrer que si le nombre de commandes prêtes a augmenté
        if (readyCount > prevReadyCount.current && window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
        }
        prevReadyCount.current = readyCount;
    }, [historique]);

    const fetchData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            else setRefreshing(true);

            const userId = localStorage.getItem('userId');
            const boutiqueId = localStorage.getItem('boutiqueId');

            if (!userId) {
                throw new Error("ID utilisateur non trouvé. Veuillez vous reconnecter.");
            }
            if (!boutiqueId) {
                throw new Error("ID de boutique non trouvé pour ce serveur. Veuillez contacter l'administrateur.");
            }

            // Calculer les dates pour filtrer les ventes d'aujourd'hui côté backend
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const startDate = todayStart.toISOString();
            const endDate = todayEnd.toISOString();

            const [ventesRes, boutiqueRes, statsRes] = await Promise.allSettled([
                venteAPI.getHistorique({ limit: 20, gerantId: userId, startDate, endDate, groupBy: 'table' }),
                boutiqueAPI.getDetailsForServeur(boutiqueId),
                serveurAPI.getStatsMe() // Appel au nouveau contrôleur backend
            ]);

            if (ventesRes.status === 'fulfilled') {
                const allSales = (ventesRes.value.data && ventesRes.value.data.ventes) ? ventesRes.value.data.ventes : (ventesRes.value.ventes || ventesRes.value.data || []);
                setHistorique(allSales);
            } else { console.error("Failed to fetch sales history:", ventesRes.reason); }

            if (statsRes.status === 'fulfilled') {
                setServerStats(statsRes.value.data);
            }

            if (boutiqueRes.status === 'fulfilled' && boutiqueRes.value.data) { // getDetailsForServeur retourne directement l'objet
                setBoutiqueConfig(boutiqueRes.value.data);
            } else { console.error("Failed to fetch boutique config:", boutiqueRes.reason); }

        } catch (err) {
            console.error("Error fetching data in ServeurDashboard:", err);
            setError(err.message || err.response?.data?.message || "Erreur lors du chargement des statistiques.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFinalizePayment = async () => {
        if (!selectedOrder) return;

        if (!paymentMode) return;

        const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];

        // UX Validation : Empêcher l'envoi si la référence est vide pour un paiement digital
        if (digitalModes.includes(paymentMode) && !transactionRef.trim()) {
            setError(`Veuillez saisir la référence de transaction pour le paiement ${paymentMode}.`);
            return;
        }

        try {
            const payload = {
                status: 'finalisee',
                modePaiement: paymentMode,
                transactionRef: digitalModes.includes(paymentMode) ? transactionRef : undefined
            };

            // Utilisation directe de l'orderGroupId fourni par le backend
            await venteAPI.updateGroupStatus(selectedOrder.orderGroupId, payload);

            setShowPayModal(false);
            await fetchData();

            // Préparation robuste des données du ticket
            const subTotal = selectedOrder.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : ((item.article?.prixVente || (item.prixTotal / (item.quantite || 1))) * item.quantite)), 0);
            const totalNet = selectedOrder.totalGroupPrice; // Use the pre-calculated group total
            const totalPourboire = selectedOrder.totalGroupPourboire; // Use the pre-calculated group pourboire
            const receiptData = {
                shopName: boutiqueConfig?.nom || selectedOrder.boutique?.nom || "Ma Boutique",
                address: boutiqueConfig?.adresse || selectedOrder.boutique?.adresse || "",
                phone: boutiqueConfig?.telephone || selectedOrder.boutique?.telephone || "",
                transactionId: `SRV-${selectedOrder.orderGroupId.toString().slice(-6).toUpperCase()}`,
                cashierName: localStorage.getItem('userName') || "Serveur", // Le serveur est le "caissier" ici
                serverName: localStorage.getItem('userName') || "Serveur", // Le serveur est aussi le serveur
                clientName: selectedOrder.client?.nom || 'Client de passage',
                date: selectedOrder.createdAt || new Date(),
                items: selectedOrder.items.map(item => ({
                    article: item.article,
                    quantite: item.quantite,
                    prixUnitaire: item.prixTotal / (item.quantite || 1),
                    prixTotal: item.prixTotal
                })),
                modePaiement: paymentMode,
                subTotal: subTotal,
                itemLevelDiscount: subTotal - totalNet,
                pourboire: totalPourboire,
                totalNet: totalNet, // SEPARATION : On garde le total des articles seul
                amountPaid: totalNet + totalPourboire, // L'encaissé réel inclut le pourboire
                change: 0
            };
            setCurrentReceiptData(receiptData);
            setShowReceiptModal(true); // Afficher la modale d'impression
            setPaymentMode(''); // Réinitialiser pour forcer le choix à la prochaine table
            setTransactionRef('');

            setSelectedOrder(null);
        } catch (err) {
            setError("Erreur lors de l'encaissement.");
        }
    };

    // Récupérer le QR Code et le numéro de compte/téléphone correspondant au mode de paiement sélectionné
    const activePaymentDetails = useMemo(() => {
        // On utilise boutiqueConfig (données complètes) plutôt que selectedOrder.boutique (données partielles)
        if (!boutiqueConfig) return null;
        const b = boutiqueConfig;
        if (paymentMode === 'Orange Money') return { qr: b.orangeMoneyQrCode, account: b.orangeMoneyAccount };
        if (paymentMode === 'MobiCash') return { qr: b.mobicashQrCode, account: b.mobicashAccount };
        if (paymentMode === 'PayCard') return { qr: b.paycardQrCode, account: b.paycardAccount };
        return null;
    }, [paymentMode, boutiqueConfig]);

    const activeQrCode = activePaymentDetails?.qr;
    const activeAccount = activePaymentDetails?.account;

    const handlePrintReceipt = (includeTip) => {
        if (currentReceiptData) {
            const data = { ...currentReceiptData };
            if (!includeTip) data.pourboire = 0;
            generateReceiptPDF(data);
        }
        setShowReceiptModal(false);
    };

    const handleReprintFromTable = (group) => {
        const subTotal = group.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : ((item.article?.prixVente || (item.prixTotal / (item.quantite || 1))) * item.quantite)), 0);
        const receiptData = {
            shopName: boutiqueConfig?.nom || group.boutique?.nom || "Ma Boutique",
            address: boutiqueConfig?.adresse || group.boutique?.adresse || "",
            phone: boutiqueConfig?.telephone || group.boutique?.telephone || "",
            transactionId: `SRV-${group.orderGroupId.toString().slice(-6).toUpperCase()}`,
            cashierName: localStorage.getItem('userName') || "Serveur",
            serverName: localStorage.getItem('userName') || "Serveur",
            clientName: group.client?.nom || 'Client de passage',
            date: group.createdAt,
            items: group.items.map(item => ({
                article: item.article,
                quantite: item.quantite,
                prixUnitaire: item.prixTotal / (item.quantite || 1),
                prixTotal: item.prixTotal
            })),
            modePaiement: group.modePaiement || 'Cash',
            subTotal: subTotal,
            itemLevelDiscount: subTotal - group.totalGroupPrice,
            pourboire: group.totalGroupPourboire,
            totalNet: group.totalGroupPrice,
            amountPaid: group.totalGroupPrice + group.totalGroupPourboire,
            change: 0
        };
        setCurrentReceiptData(receiptData);
        setShowReceiptModal(true);
    };

    const groupedActivity = historique;

    if (loading) return <div className="d-flex justify-content-center align-items-center vh-100"><Spinner animation="border" role="status"><span className="visually-hidden">Chargement...</span></Spinner></div>;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div className={`d-flex align-items-center gap-3 ${boutiqueConfig?.type === 'Bar' ? 'bar-theme' : ''}`}>
                    <div className="d-md-none"><NotificationPopover /></div>
                    <h3 className="fw-bold mb-0">Mon Tableau de Bord</h3>
                    {refreshing && <Spinner animation="border" size="sm" className="text-primary" />}
                    <div className="d-none d-md-block"><NotificationPopover /></div>
                </div>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                    <Button
                        variant={ecoMode ? "success" : "outline-success"}
                        size="sm"
                        className="rounded-pill px-3 d-flex align-items-center"
                        onClick={() => {
                            const newMode = !ecoMode;
                            setEcoMode(newMode);
                            localStorage.setItem('ecoMode', newMode);
                        }}
                    >
                        <iconify-icon icon={ecoMode ? "solar:leaf-bold" : "solar:leaf-linear"} className="me-1"></iconify-icon>
                        {ecoMode ? "Éco: ON" : "Éco"}
                    </Button>
                    <Button variant="outline-secondary" size="sm" className="rounded-pill px-3" onClick={() => fetchData(true)} disabled={refreshing}>
                        <iconify-icon icon="solar:refresh-bold" className={`align-middle ${refreshing ? 'rotate-animation' : ''}`}></iconify-icon>
                    </Button>
                    <Button as={Link} to="/serveur/ventes" variant="primary" className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:cart-plus-bold" className="me-2 align-middle"></iconify-icon>
                        Nouvelle Commande
                    </Button>
                </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <Row className="g-4 mb-4">
                <Col md={3} xs={6}>
                    <Card className="border-0 shadow-sm bg-primary text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">Mes Ventes (Aujourd'hui)</h6>
                            <h2 className="fw-bold mb-0">{serverStats.totalVentes.toLocaleString()} GNF</h2>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3} xs={6}>
                    <Card className="border-0 shadow-sm bg-success text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">Mes Pourboires (Session)</h6>
                            <h2 className="fw-bold mb-0">{serverStats.totalPourboires.toLocaleString()} GNF</h2>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3} xs={6}>
                    <Card className="border-0 shadow-sm bg-success rounded-4 text-white border-top border-5 border-white">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">À ENCAISSER</h6>
                            <h2 className="fw-bold mb-0">{serverStats.commandesPretes}</h2>
                            <small className="fw-bold">Argent à collecter</small>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3} xs={6}>
                    <Card className="border-0 shadow-sm bg-warning text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">En cuisine/Bar</h6>
                            <h2 className="fw-bold mb-0">{serverStats.commandesEnAttente}</h2>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Header className="bg-white py-3"><h5 className="mb-0 fw-bold">Activités Récentes</h5></Card.Header>
                {refreshing && (
                    <div className="d-flex justify-content-center py-3"><Spinner animation="border" size="sm" /></div>
                )}
                <Table hover responsive className={`align-middle mb-0 ${refreshing ? 'opacity-50' : ''}`}>
                    <thead className="bg-light text-center">
                        <tr><th>Heure</th><th>Table</th><th>Articles</th><th className="text-end pe-4">Total</th><th>Statut</th></tr>
                    </thead>
                    <tbody>
                        {groupedActivity.slice(0, 8).map(group => (
                            <tr key={group.orderGroupId} className={
                                group.isCancelled ? "bg-light text-muted" :
                                    group.statut === 'finalisee' ? "bg-warning-subtle" :
                                        ""
                            }>
                                <td className="text-center">{new Date(group.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="text-center"><Badge bg="dark" className="px-3">{group.numeroTable || 'N/A'}</Badge></td>
                                <td>
                                    <ul className="list-unstyled mb-0 small">
                                        {group.items.map((item, idx) => (
                                            <li key={idx} className={item.isCancelled ? "text-decoration-line-through" : ""}>
                                                {item.article?.image && !ecoMode && (
                                                    <img src={item.article.image} alt="" className="rounded shadow-sm me-1"
                                                        style={{ width: '22px', height: '22px', objectFit: 'cover', verticalAlign: 'middle' }}
                                                    />
                                                )}
                                                <iconify-icon icon="solar:dot-bold" className="me-1 text-muted"></iconify-icon>
                                                {item.article?.nom || 'Article supprimé'} <Badge bg="light" text="dark" className="ms-1">x{item.quantite}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                                <td className={`fw-bold text-end pe-4 ${group.isCancelled ? '' : 'text-primary'}`}>{group.totalGroupPrice.toLocaleString()} GNF</td>
                                <td className="text-center">
                                    {group.statut === 'en_preparation' ? (
                                        <Button variant="success" size="sm" className="rounded-pill shadow-sm animate__animated animate__pulse animate__infinite" onClick={() => { setSelectedOrder(group); setShowPayModal(true); }}>
                                            ENCAISSER
                                        </Button>
                                    ) : (
                                        <div className="d-flex align-items-center justify-content-center gap-2">
                                            {group.isCancelled ? <Badge bg="danger">ANNULÉE</Badge> : <Badge bg={group.statut === 'finalisee' ? 'success' : 'warning'}>{group.statut.toUpperCase()}</Badge>}
                                            {group.statut === 'finalisee' && (
                                                <Button variant="outline-secondary" size="sm" className="rounded-circle p-1 d-flex" onClick={() => handleReprintFromTable(group)} title="Réimprimer ticket">
                                                    <iconify-icon icon="solar:printer-bold"></iconify-icon>
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {groupedActivity.length === 0 && <tr><td colSpan="5" className="text-center py-4 text-muted">Aucune activité enregistrée.</td></tr>}
                    </tbody>
                </Table>
            </Card>

            {/* Modale d'encaissement pour le serveur (Validation Workflow Étape 3) */}
            <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold text-primary">Finaliser l'encaissement</Modal.Title>
                </Modal.Header>
                <Modal.Body className="py-4 text-center">
                    <p className="mb-1 text-muted">Confirmez-vous le règlement par le client de la :</p>
                    <h5 className="fw-bold mb-3">Table {selectedOrder?.numeroTable || 'N/A'}</h5>
                    <h3 className="text-success fw-bold">{(selectedOrder?.totalGroupPrice || 0).toLocaleString()} GNF</h3>

                    <div className="mt-4 pt-3 border-top text-start">
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted">CHOISIR LE MODE DE PAIEMENT</Form.Label>
                            <div className="d-flex flex-wrap gap-2">
                                {['Cash', 'Orange Money', 'MobiCash', 'PayCard', 'Virement'].map(mode => (
                                    <Button
                                        key={mode}
                                        variant={paymentMode === mode ? (mode === 'Cash' ? 'success' : 'primary') : 'outline-secondary'}
                                        size="sm" // Correction: Utiliser size="sm" pour les boutons
                                        className="rounded-pill px-3 fw-bold"
                                        onClick={() => setPaymentMode(mode)}
                                    >
                                        {mode}
                                    </Button>
                                ))}
                            </div>
                        </Form.Group>

                        {activeQrCode && (
                            <div className="text-center my-3 p-3 bg-light rounded-4 animate__animated animate__zoomIn">
                                <h6 className="fw-bold text-dark mb-2">Scanner pour payer via {paymentMode}</h6>
                                {activeAccount && <p className="small text-muted mb-2">Compte: <span className="fw-bold text-primary">{activeAccount}</span></p>}
                                <img
                                    src={activeQrCode}
                                    alt={`QR Code ${paymentMode}`}
                                    className="img-fluid rounded shadow-sm border bg-white"
                                    style={{ maxHeight: '200px' }}
                                    onClick={() => {
                                        setFullscreenQrCode(activeQrCode);
                                        setShowQrCodeFullscreenModal(true);
                                    }}
                                    role="button"
                                    aria-label={`Agrandir le QR Code ${paymentMode}`}
                                />
                            </div>
                        )}


                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(paymentMode) && (
                            <Form.Group className="mb-3 animate__animated animate__fadeIn">
                                <Form.Label className="small fw-bold text-muted">RÉFÉRENCE DE TRANSACTION</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="text"
                                    placeholder={`ID de transaction ${paymentMode}`}
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    className="rounded-pill border-primary"
                                    required
                                />
                            </Form.Group>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 justify-content-center pb-4">
                    <Button variant="light" onClick={() => setShowPayModal(false)} className="rounded-pill px-4 fw-bold">Annuler</Button>
                    <Button
                        variant="success"
                        onClick={handleFinalizePayment}
                        className="rounded-pill px-4 shadow-sm fw-bold"
                        disabled={!paymentMode || (['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(paymentMode) && !transactionRef.trim())}
                    >
                        Valider l'encaissement
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Modale Impression Ticket */}
            <ReceiptModal
                show={showReceiptModal}
                onHide={() => setShowReceiptModal(false)}
                onPrint={handlePrintReceipt}
                canPrint={true} // Toujours vrai ici car la modale ne s'affiche qu'après encaissement réussi
            />
            {/* Modale d'aperçu d'image pour le QR Code */}
            <Modal show={showQrCodeFullscreenModal} onHide={() => setShowQrCodeFullscreenModal(false)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>QR Code {paymentMode}</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center bg-light p-4"><img src={fullscreenQrCode} alt="QR Code en plein écran" className="img-fluid rounded shadow" style={{ maxHeight: '80vh' }} /></Modal.Body>
            </Modal>
        </div>
    );
};

export default ServeurDashboard;