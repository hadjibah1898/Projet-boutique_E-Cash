// src/components/AdminCaisseView.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Table, Badge, Tabs, Tab, Spinner, Alert, Modal, Form, Row, Col, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { caisseAPI, authAPI, boutiqueAPI, venteAPI } from '../services/api';
import jsPDF from 'jspdf';
import XLSX from 'xlsx-js-style';
import logo from '../assets/logo.png';
import autoTable from 'jspdf-autotable';

const AdminCaisseView = () => {
    const [searchParams] = useSearchParams();
    const [key, setKey] = useState(searchParams.get('tab') || 'rapports');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Données
    const [managers, setManagers] = useState([]);
    const [rapports, setRapports] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [caisseAdmin, setCaisseAdmin] = useState(null);

    // Filtres
    const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
    const [filterGerant, setFilterGerant] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [showValidateReportModal, setShowValidateReportModal] = useState(false);
    const [showRejectReportModal, setShowRejectReportModal] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);

    // États pour la visualisation globale des transactions Fintech
    const [fintechSales, setFintechSales] = useState([]);
    const [fintechSearchTerm, setFintechSearchTerm] = useState('');
    const [fintechLoading, setFintechLoading] = useState(false);

    // Nouveaux états pour la modale de détails
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [filterSalesMode, setFilterSalesMode] = useState(null); 
    const [reportDetails, setReportDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const [adminComment, setAdminComment] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    // ✅ FONCTION UTILITAIRE POUR SÉCURISER LES NOMBRES
    const safeNum = (v) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && v.$numberDecimal) return parseFloat(v.$numberDecimal) || 0;
        const parsed = parseFloat(v);
        return isNaN(parsed) ? 0 : parsed;
    };

    // ✅ SÉCURISATION : Extraction du nom du gérant
    const resolveGerantName = (data) => {
        if (!data) return 'N/A';
        if (data.userFirstName || data.userLastName) {
            return `${data.userFirstName || ''} ${data.userLastName || ''}`.trim();
        }
        if (typeof data === 'object') {
            return `${data.vcFirstName || data.nom || ''} ${data.vcLastName || ''}`.trim() || 'N/A';
        }
        const manager = managers.find(m => m._id === data || m.userId === data);
        return manager ? `${manager.vcFirstName || ''} ${manager.vcLastName || manager.nom || ''}`.trim() : data;
    };

    // ✅ SÉCURISATION : Extraction du nom de la boutique
    const resolveBoutiqueName = (data) => {
        if (!data) return 'N/A';
        if (data.storeName) return data.storeName;
        if (typeof data === 'object') {
            return data.vcStoreName || data.nom || data.name || 'N/A';
        }
        const b = boutiques.find(item => item._id === data || item.storeId === data);
        return b ? (b.vcStoreName || b.nom) : data;
    };

    // Chargement des données
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [usersRes, rapportsRes, caisseAdminRes, boutiquesRes] = await Promise.all([
                authAPI.getUsers(),
                caisseAPI.listerRapports({ ...dateFilter, gerant: filterGerant, limit: 0 }),
                caisseAPI.getCaisseAdmin(),
                boutiqueAPI.getAll()
            ]);

            const usersList = Array.isArray(usersRes) ? usersRes : (usersRes?.data || []);
            setManagers(usersList.filter(u => u.role === 'Gérant' || u.role === 'MANAGER'));

            const boutiquesList = Array.isArray(boutiquesRes) ? boutiquesRes : (boutiquesRes?.data || []);
            setBoutiques(boutiquesList);

            const rapportsList = Array.isArray(rapportsRes) ? rapportsRes : (rapportsRes?.data || []);
            setRapports(rapportsList);

            const caisseObj = caisseAdminRes?.data ? caisseAdminRes.data : caisseAdminRes;
            
            if (caisseObj && caisseObj.mCurrentBalance !== undefined && caisseObj.soldeActuel === undefined) {
                caisseObj.soldeActuel = caisseObj.mCurrentBalance;
            }
            if (caisseObj && caisseObj.movements !== undefined && caisseObj.historique === undefined) {
                caisseObj.historique = caisseObj.movements;
            }

            setCaisseAdmin(caisseObj || null);
            setCurrentPage(1);
        } catch (err) {
            console.error(err);
            setError("Impossible de charger les données. Vérifiez votre connexion.");
        } finally {
            setLoading(false);
        }
    }, [dateFilter, filterGerant]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Gestion des Rapports ---
    const handleValidateReportClick = (rapport) => {
        setSelectedReport(rapport);
        setAdminComment('');
        setShowValidateReportModal(true);
    };

    const confirmValidateReport = async (e) => {
        e.preventDefault();
        if (isValidating) return;
        setIsValidating(true);
        
        try {
            const reportId = selectedReport.cashReportId || selectedReport._id;
            await caisseAPI.validerRapport(reportId, { commentairesAdmin: adminComment });
            setSuccess("Rapport validé. Le montant a été transféré vers la caisse centrale.");
            setShowValidateReportModal(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            const msg = err.response?.data?.message || "Erreur lors de la validation.";
            if (msg.includes('déjà')) {
                setSuccess("Ce rapport était déjà validé.");
                setShowValidateReportModal(false);
                fetchData();
            } else {
                setError(msg);
            }
        } finally {
            setIsValidating(false);
        }
    };

    const handleRejectReportClick = (rapport) => {
        setSelectedReport(rapport);
        setAdminComment('');
        setShowRejectReportModal(true);
    };

    const confirmRejectReport = async (e) => {
        e.preventDefault();
        if (!adminComment.trim()) {
            setError("Un motif de rejet est obligatoire.");
            return;
        }
        if (isValidating) return;
        setIsValidating(true);
        
        try {
            const reportId = selectedReport.cashReportId || selectedReport._id;
            await caisseAPI.rejeterRapport(reportId, { commentairesAdmin: adminComment });
            setSuccess("Rapport rejeté avec succès.");
            setShowRejectReportModal(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du rejet.");
        } finally {
            setIsValidating(false);
        }
    };

    const handleShowDetails = async (rapport) => {
        const status = rapport.cashReportStatusId || (rapport.statut === 'VALIDE' ? 3 : rapport.statut === 'REJETE' ? 4 : 1);
        if (status === 1) return;

        setShowDetailsModal(true);
        setDetailsLoading(true);
        setError('');
        try {
            const reportId = rapport.cashReportId || rapport._id;
            const res = await caisseAPI.getReportDetails(reportId);
            const data = res?.data?.data || res?.data || res;

            setReportDetails({
                rapport: data.rapport || (Array.isArray(data) ? data[0] : data),
                ventes: data.ventes || (Array.isArray(data) ? data[1] : []),
                depenses: data.depenses || (Array.isArray(data) ? data[2] : [])
            });  
        } catch (err) {
            setError("Impossible de charger les détails du rapport.");
            setShowDetailsModal(false);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleCloseDetailsModal = () => {
        setShowDetailsModal(false);
        setFilterSalesMode(null);
    };

    // ✅ CORRECTION ICI : Cette fonction gère maintenant le format SQL (tableau plat)
    const fetchFintechSales = useCallback(async () => {
        setFintechLoading(true);
        try {
            const res = await venteAPI.getHistorique({
                startDate: dateFilter.startDate,
                endDate: dateFilter.endDate,
                gerantId: filterGerant,
                limit: 0, 
                transactionRefSearch: fintechSearchTerm 
            });

            // On extrait le tableau de ventes de manière sécurisée
            let allSales = [];
            if (Array.isArray(res)) allSales = res;
            else if (Array.isArray(res?.data)) allSales = res.data;
            else if (Array.isArray(res?.data?.ventes)) allSales = res.data.ventes;
            else if (Array.isArray(res?.ventes)) allSales = res.ventes;

            const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement', 'OM', 'Mobi', 'ORANGE_MONEY', 'MTN_MOMO'];

            const filtered = [];
            (allSales || []).forEach(item => {
                // Cas 1 : Ancien format groupé (avec des "items")
                if (item.items && Array.isArray(item.items)) {
                    item.items.forEach(subItem => {
                        const mode = subItem.modePaiement || subItem.vcPaymentMethod;
                        if (digitalModes.includes(mode) && !subItem.isCancelled) {
                            filtered.push({
                                ...subItem,
                                boutique: subItem.boutique || item.boutique,
                                gerant: subItem.gerant || item.gerant,
                                createdAt: subItem.createdAt || subItem.dtSoldAt || item.createdAt,
                                transactionRef: subItem.transactionRef || item.transactionRef
                            });
                        }
                    });
                } 
                // Cas 2 : Nouveau format plat (une ligne = une vente SQL)
                else {
                    const mode = item.modePaiement || item.vcPaymentMethod;
                    if (digitalModes.includes(mode) && !item.isCancelled) {
                        filtered.push({
                            ...item,
                            boutique: item.boutique,
                            gerant: item.gerant,
                            createdAt: item.dtSoldAt || item.createdAt,
                            transactionRef: item.transactionRef || item.vcTransactionId
                        });
                    }
                }
            });
            
            setFintechSales(filtered);
        } catch (err) {
            console.error(err);
            setError("Erreur lors de la récupération des transactions Fintech.");
        } finally {
            setFintechLoading(false);
        }
    }, [dateFilter, filterGerant, fintechSearchTerm]);

    useEffect(() => {
        if (key === 'fintech') {
            fetchFintechSales();
        }
    }, [key, fetchFintechSales]);

    const handleExportFintechPDF = () => {
        const doc = new jsPDF('portrait');
        const formatCurrencyPdf = (amount) => (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');

        doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        doc.setFontSize(18).setTextColor(255, 102, 0); 
        doc.text("DÉTAIL DES TRANSACTIONS FINTECH (OM/MOBI)", 60, 18);

        doc.setFontSize(10).setTextColor(100);
        doc.text(`Période du ${dateFilter.startDate || 'début'} au ${dateFilter.endDate || 'ce jour'}`, 14, 30);
        if (filterGerant) {
            const gerant = managers.find(m => m._id === filterGerant);
            doc.text(`Filtre Gérant: ${gerant?.nom || gerant?.vcFirstName || 'N/A'}`, 14, 35);
        }

        const tableColumn = ["Date", "Heure", "Boutique", "Gérant", "Mode", "Réf. Transaction", "Montant"];
        const tableRows = fintechSales.map(v => [
            new Date(v.createdAt).toLocaleDateString('fr-FR'),
            new Date(v.createdAt).toLocaleTimeString('fr-FR'),
            resolveBoutiqueName(v.boutique),
            resolveGerantName(v.gerant),
            v.modePaiement,
            v.transactionRef || '-',
            formatCurrencyPdf(safeNum(v.prixTotal || v.mNetAmount))
        ]);

        const total = fintechSales.reduce((acc, v) => acc + safeNum(v.prixTotal || v.mNetAmount), 0);
        tableRows.push([
            { content: 'TOTAL GÉNÉRAL', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
            { content: formatCurrencyPdf(total), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: filterGerant ? 40 : 35,
            theme: 'grid',
            headStyles: { fillColor: [255, 102, 0], halign: 'center' },
            columnStyles: { 6: { halign: 'right' } }
        });

        doc.save(`details_fintech_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleExportFintechExcel = () => {
        const dataToExport = fintechSales.map(v => ({
            'Date': new Date(v.createdAt).toLocaleDateString('fr-FR'),
            'Heure': new Date(v.createdAt).toLocaleTimeString('fr-FR'),
            'Boutique': resolveBoutiqueName(v.boutique),
            'Gérant': resolveGerantName(v.gerant),
            'Mode': v.modePaiement,
            'Référence': v.transactionRef || '-',
            'Montant (GNF)': safeNum(v.prixTotal || v.mNetAmount)
        }));

        const total = fintechSales.reduce((acc, v) => acc + safeNum(v.prixTotal || v.mNetAmount), 0);
        dataToExport.push({ 'Date': 'TOTAL GÉNÉRAL', 'Montant (GNF)': total });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions Fintech");

        worksheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];

        XLSX.writeFile(workbook, `details_fintech_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF('portrait');
        const formatCurrencyPdf = (amount) => (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');

        doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        doc.setFontSize(22).setTextColor(41, 128, 185).setFont("helvetica", "bold");
        doc.text("RAPPORT FINANCIER DE CAISSE", 60, 18);
        
        doc.setFontSize(11).setTextColor(100);
        let startY = 30;
        doc.text(`Période du ${dateFilter.startDate || 'début'} au ${dateFilter.endDate || 'fin'}`, 14, startY);
        startY += 8;

        if (filterGerant) {
            const selectedManager = managers.find(m => m._id === filterGerant);
            doc.text(`Gérant: ${selectedManager?.nom || selectedManager?.vcFirstName || 'N/A'}`, 14, startY);
            startY += 8;
        }

        if (key === 'caisse-centrale' && caisseAdmin) {
            const tableColumn = ["Date", "Source", "Gérant", "Montant"];
            const tableRows = [];
            const filteredHistory = caisseAdmin.historique?.filter(entry => {
                const entryDate = new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt);
                const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
                const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
                if (end) end.setHours(23, 59, 59, 999);
                const dateMatch = (!start || entryDate >= start) && (!end || entryDate <= end);
                let gerantMatch = true;
                if (filterGerant) {
                    const selectedManager = managers.find(m => m._id === filterGerant);
                    if (selectedManager) gerantMatch = entry.gerant === filterGerant || entry.gerant === selectedManager.nom;
                }
                return dateMatch && gerantMatch;
            }) || [];

            const sortedHistory = [...filteredHistory].reverse();
            sortedHistory.forEach(entry => {
                tableRows.push([
                    new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt).toLocaleDateString('fr-FR'),
                    entry.boutiqueNom || 'Boutique inconnue',
                    entry.gerantNom || 'Gérant inconnu',
                    formatCurrencyPdf(safeNum(entry.montant || entry.mAmount))
                ]);
            });

            const totalEncaissements = sortedHistory.reduce((acc, entry) => acc + safeNum(entry.montant || entry.mAmount), 0);
            tableRows.push(['', '', 'TOTAL GÉNÉRAL', formatCurrencyPdf(totalEncaissements)]);

            autoTable(doc, {
                head: [tableColumn], body: tableRows, startY: startY, theme: 'grid',
                styles: { halign: 'center', valign: 'middle', fontSize: 10 },
                headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 11, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 70 }, 2: { cellWidth: 70 }, 3: { cellWidth: 60, halign: 'right' } },
                alternateRowStyles: { fillColor: [245, 245, 245] }
            });

            doc.setFontSize(12).setTextColor(0);
            const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 100;
            doc.text(`Solde Actuel Caisse Centrale: ${formatCurrency(caisseAdmin.soldeActuel || caisseAdmin.mCurrentBalance)}`, 14, finalY + 10);
        } else {
            const tableColumn = ["Date", "Gérant", "Boutique", "Ventes", "Numérique", "Dettes", "Dépenses", "Théorique", "Montant Reçu", "Écart"];
            const tableRows = [];
            rapports.forEach(report => {
                tableRows.push([
                    new Date(report.dtCreatedAt || report.createdAt).toLocaleDateString('fr-FR'),
                    resolveGerantName(report.gerant || report.userName || report),
                    resolveBoutiqueName(report.boutique || report.storeName || report),
                    formatCurrencyPdf(safeNum(report.mTotalSales || report.totalVentes)),
                    formatCurrencyPdf(safeNum(report.mTotalMobileMoney || report.totalMobileMoney)),
                    formatCurrencyPdf(safeNum(report.mTotalCredit || report.totalDettes)),
                    formatCurrencyPdf(safeNum(report.mTotalApprovedExpenses || report.totalDepensesApprouvees)),
                    formatCurrencyPdf(safeNum(report.mTheoreticalBalance || report.soldeTheorique)),
                    formatCurrencyPdf(safeNum(report.mClosingAmount || report.montantCloture)),
                    formatCurrencyPdf(safeNum(report.mDifferenceAmount || report.ecart))
                ]);
            });

            const totalVentes = rapports.reduce((acc, r) => acc + safeNum(r.mTotalSales || r.totalVentes), 0);
            const totalMobile = rapports.reduce((acc, r) => acc + safeNum(r.mTotalMobileMoney || r.totalMobileMoney), 0);
            const totalDettes = rapports.reduce((acc, r) => acc + safeNum(r.mTotalCredit || r.totalDettes), 0);
            const totalDepenses = rapports.reduce((acc, r) => acc + safeNum(r.mTotalApprovedExpenses || r.totalDepensesApprouvees), 0);
            const totalTheo = rapports.reduce((acc, r) => acc + safeNum(r.mTheoreticalBalance || r.soldeTheorique), 0);
            const totalRecu = rapports.reduce((acc, r) => acc + safeNum(r.mClosingAmount || r.montantCloture), 0);
            const totalEcart = rapports.reduce((acc, r) => acc + safeNum(r.mDifferenceAmount || r.ecart), 0);

            tableRows.push([
                { content: 'TOTAL GÉNÉRAL', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalVentes), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalMobile), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalDettes), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalDepenses), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalTheo), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalRecu), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: formatCurrencyPdf(totalEcart), styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: totalEcart < 0 ? [200, 0, 0] : [0, 150, 0] } }
            ]);

            autoTable(doc, {
                head: [tableColumn], body: tableRows, startY: startY, theme: 'grid',
                headStyles: { fillColor: [41, 128, 185], fontSize: 11, fontStyle: 'bold', halign: 'center' },
                bodyStyles: { fontSize: 9, valign: 'middle' },
                columnStyles: {
                    0: { cellWidth: 18 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20 },
                    3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 18 }, 5: { halign: 'right', cellWidth: 16 },
                    6: { halign: 'right', cellWidth: 16 }, 7: { halign: 'right', cellWidth: 22 }, 8: { halign: 'right', cellWidth: 22 }, 9: { halign: 'right', cellWidth: 18 }
                }
            });
        }
        doc.save(`historique_encaissements_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleExportReportDetailsPDF = () => {
        if (!reportDetails || !reportDetails.rapport) return;
        const doc = new jsPDF('portrait');
        const formatCurrencyPdf = (amount) => (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[ \u202f]/g, ' ');
        const r = reportDetails.rapport;

        doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        doc.setFontSize(18).setTextColor(41, 128, 185).setFont('helvetica', 'bold');
        doc.text('RAPPORT DE CAISSE - DETAIL', 60, 18);
        doc.setFontSize(10).setTextColor(100).setFont('helvetica', 'normal');
        doc.text(`Gerant: ${resolveGerantName(r)}  |  Boutique: ${resolveBoutiqueName(r)}`, 14, 30);
        doc.text(`Date: ${new Date(r.dtCreatedAt || r.createdAt).toLocaleString('fr-FR')}  |  Statut: ${r.statut || (r.cashReportStatusId === 3 ? 'VALIDE' : 'EN_ATTENTE')}`, 14, 36);
        
        autoTable(doc, {
            body: [
                ['Ventes (CA)', formatCurrencyPdf(r.mTotalSales || r.totalVentes)],
                ['Mobile Money', formatCurrencyPdf(r.mTotalMobileMoney || r.totalMobileMoney)],
                ['Recouvrements', formatCurrencyPdf(r.mTotalRecoveries || r.totalRecouvrement)],
                ['Dettes', formatCurrencyPdf(r.mTotalCredit || r.totalDettes)],
                ['Depenses', formatCurrencyPdf(r.mTotalApprovedExpenses || r.totalDepensesApprouvees)],
                ['Solde theorique (attendu)', formatCurrencyPdf(r.mTheoreticalBalance || r.soldeTheorique)],
                ['Montant recu', formatCurrencyPdf(r.mClosingAmount || r.montantCloture)],
                ['Ecart', formatCurrencyPdf(r.mDifferenceAmount || r.ecart)],
            ],
            startY: 40, theme: 'grid', styles: { fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'right' } },
        });

        let cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 100;
        doc.setFontSize(12).setTextColor(0).setFont('helvetica', 'bold');
        doc.text(`Ventes (${(reportDetails.ventes || []).length})`, 14, cursorY);
        cursorY += 4;
        
        autoTable(doc, {
            head: [['Heure', 'Article', 'Mode', 'Qte', 'Total']],
            body: (reportDetails.ventes || []).map(v => [
                new Date(v.dtSoldAt || v.createdAt).toLocaleTimeString('fr-FR'),
                v.article?.nom || v.vcProductName || v.articleNom || 'Article supprime',
                v.modePaiement || v.vcPaymentMethod || 'Cash',
                String(v.quantite || v.dcQuantity || '-'),
                formatCurrencyPdf(v.prixTotal || v.mLineAmount),
            ]),
            startY: cursorY, theme: 'grid', headStyles: { fillColor: [41, 128, 185], halign: 'center' },
            columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' } },
        });
        
        cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : cursorY + 10;

        if (cursorY > 250) { doc.addPage(); cursorY = 20; }
        doc.setFont('helvetica', 'bold').text(`Depenses (${(reportDetails.depenses || []).length})`, 14, cursorY);
        cursorY += 4;
        
        autoTable(doc, {
            head: [['Heure', 'Motif', 'Montant']],
            body: (reportDetails.depenses || []).map(d => [
                new Date(d.dtCreatedAt || d.createdAt).toLocaleTimeString('fr-FR'),
                d.motif || d.vcReason || '-',
                formatCurrencyPdf(d.montant || d.mAmount),
            ]),
            startY: cursorY, theme: 'grid', headStyles: { fillColor: [220, 53, 69], halign: 'center' },
            columnStyles: { 2: { halign: 'right' } },
        });

        const fileName = `rapport_${r.userFirstName || r.userLastName || 'gerant'}_${new Date(r.dtCreatedAt || r.createdAt).toISOString().split('T')[0]}.pdf`;
        doc.save(fileName.replace(/\s+/g, '_'));
    };

    const handleExportExcel = () => {
        let dataToExport = [];
        let fileName = "";
        let sheetName = "";

        if (key === 'caisse-centrale' && caisseAdmin) {
            fileName = `export_caisse_centrale_${new Date().toISOString().split('T')[0]}.xlsx`;
            sheetName = "Caisse Centrale";
            const sortedHistory = [...filteredHistory].reverse();
            
            dataToExport = sortedHistory.map(entry => ({
                'Date': new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt).toLocaleDateString('fr-FR'),
                'Source': entry.boutiqueNom || 'Boutique inconnue',
                'Gérant': entry.gerantNom || 'Gérant inconnu',
                'Montant (GNF)': safeNum(entry.montant || entry.mAmount)
            }));

            dataToExport.push({
                'Date': 'TOTAL GÉNÉRAL', 'Source': '', 'Gérant': '', 'Montant (GNF)': totalEncaissementsPeriode
            });
        } else {
            fileName = `export_rapports_caisse_${new Date().toISOString().split('T')[0]}.xlsx`;
            sheetName = "Rapports";

            dataToExport = rapports.map(r => ({
                'Date': new Date(r.dtCreatedAt || r.createdAt).toLocaleDateString('fr-FR'),
                'Gérant': resolveGerantName(r.gerant || r.userName || r),
                'Boutique': resolveBoutiqueName(r.boutique || r.storeName || r),
                'Total Ventes (GNF)': safeNum(r.mTotalSales || r.totalVentes),
                'Paiements Numériques (GNF)': safeNum(r.mTotalMobileMoney || r.totalMobileMoney),
                'Dettes Accordées (GNF)': safeNum(r.mTotalCredit || r.totalDettes),
                'Dépenses (GNF)': safeNum(r.mTotalApprovedExpenses || r.totalDepensesApprouvees),
                'Solde Théorique (GNF)': safeNum(r.mTheoreticalBalance || r.soldeTheorique),
                'Montant Reçu (GNF)': safeNum(r.mClosingAmount || r.montantCloture),
                'Écart (GNF)': safeNum(r.mDifferenceAmount || r.ecart),
                'Statut': r.statut || (r.cashReportStatusId === 3 ? 'VALIDE' : r.cashReportStatusId === 4 ? 'REJETE' : 'EN_ATTENTE')
            }));

            const totalVentes = rapports.reduce((acc, r) => acc + safeNum(r.mTotalSales || r.totalVentes), 0);
            const totalMobile = rapports.reduce((acc, r) => acc + safeNum(r.mTotalMobileMoney || r.totalMobileMoney), 0);
            const totalDettes = rapports.reduce((acc, r) => acc + safeNum(r.mTotalCredit || r.totalDettes), 0);
            const totalDepenses = rapports.reduce((acc, r) => acc + safeNum(r.mTotalApprovedExpenses || r.totalDepensesApprouvees), 0);
            const totalTheo = rapports.reduce((acc, r) => acc + safeNum(r.mTheoreticalBalance || r.soldeTheorique), 0);
            const totalRecu = rapports.reduce((acc, r) => acc + safeNum(r.mClosingAmount || r.montantCloture), 0);
            const totalEcart = rapports.reduce((acc, r) => acc + safeNum(r.mDifferenceAmount || r.ecart), 0);

            dataToExport.push({
                'Date': 'TOTAL GÉNÉRAL', 'Gérant': '', 'Boutique': '',
                'Total Ventes (GNF)': totalVentes, 'Paiements Numériques (GNF)': totalMobile,
                'Dettes Accordées (GNF)': totalDettes, 'Dépenses (GNF)': totalDepenses,
                'Solde Théorique (GNF)': totalTheo, 'Montant Reçu (GNF)': totalRecu,
                'Écart (GNF)': totalEcart, 'Statut': ''
            });
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const wscols = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
        worksheet['!cols'] = wscols;

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const lastRowIndex = range.e.r;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: lastRowIndex, c: col });
            if (worksheet[cellRef]) {
                worksheet[cellRef].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "2980B9" } },
                    alignment: { horizontal: "right" }
                };
            }
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, fileName);
    };

    const formatCurrency = (amount) => {
        return (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
    };

    const getStatusBadge = (statusId, statusStr) => {
        if (statusId === 3 || statusStr === 'VALIDE' || statusStr === 'APPROUVEE') return <Badge bg="success">Validé</Badge>;
        if (statusId === 4 || statusStr === 'REJETE' || statusStr === 'REFUSEE') return <Badge bg="danger">Refusé</Badge>;
        return <Badge bg="warning" text="dark">En attente</Badge>;
    };

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentRapports = rapports.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(rapports.length / itemsPerPage);

    const filteredHistory = useMemo(() => {
        if (!caisseAdmin?.historique) return [];
        return caisseAdmin.historique.filter(entry => {
            const entryDate = new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt);
            const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
            const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
            if (start) start.setHours(0, 0, 0, 0);
            if (end) end.setHours(23, 59, 59, 999);
            const dateMatch = (!start || entryDate >= start) && (!end || entryDate <= end);
            
            let gerantMatch = true;
            if (filterGerant) {
                const selectedManager = managers.find(m => m._id === filterGerant || m.userId === filterGerant);
                const gerantNomFiltre = selectedManager ? `${selectedManager.vcFirstName || ''} ${selectedManager.vcLastName || selectedManager.nom || ''}`.trim() : '';
                
                gerantMatch = (entry.gerantNom && gerantNomFiltre && entry.gerantNom.includes(gerantNomFiltre)) || 
                              (entry.gerant === filterGerant) || 
                              (entry.gerant === selectedManager?.nom);
            }
            return dateMatch && gerantMatch;
        });
    }, [caisseAdmin, dateFilter, filterGerant, managers]);

    const totalEncaissementsPeriode = useMemo(() => {
        return rapports
            .filter(r => r.cashReportStatusId === 3 || r.statut === 'VALIDE')
            .reduce((acc, r) => acc + safeNum(r.mClosingAmount || r.montantCloture), 0);
    }, [rapports]);

    const totalFintechPeriode = useMemo(() => {
        return rapports.reduce((acc, r) => acc + safeNum(r.mTotalMobileMoney || r.totalMobileMoney), 0);
    }, [rapports]);

    const totalEcartsPeriode = useMemo(() => {
        return rapports.reduce((acc, r) => acc + safeNum(r.mDifferenceAmount || r.ecart), 0);
    }, [rapports]);

    const totalTheorique = rapports.reduce((acc, r) => acc + safeNum(r.mTheoreticalBalance || r.soldeTheorique), 0);

    return (
        <div className="p-4">
            <style>{`
                .clickable-row { cursor: pointer; }
            `}</style>

            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">Finances & Caisse</h3>
                <div className="d-flex gap-2 align-items-center flex-wrap">
                    <Form.Select size="sm" value={filterGerant} onChange={e => setFilterGerant(e.target.value)} className="rounded-pill shadow-sm" style={{ minWidth: '150px' }}>
                        <option value="">Tous les gérants</option>
                        {managers.map(m => <option key={m._id || m.userId} value={m._id || m.userId}>{m.vcFirstName || m.nom} {m.vcLastName || ''}</option>)}
                    </Form.Select>
                    <div className="d-flex gap-2 align-items-center">
                        <Form.Control type="date" size="sm" value={dateFilter.startDate} onChange={e => setDateFilter({ ...dateFilter, startDate: e.target.value })} className="rounded-pill shadow-sm" title="Date début" />
                        <span className="text-muted">-</span>
                        <Form.Control type="date" size="sm" value={dateFilter.endDate} onChange={e => setDateFilter({ ...dateFilter, endDate: e.target.value })} className="rounded-pill shadow-sm" title="Date fin" />
                    </div>
                    <div className="d-flex gap-2">
                        <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill shadow-sm">
                            <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>Excel
                        </Button>
                        <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill shadow-sm">
                            <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>PDF
                        </Button>
                    </div>
                    <Button variant="outline-primary" onClick={fetchData} className="rounded-pill shadow-sm ms-2">
                        <iconify-icon icon="solar:refresh-bold" className="me-2 align-middle"></iconify-icon>Actualiser
                    </Button>
                </div>
            </div>

            {/* Cartes de résumé rapide */}
            <Row className="mb-4 g-3">
                <Col lg={3} sm={6}>
                    <Card className="border-0 shadow-sm bg-primary-subtle text-primary h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Total des Encaissements (Période)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(totalEncaissementsPeriode)}</h4>
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
                                    <h4 className="fw-bold mb-0">{formatCurrency(totalFintechPeriode)}</h4>
                                </div>
                                <iconify-icon icon="solar:phone-calling-bold-duotone" style={{ fontSize: '40px', opacity: 0.5, color: '#FF6600' }}></iconify-icon>
                            </div>
                            <Button variant="link" className="p-0 text-decoration-none text-start small fw-bold mt-2" style={{ color: '#FF6600' }} onClick={() => setKey('fintech')}>
                                <iconify-icon icon="solar:list-bold" className="me-1"></iconify-icon>Liste des transactions
                            </Button>
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
                    <Card className={`border-0 shadow-sm h-100 ${totalEcartsPeriode < 0 ? 'bg-danger-subtle text-danger' : totalEcartsPeriode > 0 ? 'bg-warning-subtle text-warning' : 'bg-light text-muted'}`}>
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Somme des Écarts (Période)</h6>
                                <h4 className="fw-bold mb-0">{totalEcartsPeriode > 0 ? '+' : ''}{formatCurrency(totalEcartsPeriode)}</h4>
                            </div>
                            <iconify-icon icon="solar:danger-triangle-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}
            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

            <Tabs id="admin-caisse-tabs" activeKey={key} onSelect={(k) => setKey(k)} className="mb-4 nav-tabs-custom">
                
                <Tab eventKey="rapports" title={<span><iconify-icon icon="solar:document-text-bold" className="me-2"></iconify-icon>Rapports de Caisse</span>}>
                    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                        <Card.Body className="p-0">
                            <Table hover responsive className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4 py-3">Date Clôture</th>
                                        <th className="py-3">Gérant / Boutique</th>
                                        <th className="py-3 text-end">Total Ventes</th>
                                        <th className="py-3 text-end">Recouvrements</th>
                                        <th className="py-3 text-end">Numérique</th>
                                        <th className="py-3 text-end">Dettes accordées</th>
                                        <th className="py-3 text-end">Dépenses</th>
                                        <th className="py-3 text-end">Solde Théorique</th>
                                        <th className="py-3 text-end">Montant Reçu</th>
                                        <th className="py-3 text-center">Écart</th>
                                        <th className="py-3 text-center">Statut</th>
                                        <th className="pe-4 py-3 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="12" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : currentRapports.length > 0 ? (
                                        currentRapports.map(r => {
                                            const statutVal = r.statut || (r.cashReportStatusId === 3 ? 'VALIDE' : r.cashReportStatusId === 4 ? 'REJETE' : 'EN_ATTENTE');
                                            return (
                                                <tr key={r.cashReportId || r._id} onClick={() => handleShowDetails(r)} className={`${statutVal === 'EN_ATTENTE' ? 'bg-warning-subtle' : 'clickable-row'}`}>
                                                    <td className="ps-4 text-nowrap">
                                                        {new Date(r.dtCreatedAt || r.createdAt).toLocaleDateString()}
                                                        <div className="small text-muted">{new Date(r.dtCreatedAt || r.createdAt).toLocaleTimeString()}</div>
                                                    </td>
                                                    <td>
                                                        <div className="fw-bold">{resolveGerantName(r)}</div>
                                                        <div className="small text-muted">{resolveBoutiqueName(r)}</div>
                                                    </td>
                                                    <td className="text-end text-success">{formatCurrency(r.mTotalSales || r.totalVentes)}</td>
                                                    <td className="text-end text-info">{formatCurrency(r.mTotalRecoveries || r.totalRecouvrement)}</td>
                                                    <td className="text-end fw-bold" style={{ color: '#FF6600' }}>{formatCurrency(r.mTotalMobileMoney || r.totalMobileMoney)}</td>
                                                    <td className="text-end text-warning">{formatCurrency(r.mTotalCredit || r.totalDettes)}</td>
                                                    <td className="text-end text-danger">{formatCurrency(r.mTotalApprovedExpenses || r.totalDepensesApprouvees)}</td>
                                                    <td className="text-end fw-bold">{formatCurrency(r.mTheoreticalBalance || r.soldeTheorique)}</td>
                                                    <td className="text-end fw-bold text-primary">{formatCurrency(r.mClosingAmount || r.montantCloture)}</td>
                                                    <td className="text-center">
                                                        {(r.mDifferenceAmount !== undefined ? r.mDifferenceAmount : r.ecart) !== 0 ? (
                                                            <Badge bg="danger">{formatCurrency(r.mDifferenceAmount || r.ecart)}</Badge>
                                                        ) : <Badge bg="success">OK</Badge>}
                                                    </td>
                                                    <td className="text-center">
                                                        {statutVal === 'REJETE' && (r.vcAdminComment || r.commentairesAdmin) ? (
                                                            <OverlayTrigger overlay={<Tooltip>Motif: {r.vcAdminComment || r.commentairesAdmin}</Tooltip>}>
                                                                {getStatusBadge(r.cashReportStatusId, r.statut)}
                                                            </OverlayTrigger>
                                                        ) : (
                                                            getStatusBadge(r.cashReportStatusId, r.statut)
                                                        )}
                                                    </td>
                                                    <td className="pe-4 text-end">
                                                        {statutVal === 'EN_ATTENTE' && (
                                                            <div className="d-flex justify-content-end gap-2">
                                                                <Button variant="success" size="sm" onClick={(e) => { e.stopPropagation(); handleValidateReportClick(r); }}>Valider</Button>
                                                                <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleRejectReportClick(r); }}>Rejeter</Button>
                                                            </div>
                                                        )}
                                                        {statutVal === 'VALIDE' && (
                                                            <span className="text-success small"><iconify-icon icon="solar:check-read-bold"></iconify-icon> Encaissé</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr><td colSpan="12" className="text-center py-5 text-muted">Aucun rapport trouvé.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                            {totalPages > 1 && (
                                <div className="d-flex justify-content-center p-3 border-top">
                                    <Pagination>
                                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                                        {[...Array(totalPages)].map((_, idx) => (
                                            <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>{idx + 1}</Pagination.Item>
                                        ))}
                                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                                    </Pagination>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Tab>

                <Tab eventKey="caisse-centrale" title={<span><iconify-icon icon="solar:safe-square-bold" className="me-2"></iconify-icon>Caisse Centrale</span>}>
                    <Row className="g-4">
                        <Col md={4}>
                            <Card className="border-0 shadow-sm rounded-4 bg-primary text-white h-100">
                                <Card.Body className="p-4 d-flex flex-column justify-content-center align-items-center text-center">
                                    <div className="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center mb-3" style={{ width: '60px', height: '60px' }}>
                                        <iconify-icon icon="solar:wallet-money-bold" style={{ fontSize: '32px' }}></iconify-icon>
                                    </div>
                                    <h5 className="opacity-75 mb-1">Solde Actuel Caisse Centrale</h5>
                                    <h2 className="fw-bold display-5 mb-0">
                                        {caisseAdmin ? formatCurrency(caisseAdmin.soldeActuel || caisseAdmin.mCurrentBalance) : <Spinner size="sm" />}
                                    </h2>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={8}>
                            <Card className="border-0 shadow-sm rounded-4 h-100">
                                <Card.Header className="bg-white py-3"><h5 className="fw-bold mb-0">Historique des encaissements</h5></Card.Header>
                                <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '400px' }}>
                                    <Table hover className="align-middle mb-0">
                                        <thead className="bg-light sticky-top">
                                            <tr><th className="ps-4">Date</th><th>Source</th><th className="text-end pe-4">Montant</th></tr>
                                        </thead>
                                        <tbody>
                                            {filteredHistory.length > 0 ? (
                                                [...filteredHistory].reverse().map((entry, idx) => (
                                                    <tr key={idx}>
                                                        <td className="ps-4">
                                                            {new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt).toLocaleDateString()}
                                                            <div className="small text-muted">Validé par {entry.admin || entry.userName || 'Admin'}</div>
                                                        </td>
                                                        <td>
                                                            <div className="fw-bold">{entry.description || `Rapport de: ${entry.boutiqueNom || 'Boutique inconnue'}`}</div>
                                                            <div className="small text-muted">Gérant: {entry.gerantNom || 'Gérant inconnu'}</div>
                                                        </td>
                                                        <td className="text-end pe-4 fw-bold text-success">+ {formatCurrency(entry.montant || entry.mAmount)}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan="3" className="text-center py-4 text-muted">Aucun historique disponible.</td></tr>
                                            )}
                                        </tbody>
                                    </Table>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </Tab>

                <Tab eventKey="fintech" title={<span><iconify-icon icon="solar:phone-calling-bold" className="me-2"></iconify-icon>Transactions Fintech</span>}>
                    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                        <Card.Header className="bg-white py-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                            <h5 className="mb-0 fw-bold" style={{ color: '#FF6600' }}>Historique Global des Flux Numériques</h5>
                            <div className="d-flex gap-2">
                                <Form.Control type="text" placeholder="Rechercher par Réf. Transaction..." value={fintechSearchTerm} onChange={(e) => setFintechSearchTerm(e.target.value)} className="rounded-pill shadow-sm" style={{ maxWidth: '200px' }} />
                                <Button variant="outline-success" size="sm" onClick={handleExportFintechExcel} disabled={fintechSales.length === 0 || fintechLoading}>
                                    <iconify-icon icon="solar:file-spreadsheet-bold" className="me-1 align-middle"></iconify-icon> Export Excel
                                </Button>
                                <Button variant="outline-danger" size="sm" onClick={handleExportFintechPDF} disabled={fintechSales.length === 0 || fintechLoading}>
                                    <iconify-icon icon="solar:file-pdf-bold" className="me-1 align-middle"></iconify-icon> Export PDF
                                </Button>
                            </div>
                        </Card.Header>
                        <Card.Body className="p-0">
                            {fintechLoading ? (
                                <div className="text-center py-5"><Spinner animation="border" style={{ color: '#FF6600' }} /></div>
                            ) : fintechSales.length > 0 ? (
                                <Table striped hover responsive className="align-middle mb-0">
                                    <thead className="bg-light">
                                        <tr><th className="ps-4 py-3">Date & Heure</th><th>Boutique</th><th>Gérant</th><th>Mode</th><th>Réf. Transaction</th><th className="text-end pe-4">Montant</th></tr>
                                    </thead>
                                    <tbody>
                                        {fintechSales.map(v => (
                                            <tr key={v._id || v.saleId}>
                                                <td className="ps-4">
                                                    <div className="fw-bold">{new Date(v.createdAt).toLocaleDateString()}</div>
                                                    <div className="small text-muted">{new Date(v.createdAt).toLocaleTimeString()}</div>
                                                </td>
                                                <td>{resolveBoutiqueName(v.boutique)}</td>
                                                <td>{resolveGerantName(v.gerant)}</td>
                                                <td>
                                                    {v.modePaiement === 'Orange Money' && <Badge style={{ backgroundColor: '#FF6600', color: 'white' }} className="border-0 fw-normal">OM</Badge>}
                                                    {v.modePaiement === 'MobiCash' && <Badge style={{ backgroundColor: '#FFCC00', color: 'black' }} className="border-0 fw-normal">Mobi</Badge>}
                                                    {v.modePaiement === 'PayCard' && <Badge bg="info" className="border-0 fw-normal">Card</Badge>}
                                                    {v.modePaiement === 'Virement' && <Badge bg="secondary" className="border-0 fw-normal">Bank</Badge>}
                                                </td>
                                                <td className="small text-muted font-monospace">{v.transactionRef || '-'}</td>
                                                <td className="text-end pe-4 fw-bold">{formatCurrency(v.prixTotal || v.mNetAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="table-light">
                                        <tr>
                                            <td colSpan="5" className="fw-bold text-end py-3">TOTAL PÉRIODE :</td>
                                            <td className="text-end pe-4 fw-bold fs-5" style={{ color: '#FF6600' }}>
                                                {formatCurrency(fintechSales.reduce((acc, v) => acc + safeNum(v.prixTotal || v.mNetAmount), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </Table>
                            ) : <Alert variant="info" className="m-4">Aucune transaction Fintech trouvée pour cette période.</Alert>}
                        </Card.Body>
                    </Card>
                </Tab>
            </Tabs>

            <Modal show={showValidateReportModal} onHide={() => setShowValidateReportModal(false)} centered animation={false}>
                <Modal.Header closeButton><Modal.Title>Valider le Rapport de Caisse</Modal.Title></Modal.Header>
                <Form onSubmit={confirmValidateReport}>
                    <Modal.Body>
                        <Alert variant="info">
                            En validant ce rapport, le montant théorique de <strong>{selectedReport && formatCurrency(selectedReport.mTheoreticalBalance || selectedReport.soldeTheorique)}</strong> sera ajouté à la Caisse Centrale.
                        </Alert>
                        {selectedReport && (selectedReport.mDifferenceAmount !== undefined ? selectedReport.mDifferenceAmount : selectedReport.ecart) !== 0 && (
                            <Alert variant="danger" className="border-3 border-danger shadow-sm">
                                <div className="d-flex align-items-center mb-2">
                                    <iconify-icon icon="solar:danger-triangle-bold" style={{ fontSize: '24px' }} className="me-2"></iconify-icon>
                                    <strong className="fs-5">ALERTE ÉCART : {formatCurrency(selectedReport.mDifferenceAmount || selectedReport.ecart)}</strong>
                                </div>
                                <div className="p-2 bg-white rounded border small text-dark">
                                    <strong>Justification du gérant :</strong><br />
                                    {selectedReport.vcManagerComment || selectedReport.commentairesGérant || "Aucune explication fournie."}
                                </div>
                            </Alert>
                        )}
                        <Form.Group>
                            <Form.Label>Commentaire Admin (Optionnel)</Form.Label>
                            <Form.Control as="textarea" rows={3} value={adminComment} onChange={(e) => setAdminComment(e.target.value)} placeholder="Observation sur l'écart ou la validation..." />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowValidateReportModal(false)}>Annuler</Button>
                        <Button variant="success" type="submit" disabled={isValidating}>{isValidating ? 'Validation...' : 'Valider et Encaisser'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="xl" centered animation={false}>
                <Modal.Header closeButton><Modal.Title><iconify-icon icon="solar:document-text-bold-duotone" className="me-2"></iconify-icon>Détails du Rapport</Modal.Title></Modal.Header>
                <Modal.Body>
                    {detailsLoading ? (
                        <div className="text-center py-5"><Spinner animation="border" /></div>
                    ) : reportDetails && reportDetails.rapport ? (
                        <>
                            <Row className="mb-4 g-3">
                                <Col md={6}>
                                    <Card className="h-100"><Card.Body><Card.Title as="h6" className="text-muted">Gérant / Boutique</Card.Title><Card.Text className="fw-bold fs-5">{resolveGerantName(reportDetails.rapport)} / {resolveBoutiqueName(reportDetails.rapport)}</Card.Text></Card.Body></Card>
                                </Col>
                                <Col md={6}>
                                    <Card className="h-100"><Card.Body><Card.Title as="h6" className="text-muted">Date du Rapport</Card.Title><Card.Text className="fw-bold fs-5">{new Date(reportDetails.rapport.dtCreatedAt || reportDetails.rapport.createdAt).toLocaleString('fr-FR')}</Card.Text></Card.Body></Card>
                                </Col>
                                <Col xs={6} md={4} lg><Card bg="light" className="h-100 shadow-sm border-0"><Card.Body className="p-3"><Card.Title as="h6" className="x-small text-muted text-uppercase mb-2">Ventes (CA)</Card.Title><Card.Text className="fw-bold mb-0">{formatCurrency(reportDetails.rapport.mTotalSales || reportDetails.rapport.totalVentes)}</Card.Text></Card.Body></Card></Col>
                                <Col xs={6} md={4} lg onClick={() => setFilterSalesMode(filterSalesMode === 'digital' ? null : 'digital')} style={{ cursor: 'pointer' }}><Card className="h-100 shadow-sm border-0 border-start border-4" style={{ backgroundColor: '#FFF5EB', borderColor: '#FF6600' }}><Card.Body className="p-3"><Card.Title as="h6" className="x-small text-uppercase mb-2" style={{ color: '#FF6600' }}>Fintech (OM/Mobi)</Card.Title><Card.Text className="fw-bold mb-0" style={{ color: '#FF6600' }}>{formatCurrency(reportDetails.rapport.mTotalMobileMoney || reportDetails.rapport.totalMobileMoney)}</Card.Text></Card.Body></Card></Col>
                                <Col xs={6} md={4} lg><Card bg="warning-subtle" className="h-100 shadow-sm border-0"><Card.Body className="p-3"><Card.Title as="h6" className="x-small text-warning-emphasis text-uppercase mb-2">Dettes</Card.Title><Card.Text className="fw-bold text-warning-emphasis mb-0">{formatCurrency(reportDetails.rapport.mTotalCredit || reportDetails.rapport.totalDettes)}</Card.Text></Card.Body></Card></Col>
                                <Col xs={6} md={6} lg><Card bg="primary-subtle" className="h-100 shadow-sm border-0"><Card.Body className="p-3"><Card.Title as="h6" className="x-small text-primary-emphasis text-uppercase mb-2">Espèces Attendu</Card.Title><Card.Text className="fw-bold text-primary mb-0">{formatCurrency(reportDetails.rapport.mTheoreticalBalance || reportDetails.rapport.soldeTheorique)}</Card.Text></Card.Body></Card></Col>
                                <Col xs={12} md={6} lg><Card bg="success-subtle" className="h-100 shadow-sm border-0"><Card.Body className="p-3"><Card.Title as="h6" className="x-small text-success-emphasis text-uppercase mb-2">Montant Reçu</Card.Title><Card.Text className="fw-bold text-success mb-0">{formatCurrency(reportDetails.rapport.mClosingAmount || reportDetails.rapport.montantCloture)}</Card.Text></Card.Body></Card></Col>
                            </Row>

                            <Tabs defaultActiveKey="ventes" id="report-details-tabs" className="nav-tabs-custom" onSelect={() => setFilterSalesMode(null)}>
                                <Tab eventKey="ventes" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:cart-large-2-bold" className="me-2"></iconify-icon>Ventes ({(reportDetails.ventes || []).length})</span>}>
                                    <Table striped hover size="sm" className="mt-3">
                                        <thead><tr><th>Heure</th><th>Article</th><th>Mode</th><th className="text-center">Qté</th><th className="text-end">Total</th></tr></thead>
                                        <tbody>
                                            {(reportDetails.ventes || [])
                                                .filter(vente => filterSalesMode === 'digital' ? ['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(vente.modePaiement || vente.vcPaymentMethod) : true)
                                                .map(vente => (
                                                    <tr key={vente._id || vente.saleId}>
                                                        <td>{new Date(vente.dtSoldAt || vente.createdAt).toLocaleTimeString('fr-FR')}</td>
                                                        <td>{vente.article?.nom || vente.vcProductName || vente.articleNom || 'Article supprimé'}</td>
                                                        <td>
                                                            {(() => {
                                                                const mode = vente.modePaiement || vente.vcPaymentMethod || 'Cash';
                                                                if (mode === 'Orange Money') return <Badge style={{ backgroundColor: '#FF6600', color: 'white', fontSize: '0.75rem' }} className="border-0 fw-normal"><iconify-icon icon="simple-icons:orange" className="me-1 align-middle"></iconify-icon>OM</Badge>;
                                                                if (mode === 'MobiCash') return <Badge style={{ backgroundColor: '#FFCC00', color: 'black', fontSize: '0.75rem' }} className="border-0 fw-normal"><iconify-icon icon="solar:phone-calling-bold" className="me-1 align-middle"></iconify-icon>Mobi</Badge>;
                                                                if (mode === 'PayCard') return <Badge bg="info" style={{ fontSize: '0.75rem' }} className="border-0 fw-normal"><iconify-icon icon="solar:card-bold" className="me-1 align-middle"></iconify-icon>Card</Badge>;
                                                                let bg = 'light'; let text = 'dark';
                                                                if (mode === 'Cash') { bg = 'success-subtle'; text = 'success'; }
                                                                else if (mode === 'Dette') { bg = 'warning-subtle'; text = 'warning-emphasis'; }
                                                                return <Badge bg={bg} text={text} style={{ fontSize: '0.75rem' }} className="border-0 fw-normal">{mode}</Badge>;
                                                            })()}
                                                        </td>
                                                        <td className="text-center">{vente.quantite || vente.dcQuantity}</td>
                                                        <td className="text-end fw-bold">{formatCurrency(vente.prixTotal || vente.mLineAmount)}</td>
                                                    </tr>
                                                ))}
                                            {(reportDetails.ventes || []).length === 0 && <tr><td colSpan="5" className="text-center text-muted py-3">Aucune vente pour cette session.</td></tr>}
                                        </tbody>
                                    </Table>
                                </Tab>
                                <Tab eventKey="depenses" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:wallet-minus-bold" className="me-2"></iconify-icon>Dépenses ({(reportDetails.depenses || []).length})</span>}>
                                    <Table striped hover size="sm" className="mt-3">
                                        <thead><tr><th>Heure</th><th>Motif</th><th className="text-end">Montant</th></tr></thead>
                                        <tbody>
                                            {(reportDetails.depenses || []).map(depense => (
                                                <tr key={depense._id || depense.expenseId}>
                                                    <td>{new Date(depense.dtCreatedAt || depense.createdAt).toLocaleTimeString('fr-FR')}</td>
                                                    <td>{depense.motif || depense.vcReason}</td>
                                                    <td className="text-end fw-bold text-danger">{formatCurrency(depense.montant || depense.mAmount)}</td>
                                                </tr>
                                            ))}
                                            {(reportDetails.depenses || []).length === 0 && <tr><td colSpan="3" className="text-center text-muted py-3">Aucune dépense pour cette session.</td></tr>}
                                        </tbody>
                                    </Table>
                                </Tab>
                            </Tabs>
                        </>
                    ) : <Alert variant="info">Aucun détail à afficher.</Alert>}
                </Modal.Body>
                <Modal.Footer className="d-flex justify-content-between">
                    <Button variant="outline-danger" onClick={handleExportReportDetailsPDF} disabled={detailsLoading || !reportDetails || !reportDetails.rapport}>
                        <iconify-icon icon="solar:file-pdf-bold" className="me-2 align-middle"></iconify-icon>Exporter PDF
                    </Button>
                    <Button variant="secondary" onClick={handleCloseDetailsModal}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showRejectReportModal} onHide={() => setShowRejectReportModal(false)} centered animation={false}>
                <Modal.Header closeButton><Modal.Title className="text-danger">Rejeter le Rapport</Modal.Title></Modal.Header>
                <Form onSubmit={confirmRejectReport}>
                    <Modal.Body>
                        <p>Vous êtes sur le point de rejeter le rapport de <strong>{selectedReport && resolveGerantName(selectedReport)}</strong>.</p>
                        {selectedReport && (selectedReport.mDifferenceAmount !== undefined ? selectedReport.mDifferenceAmount : selectedReport.ecart) !== 0 && (
                            <Alert variant="warning">
                                <strong>Rappel :</strong> Il y a un écart de {formatCurrency(selectedReport.mDifferenceAmount || selectedReport.ecart)} dans ce rapport.
                            </Alert>
                        )}
                        <Form.Group>
                            <Form.Label>Motif du rejet (Obligatoire)</Form.Label>
                            <Form.Control as="textarea" rows={3} value={adminComment} onChange={(e) => setAdminComment(e.target.value)} required placeholder="Expliquez pourquoi le rapport est rejeté..." />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowRejectReportModal(false)}>Annuler</Button>
                        <Button variant="danger" type="submit" disabled={isValidating}>{isValidating ? 'Rejet...' : 'Confirmer le Rejet'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminCaisseView;