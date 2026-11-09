/**
 * @file CaissierCaisseView.js
 * @description Interface de gestion de caisse pour les caissiers (Architecture robuste).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Form, Spinner, Alert, Row, Col, InputGroup, Modal, Tabs, Tab, Table, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { useLocation } from 'react-router-dom';
import { caisseAPI, clientAPI, venteAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CaissierCaisseView = () => {
    const location = useLocation();
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState('');

    // States pour les formulaires
    const [fondInitial, setFondInitial] = useState('');
    const [montantCloture, setMontantCloture] = useState('');
    const [commentaires, setCommentaires] = useState('');
    const [afficherJustification, setAfficherJustification] = useState(false);

    // States pour les modales
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [statistiquesSession, setStatistiquesSession] = useState(null);
    const [openingCaisse, setOpeningCaisse] = useState(false);
    const [closingCaisse, setClosingCaisse] = useState(false);
    const [isCorrection, setIsCorrection] = useState(false);
    const [currentRapportForCorrection, setCurrentRapportForCorrection] = useState(null);

    // States pour le détail Fintech
    const [showActiveFintechDetails, setShowActiveFintechDetails] = useState(false);
    const [activeFintechData, setActiveFintechData] = useState({ sales: [], recoveries: [] });
    const [loadingFintechDetails, setLoadingFintechDetails] = useState(false);

    // Nettoyage propre des toasts à la sortie
    useEffect(() => {
        return () => toast.dismiss();
    }, []);

    const fetchStatut = useCallback(async () => {
        try {
            setLoading(true);
            const res = await caisseAPI.getStatut();
            setCaisseStatut(res);
        } catch (err) {
            if (err.response && err.response.status === 403) {
                // Normal (caisse fermée)
            } else {
                if (err.response?.data?.statut === 'REJETE' || err.response?.data?.statut === 'REJETE_PAR_GERANT') {
                    setIsCorrection(true);
                    toast.error(
                        <div>
                            <strong>Rapport Rejeté :</strong> {err.response.data.message} 
                            <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => setShowCloseModal(true)}>
                                Corriger et Relancer la clôture
                            </Button>
                        </div>
                    );
                } else {
                    setIsCorrection(false);
                }
            }
            setCaisseStatut(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            try {
                setLoading(true);
                const res = await caisseAPI.getStatut();
                if (isMounted) setCaisseStatut(res);
            } catch (err) {
                if (err.response && err.response.status === 403) {
                    // Normal
                } else {
                    if (err.response?.data?.statut === 'REJETE' || err.response?.data?.statut === 'REJETE_PAR_GERANT') {
                        setIsCorrection(true);
                        toast.error(
                            <div>
                                <strong>Rapport Rejeté :</strong> {err.response.data.message} 
                                <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => setShowCloseModal(true)}>
                                    Corriger et Relancer la clôture
                                </Button>
                            </div>
                        );
                    } else {
                        setIsCorrection(false);
                    }
                }
                if (isMounted) setCaisseStatut(null);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchData();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (location.state?.openCloseModal && caisseStatut && !loading) {
            setShowCloseModal(true);
            window.history.replaceState({}, document.title);
        }
    }, [location.state?.openCloseModal, caisseStatut?._id, loading]);

    useEffect(() => {
        if (showCloseModal && caisseStatut) {
            const abortController = new AbortController();
            const loadStatistiquesSession = async () => {
                try {
                    const res = await caisseAPI.getStatistiquesSession({ signal: abortController.signal });
                    setStatistiquesSession(res);
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error("Erreur stats:", err);
                        setStatistiquesSession(caisseStatut);
                    }
                }
            };
            loadStatistiquesSession();
            return () => abortController.abort();
        }
    }, [showCloseModal, caisseStatut?._id]);

    useEffect(() => {
        if (!showCloseModal) {
            setShowActiveFintechDetails(false);
            setActiveFintechData({ sales: [], recoveries: [] });
            setAfficherJustification(false);
        }
    }, [showCloseModal]);

    const toggleActiveFintechDetails = async () => {
        const source = currentRapportForCorrection || caisseStatut;
        if (!showActiveFintechDetails && source) {
            setLoadingFintechDetails(true);
            try {
                const sessionId = source.cashSessionId || source.ouvertureCaisse?._id || source.ouvertureCaisse || source._id;
                const [ventesRes, dettesRes] = await Promise.all([
                    venteAPI.getHistorique({ limit: 0 }),
                    clientAPI.getDebtHistory()
                ]);

                const mobileModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement', 'ORANGE_MONEY', 'MTN_MOMO', 'CARD', 'BANK_TRANSFER'];
                
                let allSales = [];
                if (Array.isArray(ventesRes)) allSales = ventesRes;
                else if (Array.isArray(ventesRes?.data)) allSales = ventesRes.data;
                else if (Array.isArray(ventesRes?.data?.ventes)) allSales = ventesRes.data.ventes;
                else if (Array.isArray(ventesRes?.ventes)) allSales = ventesRes.ventes;

                let allRecoveries = [];
                if (Array.isArray(dettesRes)) allRecoveries = dettesRes;
                else if (Array.isArray(dettesRes?.data)) allRecoveries = dettesRes.data;

                const fintechSales = allSales.filter(v => (v.cashSessionId || v.ouvertureCaisse?._id || v.ouvertureCaisse) === sessionId && mobileModes.includes(v.modePaiement || v.vcPaymentMethod) && !v.isCancelled);
                const fintechRecoveries = allRecoveries.filter(p => (p.cashSessionId || p.ouvertureCaisse?._id || p.ouvertureCaisse) === sessionId && mobileModes.includes(p.modePaiement || p.vcPaymentMethod) && p.statut === 'VALIDEE');

                setActiveFintechData({ sales: fintechSales, recoveries: fintechRecoveries });
            } catch (err) {
                console.error("Erreur Fintech:", err);
            } finally {
                setLoadingFintechDetails(false);
            }
        }
        setShowActiveFintechDetails(!showActiveFintechDetails);
    };

    const handleStartCorrection = (rapport) => {
        setMontantCloture(rapport.mClosingAmount || rapport.montantCloture);
        setCommentaires(rapport.vcManagerComment || rapport.commentairesGérant || '');
        setCurrentRapportForCorrection(rapport);
        setIsCorrection(true);
        setShowCloseModal(true);
    };

    const handleOpenCaisse = async (e) => {
        e.preventDefault();
        setSuccess('');
        setOpeningCaisse(true);
        try {
            await caisseAPI.ouvrir({ fondInitial: parseFloat(fondInitial) });
            toast.success("Caisse ouverte avec succès !");
            setFondInitial('');
            fetchStatut();
        } catch (err) {} finally {
            setOpeningCaisse(false);
        }
    };

    // ✅ CALCUL STABLE DES VALEURS D'AFFICHAGE
    const displayValues = useMemo(() => {
        if (isCorrection && currentRapportForCorrection) {
            const r = currentRapportForCorrection;
            const m_total = r.mTotalMobileMoney || r.totalMobileMoney || 0;
            const m_rec = r.mTotalMobileMoneyRecoveries || r.totalMobileMoneyRecoveries || 0;
            const m_sales = m_total - m_rec;

            return { 
                fondInitial: r.mOpeningCashReport || r.fondInitial || 0, 
                totalVentes: r.mTotalSales || r.totalVentes || 0, 
                totalVentesCash: Math.round((r.mTotalSales || 0) - (r.mTotalCredit || 0) - m_sales),
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalDettes: r.mTotalCredit || r.totalDettes || 0, 
                totalDepenses: r.mTotalApprovedExpenses || r.totalDepensesApprouvees || 0, 
                totalMobileMoney: m_total, 
                totalRecouvrementCash: Math.round((r.mTotalRecoveries || 0) - m_rec),
                soldeTheorique: Math.round(r.mTheoreticalBalance || r.soldeTheorique || 0), 
                totalRecouvrement: r.mTotalRecoveries || r.totalRecouvrement || 0 
            };
        } else {
            const source = statistiquesSession || caisseStatut;
            
            const f = source?.fondInitial ?? source?.mOpeningCaisse ?? 0; 
            const v = source?.totalVentes ?? source?.session?.totalVentes ?? 0;
            const d = source?.totalDettesAccordees ?? source?.session?.totalDettesAccordees ?? source?.totalDettes ?? 0;
            const m_total = source?.totalMobileMoney ?? source?.session?.totalMobileMoney ?? 0;
            const m_rec = source?.totalMobileMoneyRecoveries ?? source?.session?.totalMobileMoneyRecoveries ?? 0;
            const m_sales = m_total - m_rec;
            const r = source?.totalRecouvrement ?? source?.session?.totalRecouvrement ?? 0;
            const dep = source?.totalDepenses ?? source?.session?.totalDepenses ?? 0;
            const totalRapportsValides = 0; // Le caissier n'a pas de rapports de caissiers à lui ajouter

            return { 
                fondInitial: f, totalVentes: v, totalVentesCash: Math.round(v - d - m_sales), totalDettes: d, 
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalMobileMoney: m_total, totalRecouvrementCash: Math.round(r - m_rec),
                totalDepenses: dep, totalRecouvrement: r, totalRapportsValides,
                soldeTheorique: Math.round(f + (v - d - m_sales) + (r - m_rec) - dep) 
            };
        }
    }, [isCorrection, currentRapportForCorrection, statistiquesSession, caisseStatut]);

    // ✅ FONCTION DE CLÔTURE
    const handleCloseCaisse = async (e) => {
        e.preventDefault();
        setSuccess('');
        setClosingCaisse(true);
        setAfficherJustification(false);

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum)) {
             toast.error("Veuillez saisir un montant valide.");
             setClosingCaisse(false);
             return;
        }

        try {
            if (isCorrection) {
                await caisseAPI.corrigerRapport({ 
                    montantCloture: Math.round(montantClotureNum), 
                    commentairesGérant: commentaires 
                });
                toast.success("Rapport corrigé et renvoyé pour validation.");
            } else {
                await caisseAPI.fermer({ 
                    montantCloture: Math.round(montantClotureNum), 
                    commentairesGérant: commentaires.trim() 
                });
                toast.success("Caisse fermée et rapport généré avec succès.");
            }
            
            setMontantCloture('');
            setCommentaires('');
            setShowCloseModal(false);
            setCurrentRapportForCorrection(null);
            
            setTimeout(() => { fetchStatut(); }, 300); 
        } catch (err) {
            if (err.response?.status === 400) {
                setAfficherJustification(true); 
                toast.error(err.response.data.message); 
            } else {
                toast.error("Erreur lors de la clôture de la caisse.");
            }
        } finally {
            setClosingCaisse(false);
        }
    };

    const renderOpenCaisseForm = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body className="p-4">
                <div className="text-center mb-4">
                    <span><iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '64px' }} className="text-danger"></iconify-icon></span>
                    <h4 className="fw-bold mt-3">Caisse Fermée</h4>
                    <p className="text-muted">Veuillez ouvrir votre caisse pour commencer à enregistrer des ventes.</p>
                </div>
                <Form onSubmit={handleOpenCaisse}>
                    <Form.Group className="mb-3">
                        <Form.Label>Fond de caisse initial</Form.Label>
                        <InputGroup>
                            <Form.Control type="number" min="0" value={fondInitial} onChange={(e) => setFondInitial(e.target.value)} required autoFocus placeholder="Montant en GNF" />
                            <InputGroup.Text>GNF</InputGroup.Text>
                        </InputGroup>
                    </Form.Group>
                    <div className="d-grid">
                        <Button variant="success" type="submit" size="lg" disabled={openingCaisse}>
                            {openingCaisse ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /><span className="ms-2">Ouverture...</span></> : <><span><iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon></span> Ouvrir ma Caisse</>}
                        </Button>
                    </div>
                </Form>
            </Card.Body>
        </Card>
    );

    const renderCaisseOuverte = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Header className="bg-success-subtle text-success-emphasis py-3 d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0"><span><iconify-icon icon="solar:play-circle-bold" className="me-2"></iconify-icon></span> Ma Caisse Ouverte</h5>
                <Badge bg="success" pill>Session en cours</Badge>
            </Card.Header>
            <Card.Body className="p-4">
                <Row className="g-3 text-center">
                    <Col md={3}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Fond Initial</h6><h4 className="fw-bold">{(caisseStatut.fondInitial ?? caisseStatut.mOpeningCaisse ?? 0).toLocaleString()} GNF</h4></Card.Body></Card></Col>
                    <Col md={3}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Ventes de la session</h6><h4 className="fw-bold text-primary">{(caisseStatut.session?.totalVentes || 0).toLocaleString()} GNF</h4><small className="text-muted">{caisseStatut.session?.nombreVentes || 0} transaction(s)</small></Card.Body></Card></Col>
                    <Col md={3}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Recouvrements</h6><h4 className="fw-bold text-info">{(caisseStatut.totalRecouvrement ?? caisseStatut.session?.totalRecouvrement ?? 0).toLocaleString()} GNF</h4><small className="text-muted">Dettes payées</small></Card.Body></Card></Col>
                    <Col md={3}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Dépenses</h6><h4 className="fw-bold text-danger">{(caisseStatut.session?.totalDepenses || 0).toLocaleString()} GNF</h4><small className="text-muted">{caisseStatut.session?.nombreDepenses || 0} dépense(s)</small></Card.Body></Card></Col>
                </Row>

                <div className="d-grid mt-4">
                    <Button variant="danger" size="lg" onClick={() => setShowCloseModal(true)}><span><iconify-icon icon="solar:logout-3-bold" className="me-2"></iconify-icon></span> Clôturer ma Caisse et Envoyer le Rapport</Button>
                </div>
            </Card.Body>
        </Card>
    );

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <style>{`
                .blink-animation { animation: blinker 1.5s linear infinite; }
                @keyframes blinker { 50% { opacity: 0.3; } }
            `}</style>

            <h3 className="fw-bold mb-4">Ma Caisse</h3>
            {success && <Alert variant="success">{success}</Alert>}

            {/* ✅ Structure identique au gérant : Tabs sécurisés */}
            <Tabs defaultActiveKey="caisse" id="caissier-tabs" className="mb-3">
                <Tab eventKey="caisse" title="Caisse">
                    <div className="mt-4">{caisseStatut ? renderCaisseOuverte() : renderOpenCaisseForm()}</div>
                </Tab>
                <Tab eventKey="depenses" title="Dépenses">
                    <DepensesTab onExpenseCreated={fetchStatut} key={caisseStatut?._id || 'no-session'} caisseStatut={caisseStatut} />
                </Tab>
                <Tab eventKey="rapports" title="Mes Rapports">
                    <RapportsTab onCorrect={handleStartCorrection} />
                </Tab>
            </Tabs>

            {/* ✅ Modal en dehors des Tabs (Correction du Bug removeChild) */}
            <Modal show={showCloseModal} onHide={() => setShowCloseModal(false)} centered animation={false} size="lg">
                <Modal.Header closeButton><Modal.Title className="d-flex align-items-center">Clôturer ma caisse{isCorrection && <Badge bg="warning" text="dark" className="ms-2 fs-6">Mode Correction</Badge>}</Modal.Title></Modal.Header>
                <Form onSubmit={handleCloseCaisse}>
                    <Modal.Body>
                        <p>Veuillez compter le montant total présent physiquement dans votre caisse et le saisir ci-dessous.</p>
                        <Row className="mb-3">
                            <Col md={6}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Fond Initial</h6><h5 className="fw-bold">{(displayValues.fondInitial || 0).toLocaleString()} GNF</h5></Card.Body></Card></Col>
                            <Col md={6}><Card className="bg-light border-0"><Card.Body><h6 className="text-muted">Ventes de la session</h6><h5 className="fw-bold text-primary">{(displayValues.totalVentes || 0).toLocaleString()} GNF</h5></Card.Body></Card></Col>
                        </Row>
                        <Form.Group className="mb-3">
                            <Form.Label>Montant de clôture</Form.Label>
                            <InputGroup>
                                <Form.Control type="number" min="0" value={montantCloture} onChange={(e) => setMontantCloture(e.target.value)} required autoFocus />
                                <InputGroup.Text>GNF</InputGroup.Text>
                            </InputGroup>
                        </Form.Group>
                        
                        <Card className="mb-3 bg-light border-2">
                            <Card.Body className="p-3">
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon></span>Ventes (Fintech)</span><span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalVentesFintech || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon></span>Recouvrement (Fintech)</span><span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalMobileMoneyRecoveries || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between mb-2 pt-2 border-top border-warning border-opacity-50 align-items-center">
                                    <span className="fw-bold d-flex align-items-center" style={{ color: '#FF6600' }}><span><iconify-icon icon="solar:phone-calling-bold" className="me-2"></iconify-icon></span>Total Flux Fintech</span>
                                    <div className="text-end">
                                        <span className="fw-bold d-block" style={{ color: '#FF6600' }}>{(displayValues.totalMobileMoney || 0).toLocaleString()} GNF</span>
                                        {((displayValues.totalMobileMoney || 0) > 0) && (
                                            <Button variant="link" size="sm" className="p-0 text-decoration-none x-small fw-bold" style={{ color: '#FF6600', fontSize: '0.7rem' }} onClick={toggleActiveFintechDetails}>{showActiveFintechDetails ? 'Masquer détails' : 'Voir transactions'}</Button>
                                        )}
                                    </div>
                                </div>

                                {showActiveFintechDetails && (
                                    <div className="mb-3 animate__animated animate__fadeIn">
                                        {loadingFintechDetails ? <div className="text-center py-2"><Spinner size="sm" style={{ color: '#FF6600' }} /></div> : (
                                            <div className="border rounded bg-white overflow-auto" style={{ maxHeight: '150px' }}>
                                                <Table size="sm" hover className="mb-0 x-small" style={{ fontSize: '0.75rem' }}>
                                                    <thead className="bg-light sticky-top"><tr><th className="ps-2">Heure</th><th>Type</th><th className="text-end pe-2">Montant</th></tr></thead>
                                                    <tbody>
                                                        {activeFintechData.sales.map(v => (
                                                            <tr key={v._id}><td className="ps-2 text-muted">{new Date(v.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td><td>Vente ({v.modePaiement === 'Orange Money' ? 'OM' : v.modePaiement === 'MobiCash' ? 'Mobi' : 'Card'})</td><td className="text-end pe-2 fw-bold" style={{ color: '#FF6600' }}>{(v.prixTotal || 0).toLocaleString()}</td></tr>
                                                        ))}
                                                        {activeFintechData.recoveries.map(p => (
                                                            <tr key={p._id}><td className="ps-2 text-muted">{new Date(p.datePaiement || p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td><td className="text-info">Recouv. ({p.modePaiement === 'Orange Money' ? 'OM' : 'Mobi'})</td><td className="text-end pe-2 fw-bold text-info">{(p.montant || 0).toLocaleString()}</td></tr>
                                                        ))}
                                                        {activeFintechData.sales.length === 0 && activeFintechData.recoveries.length === 0 && <tr><td colSpan="3" className="text-center py-2 text-muted">Aucune transaction numérique.</td></tr>}
                                                    </tbody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <hr className="my-3 opacity-25" />
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:vault-bold" className="me-2"></iconify-icon></span>Fond initial</span><span className="fw-bold">{(displayValues.fondInitial || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:banknote-bold" className="me-2 text-success"></iconify-icon></span>Ventes au comptant (Cash)</span><span className="fw-bold text-success">+ {(displayValues.totalVentesCash || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:hand-money-bold" className="me-2 text-info"></iconify-icon></span>Recouvrements (Cash)</span><span className="fw-bold text-info">+ {(displayValues.totalRecouvrementCash || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between mb-2"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:notebook-bold" className="me-2 text-warning"></iconify-icon></span>Dettes accordées (Crédit)</span><span className="fw-bold text-warning">- {(displayValues.totalDettes || 0).toLocaleString()} GNF</span></div>
                                <div className="d-flex justify-content-between"><span className="text-muted d-flex align-items-center"><span><iconify-icon icon="solar:wallet-minus-bold" className="me-2 text-danger"></iconify-icon></span>Total Dépenses</span><span className="fw-bold text-danger">- {(displayValues.totalDepenses || 0).toLocaleString()} GNF</span></div>
                                <hr/>
                                
                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="fw-bold text-danger d-flex align-items-center"><span><iconify-icon icon="solar:safe-square-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon></span>Total Espèces Attendu</span>
                                    <span className="fw-bold fs-5 text-danger">{(displayValues.soldeTheorique || 0).toLocaleString()} GNF</span>
                                </div>
                            </Card.Body>
                        </Card>

                        {afficherJustification && (
                            <Alert variant="danger" className="blink-animation mt-3">
                                <strong>Écart de caisse détecté par le serveur.</strong> Une justification est obligatoire pour clôturer.
                            </Alert>
                        )}
                        
                        {afficherJustification && (
                            <Form.Group className="mt-3">
                                <Form.Label className="blink-animation text-danger fw-bold">Commentaires (Obligatoire)</Form.Label>
                                <Form.Control as="textarea" rows={3} value={commentaires} onChange={(e) => setCommentaires(e.target.value)} placeholder="Justifiez l'écart détecté..." className="border-danger" />
                            </Form.Group>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowCloseModal(false)} disabled={closingCaisse}>Annuler</Button>
                        <Button variant="danger" type="submit" disabled={closingCaisse}>{closingCaisse ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /><span className="ms-2">Clôture en cours...</span></> : isCorrection ? 'Corriger et Renvoyer' : 'Soumettre le Rapport'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

// Sous-composant Dépenses (Identique)
const DepensesTab = ({ onExpenseCreated, caisseStatut }) => {
    // ... (Code identique du sous-composant Dépenses, copié depuis CaisseView.js)
    const [depenses, setDepenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showCommissionModal, setShowCommissionModal] = useState(false);
    const [newExpense, setNewExpense] = useState({ montant: '', motif: '' });
    const [submitLoading, setSubmitLoading] = useState(false);
    
    const [workers, setWorkers] = useState([]);
    const [loadingWorkers, setLoadingWorkers] = useState(false);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [commissionSubmitLoading, setCommissionSubmitLoading] = useState(false);
    
    const availableCash = caisseStatut 
        ? (caisseStatut.session?.cashReelActuel ?? 
          ((caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - (caisseStatut.session?.totalDettesAccordees || 0) + (caisseStatut.session?.totalRecouvrement || 0) - (caisseStatut.session?.totalDepenses || 0)))
        : 0;

    const fetchDepenses = useCallback(() => {
        if (!caisseStatut) {
            setDepenses([]); setLoading(false); return;
        }
        setLoading(true);
        caisseAPI.getMesDepenses()
            .then(res => {
                let list = [];
                if (Array.isArray(res)) list = res;
                else if (Array.isArray(res?.data)) list = res.data;
                else if (Array.isArray(res?.data?.data)) list = res.data.data;

                const sessionDepenses = list.filter(d => 
                    d.cashSessionId === caisseStatut.cashSessionId || 
                    d.ouvertureCaisse === caisseStatut._id
                );
                setDepenses(sessionDepenses);
            })
            .catch(err => { setDepenses([]); })
            .finally(() => setLoading(false));
    }, [caisseStatut]);

    useEffect(() => { fetchDepenses(); }, [fetchDepenses]);

    useEffect(() => {
        if (showCommissionModal) {
            setLoadingWorkers(true);
            clientAPI.getAll()
                .then(res => {
                    let list = [];
                    if (Array.isArray(res)) list = res;
                    else if (Array.isArray(res?.data)) list = res.data;
                    else if (Array.isArray(res?.data?.data)) list = res.data.data;

                    const workersWithCommission = list.filter(c => c.type === 'Ouvrier' && c.commission > 0);
                    setWorkers(workersWithCommission);
                })
                .catch(err => {})
                .finally(() => setLoadingWorkers(false));
        }
    }, [showCommissionModal]);

    const handleOpenCreateModal = () => { setNewExpense({ montant: '', motif: '' }); setShowModal(true); };
    const handleOpenCommissionModal = () => { setSelectedWorkerId(''); setPaymentAmount(''); setShowCommissionModal(true); };

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        if (parseFloat(newExpense.montant) > availableCash) {
            toast.error(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
            setSubmitLoading(false); return;
        }
        try {
            await caisseAPI.creerDepense(newExpense);
            fetchDepenses();
            setNewExpense({ montant: '', motif: '' });
            setShowModal(false);
            if (onExpenseCreated) onExpenseCreated();
        } catch (err) {} finally { setSubmitLoading(false); }
    };

    const handlePayCommission = async (e) => {
        e.preventDefault();
        setCommissionSubmitLoading(true);
        const selectedWorker = workers.find(w => w._id === selectedWorkerId);

        if (parseFloat(paymentAmount) > availableCash) {
            toast.error(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
            setCommissionSubmitLoading(false); return;
        }
        if (!selectedWorker) {
            toast.error("Veuillez sélectionner un ouvrier."); setCommissionSubmitLoading(false); return;
        }
        const amountToPay = parseFloat(paymentAmount);
        if (isNaN(amountToPay) || amountToPay <= 0) {
            toast.error("Le montant à payer est invalide."); setCommissionSubmitLoading(false); return;
        }
        if (amountToPay > selectedWorker.commission) {
            toast.error("Le montant à payer ne peut pas dépasser la commission due."); setCommissionSubmitLoading(false); return;
        }

        try {
            await clientAPI.payerCommission({ workerId: selectedWorker._id, montant: amountToPay });
            fetchDepenses();
            setShowCommissionModal(false);
            if (onExpenseCreated) onExpenseCreated();
        } catch (err) {} finally { setCommissionSubmitLoading(false); }
    };

    const selectedWorkerForInfo = workers.find(w => w._id === selectedWorkerId);

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 className="fw-bold mb-0">Mes Dépenses</h5>
                <div className="d-flex gap-2">
                    <Button variant="info" size="sm" onClick={handleOpenCommissionModal} className="text-white" disabled={!caisseStatut}><span><iconify-icon icon="solar:money-bag-bold" className="me-2 align-middle"></iconify-icon></span>Payer Commission</Button>
                    <Button variant="primary" size="sm" onClick={handleOpenCreateModal} disabled={!caisseStatut}><span><iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle"></iconify-icon></span>Nouvelle Dépense</Button>
                </div>
            </Card.Header>
            <Card.Body>
                <Table striped hover responsive className="align-middle">
                    <thead><tr><th>Date</th><th>Motif</th><th className="text-end">Montant</th></tr></thead>
                    <tbody>
                        {loading ? <tr><td colSpan="3" className="text-center"><Spinner size="sm" /></td></tr> : depenses.length > 0 ? (
                            depenses.map(d => (
                                <tr key={d._id || d.expenseId}>
                                    <td>{new Date(d.dtCreatedAt || d.createdAt).toLocaleDateString()}</td>
                                    <td>{d.vcReason || d.motif}</td>
                                    <td className="text-end fw-bold">{(d.mAmount || d.montant || 0).toLocaleString()} GNF</td>
                                </tr>
                            ))
                        ) : <tr><td colSpan="3" className="text-center text-muted">Aucune dépense enregistrée pour cette session.</td></tr>}
                    </tbody>
                </Table>
            </Card.Body>

            <Modal show={showModal} onHide={() => setShowModal(false)} centered animation={false}>
                <Modal.Header closeButton><Modal.Title>Déclarer une dépense</Modal.Title></Modal.Header>
                <Form onSubmit={handleCreateExpense}>
                    <Modal.Body>
                        <Form.Group className="mb-3"><Form.Label>Motif</Form.Label><Form.Control type="text" required value={newExpense.motif} onChange={e => setNewExpense({...newExpense, motif: e.target.value})} placeholder="Ex: Transport, Achat petit matériel..." /></Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Montant</Form.Label>
                            <InputGroup>
                                <Form.Control type="number" required min="1" value={newExpense.montant} onChange={e => setNewExpense({...newExpense, montant: e.target.value})} isInvalid={parseFloat(newExpense.montant) > availableCash} />
                                <InputGroup.Text>GNF</InputGroup.Text>
                                <Form.Control.Feedback type="invalid">Le montant dépasse le cash disponible ({availableCash.toLocaleString()} GNF).</Form.Control.Feedback>
                            </InputGroup>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer><Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button><Button variant="primary" type="submit" disabled={submitLoading}>{submitLoading ? <Spinner size="sm" /> : 'Enregistrer'}</Button></Modal.Footer>
                </Form>
            </Modal>

            <Modal show={showCommissionModal} onHide={() => setShowCommissionModal(false)} centered animation={false}>
                <Modal.Header closeButton><Modal.Title>Payer une Commission</Modal.Title></Modal.Header>
                <Form onSubmit={handlePayCommission}>
                    <Modal.Body>
                        {loadingWorkers ? <div className="text-center"><Spinner /></div> : (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label>Ouvrier</Form.Label>
                                    <Form.Select value={selectedWorkerId} onChange={e => setSelectedWorkerId(e.target.value)} required>
                                        <option value="">Sélectionner un ouvrier...</option>
                                        {workers.map((w, index) => (<option key={w._id || index} value={w._id}>{w.nom} (Due: {w.commission.toLocaleString()} GNF)</option>))}
                                    </Form.Select>
                                </Form.Group>
                                {selectedWorkerForInfo && (
                                    <Form.Group className="mb-3">
                                        <Form.Label>Montant à Payer</Form.Label>
                                        <InputGroup>
                                            <Form.Control type="number" required min="1" max={selectedWorkerForInfo.commission} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} isInvalid={parseFloat(paymentAmount) > availableCash} />
                                            <InputGroup.Text>GNF</InputGroup.Text>
                                            <Form.Control.Feedback type="invalid">Le montant dépasse le cash disponible ({availableCash.toLocaleString()} GNF).</Form.Control.Feedback>
                                        </InputGroup>
                                    </Form.Group>
                                )}
                            </>
                        )}
                    </Modal.Body>
                    <Modal.Footer><Button variant="secondary" onClick={() => setShowCommissionModal(false)}>Annuler</Button><Button variant="primary" type="submit" disabled={commissionSubmitLoading || !selectedWorkerId}>{commissionSubmitLoading ? <Spinner size="sm" /> : 'Payer et Enregistrer'}</Button></Modal.Footer>
                </Form>
            </Modal>
        </Card>
    );
};

// Sous-composant Rapports (Identique)
const RapportsTab = ({ onCorrect }) => {
    // ... (Code identique du sous-composant Rapports, copié depuis CaisseView.js)
    // Ce composant contient la table, l'export PDF et la modale de détails
    const [rapports, setRapports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRapport, setSelectedRapport] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [detailedReportData, setDetailedReportData] = useState(null);
    const [filterSalesMode, setFilterSalesMode] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const formatTableCurrency = (value) => {
        const num = value?.$numberDecimal ? parseFloat(value.$numberDecimal) : parseFloat(value);
        const safeValue = isNaN(num) ? 0 : num;
        return safeValue.toLocaleString('fr-FR') + ' GNF';
    };

    useEffect(() => {
        let isMounted = true;
        caisseAPI.getMesRapports()
            .then(res => {
                if (!isMounted) return;
                let listeRapports = [];
                if (Array.isArray(res)) listeRapports = res;
                else if (Array.isArray(res?.data)) listeRapports = res.data;
                else if (Array.isArray(res?.data?.data)) listeRapports = res.data.data;
                setRapports(listeRapports);
            })
            .catch(err => {})
            .finally(() => { if (isMounted) setLoading(false); });

        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const fetchDetailedReport = async () => {
            if (showDetailsModal && selectedRapport) {
                setDetailsLoading(true);
                try {
                    const res = await caisseAPI.getReportDetails(selectedRapport.cashReportId || selectedRapport._id);
                    if (isMounted) setDetailedReportData(res?.data?.data ? res.data.data : res);
                } catch (err) {} finally {
                    if (isMounted) setDetailsLoading(false);
                }
            }
        };
        fetchDetailedReport();
        return () => { isMounted = false; };
    }, [showDetailsModal, selectedRapport]);

    const getStatusBadge = (statusId) => {
        switch (statusId) {
            case 3: return <Badge bg="success">Validé</Badge>;
            case 4: return <Badge bg="danger">Rejeté</Badge>;
            default: return <Badge bg="warning" text="dark">En attente</Badge>;
        }
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Historique des Rapports de Caisse", 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 14, 28);
        let y = 40;
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        doc.text("Date", 14, y);
        doc.text("Ventes", 40, y);
        doc.text("Numérique", 70, y);
        doc.text("Théorique", 100, y);
        doc.text("Clôture", 130, y);
        doc.text("Écart", 160, y);
        doc.text("Statut", 185, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        rapports.forEach(r => {
            if (y > 280) { doc.addPage(); y = 20; }
            const date = new Date(r.dtCreatedAt || r.createdAt).toLocaleDateString('fr-FR');
            const ventes = (r.mTotalSales || r.totalVentes || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const numerique = (r.mTotalMobileMoney || r.totalMobileMoney || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const theo = (r.mTheoreticalBalance || r.soldeTheorique || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const cloture = (r.mClosingAmount || r.montantCloture || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const ecart = (r.mDifferenceAmount || r.ecart || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const statut = r.statut === 'VALIDE' || r.cashReportStatusId === 3 ? 'Validé' : (r.statut === 'REJETE' || r.cashReportStatusId === 4 ? 'Rejeté' : 'En attente');
            doc.text(date, 14, y); doc.text(ventes, 40, y); doc.text(numerique, 70, y); doc.text(theo, 100, y); doc.text(cloture, 130, y); doc.text(ecart, 160, y); doc.text(statut, 185, y);
            y += 8;
        });
        doc.save(`rapports_caisse_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    const generateDetailedReportPDF = (dataFromClick) => {
        try {
            let details = detailedReportData;
            if (dataFromClick && !dataFromClick.nativeEvent) {
                details = dataFromClick;
            }
            
            if (!details) {
                toast.error("Aucune donnée disponible pour le PDF.");
                return;
            }

            const rapport = details.rapport || details.data?.rapport || details;
            const ventes = Array.isArray(details.ventes) ? details.ventes : (Array.isArray(details.data?.ventes) ? details.data.ventes : []);
            const depenses = Array.isArray(details.depenses) ? details.depenses : (Array.isArray(details.data?.depenses) ? details.data.depenses : []);
            const remboursements = Array.isArray(details.remboursements) ? details.remboursements : (Array.isArray(details.data?.remboursements) ? details.data.remboursements : []);
            const dettesAccordees = Array.isArray(details.dettesAccordees) ? details.dettesAccordees : (Array.isArray(details.data?.dettesAccordees) ? details.data.dettesAccordees : []);

            if (!rapport || typeof rapport !== 'object' || !rapport.mTotalSales) {
                console.error("Données du rapport invalides:", details);
                toast.error("Impossible de générer le PDF : données du rapport introuvables.");
                return;
            }

            const doc = new jsPDF();
            let y = 10;
            
            const formatCurrency = (value) => {
                const num = value?.$numberDecimal ? parseFloat(value.$numberDecimal) : parseFloat(value);
                return (isNaN(num) ? 0 : num).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' GNF';
            };

            const boutiqueNom = rapport.boutique?.nom || rapport.storeName || 'Boutique';
            const gerantNom = rapport.gerant?.nom || rapport.userFirstName || 'Gérant';
            const dateRapport = rapport.dtCreatedAt || rapport.createdAt ? new Date(rapport.dtCreatedAt || rapport.createdAt).toLocaleDateString('fr-FR') : 'Date inconnue';
            
            const v = parseFloat(rapport.mTotalSales || 0);
            const d = parseFloat(rapport.mTotalCredit || 0);
            const m = parseFloat(rapport.mTotalMobileMoney || 0);
            const totalVentesCash = v - d - m;
            
            doc.setFontSize(18);
            doc.text(`Rapport de Caisse Détaillé - ${boutiqueNom}`, 14, y); y += 7;
            doc.setFontSize(12);
            doc.text(`Gérant: ${gerantNom}`, 14, y); y += 5;
            doc.text(`Date du rapport: ${dateRapport}`, 14, y); y += 10;
            
            doc.setFontSize(14); doc.text("Résumé du Rapport", 14, y); y += 5;
            autoTable(doc, {
                startY: y,
                head: [['Description', 'Montant']],
                body: [
                    ['Fond Initial', formatCurrency(rapport.mOpeningCashReport)],
                    ['Total Ventes (Chiffre d\'Affaires)', formatCurrency(rapport.mTotalSales)],
                    ['Paiements Numériques (Fintech)', formatCurrency(rapport.mTotalMobileMoney)],
                    ['Dettes accordées (Crédit)', `- ${formatCurrency(rapport.mTotalCredit)}`],
                    ['Ventes au comptant (Net Cash)', formatCurrency(totalVentesCash)],
                    ['Recouvrements Dettes', `+ ${formatCurrency(rapport.mTotalRecoveries || 0)}`],
                    ['Total Dépenses Approuvées', `- ${formatCurrency(rapport.mTotalApprovedExpenses)}`],
                    ['Solde Théorique Attendu', formatCurrency(rapport.mTheoreticalBalance)],
                    ['Montant Clôturé', formatCurrency(rapport.mClosingAmount)],
                    ['Écart', formatCurrency(rapport.mDifferenceAmount)],
                    ['Statut', rapport.cashReportStatusId === 3 ? 'Validé' : (rapport.cashReportStatusId === 4 ? 'Rejeté' : 'En attente')],
                    ['Commentaires Gérant', (rapport.vcManagerComment || '').trim() || 'Aucun commentaire'],
                    ['Commentaires Admin', (rapport.vcAdminComment || '').trim() || 'Aucun commentaire']
                ],
                theme: 'grid',
                styles: { fontSize: 10, cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                columnStyles: { 1: { halign: 'right' } }
            });
            
            y = (doc.lastAutoTable?.finalY || y) + 10;

            if (ventes.length > 0) {
                if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 10; }
                doc.setFontSize(14); doc.text("Détail des Ventes", 14, y); y += 5;
                autoTable(doc, {
                    startY: y,
                    head: [['Article', 'Quantité', 'Prix Total']],
                    body: ventes.map(item => [
                        item.articleNom || item.vcProductName || item.article?.nom || item.nom || 'N/A', 
                        item.quantite || item.dcQuantity || 0, 
                        formatCurrency(item.prixTotal || item.mLineAmount)
                    ]),
                    theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [60, 179, 113], textColor: 255 },
                    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } }
                });
                y = (doc.lastAutoTable?.finalY || y) + 10;
            }

            if (remboursements.length > 0) {
                if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 10; }
                doc.setFontSize(14); doc.text("Recouvrements de Dettes", 14, y); y += 5;
                autoTable(doc, {
                    startY: y, head: [['Client', 'Montant', 'Date']],
                    body: remboursements.map(r => [r.client?.nom || r.clientNom || 'N/A', formatCurrency(r.montant || r.mAmount), new Date(r.datePaiement || r.dtCreatedAt || r.createdAt).toLocaleDateString('fr-FR')]),
                    theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [0, 123, 255], textColor: 255 },
                    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
                });
                y = (doc.lastAutoTable?.finalY || y) + 10;
            }

            if (depenses.length > 0) {
                if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 10; }
                doc.setFontSize(14); doc.text("Détail des Dépenses", 14, y); y += 5;
                autoTable(doc, {
                    startY: y, head: [['Motif', 'Montant', 'Date']],
                    body: depenses.map(dep => [dep.motif || dep.vcReason || 'N/A', formatCurrency(dep.montant || dep.mAmount), new Date(dep.dtCreatedAt || dep.createdAt).toLocaleDateString('fr-FR')]),
                    theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [220, 53, 69], textColor: 255 },
                    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
                });
                y = (doc.lastAutoTable?.finalY || y) + 10;
            }

            doc.save(`rapport_caisse_detaille_${rapport.cashReportId || rapport._id || 'export'}.pdf`);
            toast.success("PDF exporté avec succès !");

        } catch (error) {
            console.error("Erreur fatale PDF:", error);
            toast.error("Erreur lors de la génération du PDF. Vérifiez la console.");
        }
    };

    const handleExportRapportPDF = async (r) => {
        try {
            const res = await caisseAPI.getReportDetails(r.cashReportId || r._id);
            const details = res?.data?.data ? res.data.data : res;
            if (details?.rapport) { generateDetailedReportPDF(details); } 
            else { generateDetailedReportPDF({ rapport: r, ventes: [], depenses: [], remboursements: [], dettesAccordees: [] }); }
        } catch (err) {
            generateDetailedReportPDF({ rapport: r, ventes: [], depenses: [], remboursements: [], dettesAccordees: [] });
            toast.warning('Détails indisponibles, PDF résumé généré.');
        }
    };

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">Historique de mes Rapports de Caisse</h5>
                <Button variant="outline-danger" size="sm" onClick={exportToPDF} disabled={loading || rapports.length === 0}><span><iconify-icon icon="solar:file-pdf-bold" className="me-2"></iconify-icon></span>Exporter PDF</Button>
            </Card.Header>
            <Card.Body>
                <Table striped hover responsive>
                    <thead><tr><th>Date</th><th>Total Ventes</th><th>Paiements Num.</th><th>Ventes Crédit</th><th>Solde EXACT</th><th>Montant Clôturé</th><th>Écart</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>
                        {loading ? <tr><td colSpan="9" className="text-center"><Spinner size="sm" /></td></tr> : rapports.length > 0 ? (
                            rapports.map(r => (
                                <tr key={r.cashReportId || r._id}>
                                    <td>{new Date(r.dtCreatedAt || r.createdAt).toLocaleDateString('fr-FR')}</td>
                                    <td>{formatTableCurrency(r.mTotalSales || r.totalVentes)}</td>
                                    <td className="fw-bold" style={{ color: '#FF6600' }}>{formatTableCurrency(r.mTotalMobileMoney || r.totalMobileMoney)}</td>
                                    <td className="text-warning fw-bold">{formatTableCurrency(r.mTotalCredit || r.totalDettes)}</td>
                                    <td className="fw-bold">{formatTableCurrency(r.mTheoreticalBalance || r.soldeTheorique)}</td>
                                    <td className="text-primary fw-bold">{formatTableCurrency(r.mClosingAmount || r.montantCloture)}</td>
                                    <td><Badge bg={(r.mDifferenceAmount || r.ecart) === 0 ? 'success' : 'danger'}>{formatTableCurrency(r.mDifferenceAmount || r.ecart)}</Badge></td>
                                    <td>{getStatusBadge(r.cashReportStatusId || r.statut)}</td>
                                    <td>
                                        <Button variant="outline-danger" size="sm" className="me-2" onClick={() => handleExportRapportPDF(r)} title="PDF">
                                            <iconify-icon icon="solar:file-pdf-bold" className="me-1 align-middle"></iconify-icon> PDF
                                        </Button>
                                        <Button variant="outline-primary" size="sm" onClick={() => { setSelectedRapport(r); setShowDetailsModal(true); }} title="Détails">
                                            <span><iconify-icon icon="solar:chat-line-bold-duotone" className="me-1"></iconify-icon></span>Détails
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        ) : <tr><td colSpan="9" className="text-center text-muted">Aucun rapport trouvé.</td></tr>}
                    </tbody>
                </Table>
            </Card.Body>

            <Modal show={showDetailsModal} onHide={() => { setShowDetailsModal(false); setFilterSalesMode(null); }} centered size="lg" animation={false}>
                <Modal.Header closeButton><Modal.Title>Détails du Rapport & Échanges</Modal.Title></Modal.Header>
                <Modal.Body>
                    {selectedRapport && (
                        <>
                            <Row className="mb-4">
                                <Col md={6}>
                                    <div className="p-3 bg-light rounded-3 h-100">
                                        <h6 className="text-muted mb-3">Résumé Financier</h6>
                                        <div className="d-flex justify-content-between mb-2"><span>Total Ventes :</span><span className="fw-bold">{formatTableCurrency(selectedRapport.mTotalSales || selectedRapport.totalVentes)}</span></div>
                                        <div className={`d-flex justify-content-between mb-2 p-2 rounded transition-all shadow-sm ${filterSalesMode === 'digital' ? 'text-white' : ''}`} style={{ cursor: 'pointer', backgroundColor: filterSalesMode === 'digital' ? '#FF6600' : '#FFF5EB', color: filterSalesMode === 'digital' ? '#FFFFFF' : '#FF6600', border: `1px solid ${filterSalesMode === 'digital' ? '#FF6600' : '#FFE0CC'}` }} onClick={() => setFilterSalesMode(filterSalesMode === 'digital' ? null : 'digital')} title="Cliquez pour filtrer les paiements Orange Money / MobiCash">
                                            <span>📱 Paiements Fintech (OM/Mobi) :</span><span className="fw-bold">{formatTableCurrency(selectedRapport.mTotalMobileMoney || selectedRapport.totalMobileMoney)}</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-2"><span>Solde EXACT :</span><span className="fw-bold">{formatTableCurrency(selectedRapport.mTheoreticalBalance || selectedRapport.soldeTheorique)}</span></div>
                                        <div className="d-flex justify-content-between border-top pt-2 mt-2"><span>Montant Clôture :</span><span className="fw-bold text-primary">{formatTableCurrency(selectedRapport.mClosingAmount || selectedRapport.montantCloture)}</span></div>
                                    </div>
                                </Col>
                                <Col md={6}>
                                    <h6 className="fw-bold mb-3">Discussion & Justifications</h6>
                                    <div className="mb-3">
                                        <small className="text-muted d-block mb-1">Votre commentaire :</small>
                                        <div className="p-2 border rounded bg-white small" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>{selectedRapport.vcManagerComment || selectedRapport.commentairesGérant || <em className="text-muted">Aucun commentaire envoyé.</em>}</div>
                                    </div>
                                    {(selectedRapport.vcAdminComment || selectedRapport.commentairesAdmin) && (
                                        <div className="mb-3 animate__animated animate__fadeIn">
                                            <small className="text-primary fw-bold d-block mb-1">Réponse de l'Admin :</small>
                                            <div className="p-2 border border-primary bg-primary-subtle rounded text-primary-emphasis small"><span><iconify-icon icon="solar:chat-round-check-bold" className="me-1 align-middle"></iconify-icon></span>{selectedRapport.vcAdminComment || selectedRapport.commentairesAdmin}</div>
                                        </div>
                                    )}
                                </Col>
                            </Row>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    {selectedRapport && (selectedRapport.statut === 'REJETE' || selectedRapport.cashReportStatusId === 4) && (
                        <Button variant="warning" onClick={() => { setShowDetailsModal(false); if (onCorrect) onCorrect(selectedRapport); }}>Corriger et Relancer</Button>
                    )}
                    <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>
        </Card>
    );
};

export default CaissierCaisseView;