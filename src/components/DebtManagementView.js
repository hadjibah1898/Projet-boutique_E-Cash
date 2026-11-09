/**
 * @file DebtManagementView.js
 * @description Vue de gestion des créances : suivi des dettes clients, paiements.
 * ✅ CORRIGÉ POUR SQL SERVER et GÉNÉRATION PDF PARFAITE
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert, Pagination, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import { safeNum } from '../utils/formatUtils';
import jsPDF from 'jspdf';

const DebtManagementView = () => {
    const [dettes, setDettes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [amount, setAmount] = useState('');
    const [modePaiement, setModePaiement] = useState('Cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [lastPayment, setLastPayment] = useState(null);
    const [emailLoading, setEmailLoading] = useState(false);

    const userRole = localStorage.getItem('userRole');
    const isAdmin = userRole === 'Admin';

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [dettesRes, historyRes] = await Promise.all([
                clientAPI.getDebts(),
                clientAPI.getDebtHistory().catch(err => {
                    console.error("Erreur chargement historique:", err);
                    return { data: [] }; 
                })
            ]);

            setDettes(Array.isArray(dettesRes) ? dettesRes : (dettesRes.data || []));

            const historyData = Array.isArray(historyRes) ? historyRes : (historyRes.data || []);
            const sortedHistory = historyData.sort((a, b) => {
                return new Date(b.datePaiement || b.createdAt) - new Date(a.datePaiement || a.createdAt);
            });
            setHistory(sortedHistory);

        } catch (err) {
            console.error("Erreur critique:", err);
            setError(err.response?.data?.message || "Erreur lors du chargement des données.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePayment = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        setError('');
        setSuccess('');

        if (modePaiement === 'Orange Money' && !transactionRef.trim()) {
            setError("La référence de transaction est obligatoire pour Orange Money.");
            setSubmitLoading(false);
            return;
        }

        try {
            const montantPaye = Number(amount);
            const responseData = await clientAPI.payDette(selectedDebt.customerId, { montant: montantPaye, modePaiement, transactionRef });

            const clientInfo = { 
                email: selectedDebt.vcEmail, 
                nom: `${selectedDebt.vcFirstName || ''} ${selectedDebt.vcLastName || ''}`.trim() 
            };

            const nouveauSolde = responseData?.nouveauSolde ?? 0;
            const paiement = responseData?.paiement || {};
            const soldeAnterieur = responseData?.soldeAnterieur ?? 0;

            setDettes(prevDettes => prevDettes.map(d => 
                d.customerId === selectedDebt.customerId ? { ...d, mDebtAmount: safeNum(nouveauSolde) } : d
            ));

            setShowPayModal(false);
            setAmount('');
            setModePaiement('Cash');
            setTransactionRef('');

            const paymentReceipt = {
                id: paiement.id || Date.now(),
                clientEmail: clientInfo.email || '',
                clientName: clientInfo.nom || 'Client',
                amount: safeNum(montantPaye),
                oldDebt: safeNum(soldeAnterieur),
                modePaiement: modePaiement || 'Cash',
                transactionRef: transactionRef || '-'
            };

            setLastPayment(paymentReceipt);
            setSuccess("Paiement encaissé avec succès !");
            loadData();

        } catch (err) {
            console.error("--- ERREUR handlePayment ---", err);
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement du paiement.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleSendEmailReceipt = async (paymentId) => {
        if (!paymentId) return;
        setEmailLoading(true);
        try {
            await clientAPI.sendReceiptEmail(paymentId);
            setSuccess("Le reçu a été envoyé par email.");
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur email.");
        } finally {
            setEmailLoading(false);
        }
    };

    const sendWhatsApp = (dette) => {
        const nomComplet = `${dette.vcFirstName || ''} ${dette.vcLastName || ''}`.trim();
        const detteMontant = safeNum(dette.mDebtAmount);
        const telephone = dette.vcPhoneNumber || dette.telephone;
        const message = `Bonjour ${nomComplet}, nous vous rappelons qu'il reste un solde de ${detteMontant.toLocaleString()} GNF à régler.`;
        window.open(`https://wa.me/${telephone}?text=${encodeURIComponent(message)}`);
    };

    const generateReceipt = (payment) => {
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
            const pageWidth = 80;
            const margin = 5;
            let yPos = 5;

            // ✅ CORRECTION : On ne teste plus isNaN sur les textes
            const safeValue = (val, fallback = '-') => {
                if (val === null || val === undefined || val === 'undefined' || val === 'null') return fallback;
                const str = String(val).trim();
                return str || fallback;
            };

            const formatForPdf = (val) => {
                const num = Number(val);
                if (isNaN(num)) return '0 GNF';
                return num.toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' GNF';
            };

            const shopName = safeValue(localStorage.getItem('shopName'), 'MON ENTREPRISE');
            const shopAddress = safeValue(localStorage.getItem('shopAddress'), 'Adresse');
            const shopPhone = safeValue(localStorage.getItem('shopPhone'), 'Telephone');

            yPos += 5;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text(shopName, pageWidth / 2, yPos, { align: 'center' }); yPos += 4;
            doc.text(shopAddress, pageWidth / 2, yPos, { align: 'center' }); yPos += 4;
            doc.text(`Tel: ${shopPhone}`, pageWidth / 2, yPos, { align: 'center' }); yPos += 6;

            doc.setLineDashPattern([1, 1], 0);
            doc.line(margin, yPos, pageWidth - margin, yPos); yPos += 6;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("RECU DE PAIEMENT", pageWidth / 2, yPos, { align: 'center' }); yPos += 8;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(`Date: ${new Date().toLocaleString('fr-FR')}`, margin, yPos); yPos += 5;
            doc.text(`Recu N: PAY-${safeValue(payment.id, '').slice(-6).toUpperCase()}`, margin, yPos); yPos += 8;

            doc.setFont("helvetica", "bold");
            doc.text(`CLIENT: ${safeValue(payment.clientName, 'Client inconnu').toUpperCase()}`, margin, yPos); yPos += 8;

            doc.setLineDashPattern([0], 0);
            doc.setLineWidth(0.2);
            doc.line(margin, yPos, pageWidth - margin, yPos); yPos += 8;

            doc.setFontSize(10);
            const addLineItem = (label, value) => {
                doc.setFont("helvetica", "normal");
                doc.text(String(label), margin, yPos);
                doc.setFont("helvetica", "bold");
                doc.text(String(value), pageWidth - margin, yPos, { align: 'right' });
                yPos += 7;
            };

            addLineItem("Ancien Solde:", formatForPdf(payment.oldDebt));
            addLineItem("Montant Verse:", formatForPdf(payment.amount)); 
            
            if (payment.modePaiement) addLineItem("Mode:", safeValue(payment.modePaiement)); 
            if (payment.transactionRef) addLineItem("Ref:", safeValue(payment.transactionRef));

            yPos += 2;
            doc.line(margin, yPos, pageWidth - margin, yPos); yPos += 8;

            doc.setFontSize(12);
            const remaining = Math.max(0, Number(payment.oldDebt || 0) - Number(payment.amount || 0)); 
            addLineItem("NOUVEAU SOLDE:", formatForPdf(remaining));

            yPos += 10;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text("Merci de votre confiance !", pageWidth / 2, yPos, { align: 'center' }); yPos += 8;
            doc.text("........................................", pageWidth / 2, yPos, { align: 'center' }); yPos += 4;

            const cashierName = safeValue(localStorage.getItem('userName'), 'Operateur');
            doc.setFont("helvetica", "bold");
            doc.text(cashierName, pageWidth / 2, yPos, { align: 'center' }); yPos += 4;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`Recu genere par StockDash - ID: ${safeValue(payment.id, 'N/A')}`, pageWidth / 2, yPos, { align: 'center' });

            doc.save(`recu_${String(payment.clientName || 'client').replace(/\s+/g, '_')}_${Date.now()}.pdf`);
        } catch (error) {
            console.error("Erreur fatale PDF:", error);
            alert("Erreur lors de la création du PDF. Vérifiez la console (F12).");
        }
    };

    const handleExportExcel = () => {
        const workbook = XLSX.utils.book_new();

        const dataToExport = dettes.map(d => ({
            'Client': `${d.vcFirstName || ''} ${d.vcLastName || ''}`.trim(),
            'Telephone': d.vcPhoneNumber || '-',
            'Email': d.vcEmail || '-',
            'Dette Totale (GNF)': safeNum(d.mDebtAmount),
            'Echeance': d.dtDueDate ? new Date(d.dtDueDate).toLocaleDateString() : '-',
            'Statut': d.dtDueDate && new Date(d.dtDueDate) < new Date() ? 'En retard' : 'OK'
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Dettes_Clients");

        const historyData = (history || []).map(p => ({
            'Date': (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleString('fr-FR') : '-',
            'Client': p.client?.nom || `${p.vcFirstName || ''} ${p.vcLastName || ''}`.trim() || 'Client supprime',
            'Type': p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annulation' : 'Creation dette'),
            'Montant (GNF)': p.montant || 0,
            'Mode de Paiement': p.modePaiement || 'Cash',
            'Ref. Transaction': p.transactionRef || '-',
            'Ancien Solde (GNF)': p.soldeAnterieur ?? 0,
            'Nouveau Solde (GNF)': p.nouveauSolde ?? 0,
            'Boutique': p.boutique?.nom || '-',
            'Encaisse par': p.operateurNom || 'N/A'
        }));
        const worksheet2 = XLSX.utils.json_to_sheet(historyData);
        XLSX.utils.book_append_sheet(workbook, worksheet2, "Historique_Paiements");

        XLSX.writeFile(workbook, `etat_creances_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const getStatusBadge = (date) => {
        if (!date) return <Badge bg="secondary">Non definie</Badge>;
        const echeance = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = echeance - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return <Badge bg="danger">En Retard</Badge>;
        if (diffDays <= 7) return <Badge bg="warning" text="dark">Urgent</Badge>;
        return <Badge bg="success">En Cours</Badge>;
    };

    return (
        <div className="p-4">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">
                    <iconify-icon icon="solar:wallet-money-bold-duotone" className="me-2 text-primary"></iconify-icon>
                    {isAdmin ? "Controle des Creances" : "Gestion des Dettes"}
                </h3>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
                    <Button variant="outline-success" onClick={handleExportExcel} disabled={loading}>
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2"></iconify-icon>
                        Excel
                    </Button>
                    <Button variant="outline-primary" onClick={loadData} disabled={loading}>
                        <iconify-icon icon="solar:refresh-bold" className="me-2"></iconify-icon>
                        Actualiser
                    </Button>
                </div>
            </div>

            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
            {success && (
                <Alert variant="success" onClose={() => { setSuccess(''); setLastPayment(null); }} dismissible>
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                        <span>{success}</span>
                        <div className="d-flex gap-2 flex-wrap">
                            {lastPayment && (
                                <Button variant="outline-success" size="sm" onClick={() => generateReceipt(lastPayment)}>
                                    <iconify-icon icon="solar:printer-bold" className="me-1"></iconify-icon>
                                    Generer recu PDF
                                </Button>
                            )}
                            {lastPayment?.id && lastPayment.clientEmail && (
                                <Button variant="outline-primary" size="sm" onClick={() => handleSendEmailReceipt(lastPayment.id)} disabled={emailLoading}>
                                    {emailLoading ? <Spinner size="sm" /> : <><iconify-icon icon="solar:letter-bold" className="me-1"></iconify-icon> Envoyer par Email</>}
                                </Button>
                            )}
                        </div>
                    </div>
                </Alert>
            )}

            <Tabs defaultActiveKey="list" id="debt-management-tabs" className="mb-3 nav-tabs-custom">
                <Tab eventKey="list" title="Liste des Dettes">
                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-0">
                            <Table responsive hover className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4">Client</th>
                                        <th>Montant de la Dette</th>
                                        <th>Echeance</th>
                                        <th>Statut</th>
                                        <th className="pe-4 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && dettes.length === 0 ? (
                                        <tr><td colSpan="5" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : dettes.length > 0 ? dettes.map(d => (
                                        <tr key={d.customerId}>
                                            <td className="ps-4">
                                                <div className="fw-bold">{`${d.vcFirstName || ''} ${d.vcLastName || ''}`.trim() || 'N/A'}</div>
                                                <small className="text-muted">{d.vcPhoneNumber || '-'}</small>
                                            </td>
                                            <td className="text-danger fw-bold fs-6">{safeNum(d.mDebtAmount).toLocaleString()} GNF</td>
                                            <td>{d.dtDueDate ? new Date(d.dtDueDate).toLocaleDateString() : '-'}</td>
                                            <td>{getStatusBadge(d.dtDueDate)}</td>
                                            <td className="pe-4 text-end text-nowrap">
                                                {!isAdmin && safeNum(d.mDebtAmount) > 0 && (
                                                    <OverlayTrigger placement="top" overlay={<Tooltip>Encaisser un versement</Tooltip>}>
                                                        <Button variant="success" size="sm" className="me-1 me-md-2 table-action-btn d-inline-flex align-items-center" onClick={() => { setSelectedDebt(d); setShowPayModal(true); }}>
                                                            <iconify-icon icon="solar:money-bag-bold" className="me-1"></iconify-icon>
                                                            <span className="d-none d-md-inline">Encaisser</span>
                                                        </Button>
                                                    </OverlayTrigger>
                                                )}
                                                <OverlayTrigger placement="top" overlay={<Tooltip>Rappel WhatsApp</Tooltip>}>
                                                    <Button variant="info" size="sm" onClick={() => sendWhatsApp(d)} className="text-white table-action-btn d-inline-flex align-items-center">
                                                        <iconify-icon icon="logos:whatsapp-icon" className="me-1"></iconify-icon>
                                                        <span className="d-none d-md-inline">Rappel</span>
                                                    </Button>
                                                </OverlayTrigger>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="5" className="text-center text-muted py-5">Aucune dette en cours.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Tab>

                <Tab eventKey="history" title={
                    <span className="d-flex align-items-center">
                        <iconify-icon icon="solar:history-bold" className="me-2"></iconify-icon>
                        Historique des Paiements
                    </span>
                }>
                    <DebtHistoryTab history={history} loading={loading} onSendEmail={handleSendEmailReceipt} emailLoading={emailLoading} onPrint={generateReceipt} />
                </Tab>
            </Tabs>

            <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Encaisser un versement</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handlePayment}>
                    <Modal.Body>
                        <p>Client: <strong className="text-primary">{`${selectedDebt?.vcFirstName || ''} ${selectedDebt?.vcLastName || ''}`.trim()}</strong></p>
                        <p>Dette actuelle: <strong className="text-danger">{safeNum(selectedDebt?.mDebtAmount).toLocaleString()} GNF</strong></p>
                        <Form.Group className="mb-3">
                            <Form.Label>Mode de paiement</Form.Label>
                            <Form.Select
                                value={modePaiement}
                                onChange={(e) => setModePaiement(e.target.value)} 
                                className="rounded-pill"
                            >
                                <option value="Cash">💵 Especes (Cash)</option>
                                <option value="Orange Money">🍊 Orange Money</option>
                                <option value="MobiCash">🟡 Mobile money (MTN)</option>
                                <option value="PayCard">💳 PayCard</option>
                            </Form.Select>
                        </Form.Group>
                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(modePaiement) && (
                            <Form.Group className="mb-3">
                                <Form.Label>Numero de telephone {modePaiement === 'Orange Money' && <span className="text-danger">*</span>}</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    placeholder={`ID transaction ${modePaiement}`}
                                    required={modePaiement === 'Orange Money'}
                                    className="rounded-pill"
                                />
                            </Form.Group>
                        )}
                        <Form.Group>
                            <Form.Label>Montant verse</Form.Label>
                            <Form.Control
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Entrez le montant en GNF"
                                required
                                min="1" 
                                max={safeNum(selectedDebt?.mDebtAmount)}
                                autoFocus
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowPayModal(false)} disabled={submitLoading}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={submitLoading}>
                            {submitLoading ? <Spinner as="span" size="sm" /> : 'Enregistrer le versement'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

const DebtHistoryTab = ({ history, loading, onSendEmail, emailLoading, onPrint }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all');
    const itemsPerPage = 10;

    useEffect(() => { setCurrentPage(1); }, [history, searchTerm, filterMode]);

    const formatCurrencyPdf = (amount) => {
        const num = Number(amount);
        if (isNaN(num)) return '0 GNF';
        return num.toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' GNF';
    };

    const exportToPDF = () => {
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text("Historique des Paiements", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Genere le : ${new Date().toLocaleString('fr-FR')}`, 14, 28);

        let y = 40;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");

        doc.text("Date", 14, y);
        doc.text("Client", 45, y);
        doc.text("Type", 90, y);
        doc.text("Mode", 120, y);
        doc.text("Montant", 150, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        filteredHistory.forEach(p => {
            if (y > 250) {
                doc.addPage();
                y = 20;
                doc.setFont("helvetica", "bold");
                doc.text("Date", 14, y);
                doc.text("Client", 45, y);
                doc.text("Type", 90, y);
                doc.text("Mode", 120, y);
                doc.text("Montant", 150, y);
                doc.line(14, y + 2, 196, y + 2);
                y += 10;
                doc.setFont("helvetica", "normal");
            }

            const date = (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleDateString('fr-FR') : '-';
            const client = p.client?.nom || `${p.vcFirstName || ''} ${p.vcLastName || ''}`.trim() || 'Client inconnu';
            const montant = formatCurrencyPdf(p.montant);
            const type = p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annule' : 'Dette');
            const mode = p.modePaiement || 'Cash';

            doc.text(String(date), 14, y);
            doc.text(String(client).substring(0, 18), 45, y);
            doc.text(String(type), 90, y);
            doc.text(String(mode), 120, y);
            doc.text(String(montant), 150, y);

            y += 8;
        });

        y += 12;
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("DETAIL DES PAIEMENTS", 14, y);
        y += 8;

        filteredHistory.forEach(p => {
            if (y > 240) { doc.addPage(); y = 20; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("DETAIL DES PAIEMENTS (suite)", 14, y); y += 8; }

            const date = (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleString('fr-FR') : '-';
            const client = p.client?.nom || `${p.vcFirstName || ''} ${p.vcLastName || ''}`.trim() || 'Client inconnu';
            const type = p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annule' : 'Dette');
            const mode = p.modePaiement || 'Cash';
            const operateur = p.operateurNom || 'N/A';
            const ref = p.transactionRef || '-';

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`${client} - ${type}`, 14, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text(`Date : ${date}`, 18, y);
            y += 5;
            doc.text(`Montant : ${formatCurrencyPdf(p.montant)}    Mode : ${mode}    Ref : ${ref}`, 18, y);
            y += 5;
            doc.text(`Ancien solde : ${formatCurrencyPdf(p.soldeAnterieur ?? 0)}    Nouveau solde : ${formatCurrencyPdf(p.nouveauSolde ?? 0)}    Encaisse par : ${operateur}`, 18, y);
            y += 5;
            doc.setDrawColor(200);
            doc.line(14, y, 196, y);
            y += 8;
        });

        doc.save(`historique_paiements_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const filteredHistory = history.filter(p => {
        const clientName = p.client?.nom || `${p.vcFirstName || ''} ${p.vcLastName || ''}`.trim() || '';
        const matchName = clientName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchMode = filterMode === 'all' || p.modePaiement === filterMode;
        return matchName && matchMode;
    });

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

    return (
        <div className="animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <Form.Group className="flex-grow-1" style={{ maxWidth: '300px' }}>
                    <Form.Control
                        type="text"
                        placeholder="Rechercher par nom de client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-pill shadow-sm"
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Select
                        value={filterMode}
                        onChange={(e) => setFilterMode(e.target.value)}
                        className="rounded-pill shadow-sm"
                    >
                        <option value="all">Tous les modes</option>
                        <option value="Cash">💵 Especes</option>
                        <option value="Orange Money">🍊 Orange Money</option>
                        <option value="MobiCash">🟡 MobiCash</option>
                    </Form.Select>
                </Form.Group>
                <Button variant="outline-danger" onClick={exportToPDF} disabled={loading || filteredHistory.length === 0} className="rounded-pill shadow-sm">
                    <iconify-icon icon="solar:file-pdf-bold" className="me-2"></iconify-icon>
                    Exporter PDF
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-5"><Spinner /></div>
            ) : currentItems.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                    {currentItems.map(p => {
                        const datePaiement = p.datePaiement ? new Date(p.datePaiement) : new Date(p.createdAt);
                        const clientName = p.client?.nom || `${p.vcFirstName || ''} ${p.vcLastName || ''}`.trim() || 'Client supprime';
                        
                        return (
                            <Card key={p.id || p.referenceId || Math.random()} className="border-0 shadow-sm rounded-4 overflow-hidden">
                                <Card.Body className="p-0">
                                    <div className="d-flex flex-column flex-lg-row align-items-stretch">
                                        <div className={`d-flex flex-column justify-content-center align-items-center px-4 py-3 ${p.type === 'REMBOURSEMENT' ? 'bg-success-subtle text-success' : p.type === 'ANNULATION' ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'}`} style={{ minWidth: '110px' }}>
                                            <iconify-icon icon={p.type === 'REMBOURSEMENT' ? 'solar:money-bag-bold' : p.type === 'ANNULATION' ? 'solar:close-circle-bold' : 'solar:wallet-money-bold'} className="fs-1"></iconify-icon>
                                            <span className="fw-bold small text-uppercase mt-1">
                                                {p.type === 'REMBOURSEMENT' ? 'Paiement' : p.type === 'ANNULATION' ? 'Annule' : 'Dette'}
                                            </span>
                                        </div>

                                        <div className="flex-grow-1 p-3">
                                            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                                                <div>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="fw-bold fs-6">{clientName}</span>
                                                        <Badge bg="light" text="dark" className="border fw-normal">
                                                            <iconify-icon icon="solar:shop-2-bold" className="me-1 align-middle"></iconify-icon>
                                                            {p.boutique?.nom || 'N/A'}
                                                        </Badge>
                                                    </div>
                                                    <div className="small text-muted mt-1">
                                                        <iconify-icon icon="solar:calendar-bold-duotone" className="me-1 align-middle"></iconify-icon>
                                                        {datePaiement.toLocaleString('fr-FR')}
                                                    </div>
                                                    {p.type === 'REMBOURSEMENT' && (
                                                        <div className="mt-1">
                                                            {p.modePaiement === 'Orange Money' ? <Badge bg="warning" text="dark"><iconify-icon icon="logos:orange" className="me-1"></iconify-icon>Orange Money</Badge> :
                                                                p.modePaiement === 'MobiCash' ? <Badge bg="info"><iconify-icon icon="logos:mtn" className="me-1"></iconify-icon>MobiCash</Badge> :
                                                                    p.modePaiement === 'PayCard' ? <Badge bg="primary"><iconify-icon icon="solar:card-bold" className="me-1"></iconify-icon>PayCard</Badge> :
                                                                        <Badge bg="success-subtle" text="success">💵 Cash</Badge>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="d-flex gap-2">
                                                    <OverlayTrigger overlay={<Tooltip>Reimprimer le recu</Tooltip>}>
                                                        <Button variant="outline-secondary" size="sm" className="rounded-circle p-1 d-flex" onClick={() => onPrint({ id: p.id || p.referenceId, clientName: clientName, amount: p.montant, modePaiement: p.modePaiement || 'Cash', transactionRef: p.transactionRef, oldDebt: p.soldeAnterieur ?? ((p.client?.dette || 0) + p.montant) })}>
                                                            <iconify-icon icon="solar:printer-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                        </Button>
                                                    </OverlayTrigger>
                                                    {p.client?.email && (
                                                        <OverlayTrigger overlay={<Tooltip>Envoyer par email</Tooltip>}>
                                                            <Button variant="outline-primary" size="sm" className="rounded-circle p-1 d-flex" onClick={() => onSendEmail(p.id)} disabled={emailLoading}>
                                                                <iconify-icon icon="solar:letter-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                            </Button>
                                                        </OverlayTrigger>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="row g-2">
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">{p.type === 'REMBOURSEMENT' ? 'Montant verse' : 'Nouvelle Dette'}</div>
                                                        <div className={`fw-bold ${p.type === 'REMBOURSEMENT' ? 'text-success' : 'text-danger'}`}>
                                                            {p.type === 'REMBOURSEMENT' ? '-' : '+'}{safeNum(p.montant).toLocaleString()} GNF
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Ancien solde</div>
                                                        <div className="fw-bold text-dark">{safeNum(p.soldeAnterieur).toLocaleString()} GNF</div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Solde restant a payer</div>
                                                        <div className={`fw-bold ${p.nouveauSolde > 0 ? 'text-danger' : 'text-success'}`}>
                                                            {safeNum(p.nouveauSolde).toLocaleString()} GNF
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">{p.type === 'REMBOURSEMENT' ? 'Encaisse par' : 'Cree par'}</div>
                                                        <div className="fw-bold text-primary">{p.operateurNom || 'Systeme'}</div>
                                                        {p.transactionRef && <div className="small text-muted font-monospace">Ref: {p.transactionRef}</div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Alert variant="info" className="text-center border-0 shadow-sm rounded-4">Aucun paiement trouve pour cette recherche.</Alert>
            )}

            {!loading && filteredHistory.length > itemsPerPage && (
                <div className="d-flex justify-content-center mt-4">
                    <Pagination>
                        <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                        <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                        <Pagination.Item active>{currentPage} / {totalPages}</Pagination.Item>
                        <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                        <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                    </Pagination>
                </div>
            )}
        </div>
    );
};

export default DebtManagementView;