/**
 * @file pdfUtils.js
 * @description Composant React.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';
import { safeNum } from './formatUtils'; // Import safeNum

// Helper pour nettoyer le formatage des nombres pour le PDF
const formatPrice = (price) => {
    return safeNum(price).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
};

/**
 * Génère un ticket de caisse au format PDF (type ticket thermique).
 * @param {Object} ticketData - Données de la vente pour le ticket.
 */
export const generateReceiptPDF = (ticketData) => {
    if (!ticketData) return;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 150 + (ticketData.items.length * 8)] // Hauteur dynamique
    });

    const {
        shopName = 'BOUTIQUE',
        address = '',
        phone = '',
        transactionId = 'N/A',
        date = new Date(),
        clientName = 'Client de passage',
        modePaiement = 'Cash',
        cashierName = 'N/A',
        serverName = 'N/A',
        items = [],
        subTotal = 0,
        itemLevelDiscount = 0,
        totalNet = 0,
        amountPaid = 0,
        pourboire = 0,
        echeanceDette = null,
    } = ticketData;

    // --- En-tête ---
    try {
        doc.addImage(logo, 'PNG', 25, 5, 30, 10);
    } catch (e) {
        doc.setFontSize(14);
        doc.text(shopName || 'BOUTIQUE', 40, 10, { align: 'center' });
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(address || '', 40, 20, { align: 'center' });
    if (phone) doc.text(`Tel: ${phone}`, 40, 24, { align: 'center' });
    doc.text("------------------------------------------------", 40, 30, { align: 'center' });

    // --- Infos Transaction ---
    let currentY = 35;
    doc.text(`Ticket: ${transactionId}`, 5, currentY);
    currentY += 4;
    doc.text(`Date: ${new Date(date).toLocaleString('fr-FR')}`, 5, currentY);
    currentY += 4;
    doc.text(`Client: ${clientName}`, 5, currentY);
    currentY += 4;
    // N'afficher "Serveur" que s'il y en a un (pas "N/A")
    if (serverName && serverName !== 'N/A') {
        doc.text(`Serveur: ${serverName}`, 5, currentY);
        currentY += 4;
    }
    // Caissier sur sa ligne
    doc.text(`Caissier: ${cashierName}`, 5, currentY);
    currentY += 4;
    // Mode en bas
    doc.text(`Mode: ${modePaiement}`, 5, currentY);
    currentY += 4;

    // --- Tableau Articles ---
    const tableRows = items.map(item => [
        item.article.nom.substring(0, 20),
        item.quantite,
        formatPrice(item.prixUnitaire),
        formatPrice(item.prixTotal)
    ]);

    autoTable(doc, {
        head: [["Article", "Qté", "P.U.", "Total"]],
        body: tableRows,
        startY: currentY,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        },
        margin: { left: 2, right: 2 }
    });

    let finalY = doc.lastAutoTable.finalY + 5;

    // --- Totaux ---
    doc.setFontSize(8);
    doc.text('Sous-total:', 5, finalY);
    doc.text(`${formatPrice(subTotal)} GNF`, 75, finalY, { align: 'right' });
    finalY += 4;

    if (itemLevelDiscount > 0) {
        doc.text('Remise (articles):', 5, finalY);
        doc.text(`- ${formatPrice(itemLevelDiscount)} GNF`, 75, finalY, { align: 'right' });
        finalY += 4;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text('TOTAL ARTICLES:', 5, finalY);
    doc.text(`${formatPrice(totalNet)} GNF`, 75, finalY, { align: 'right' });
    finalY += 6;

    if (pourboire > 0) {
        doc.setFont("helvetica", "normal");
        doc.text('Service (Pourboire):', 5, finalY);
        doc.text(`+ ${formatPrice(pourboire)} GNF`, 75, finalY, { align: 'right' });
        finalY += 6;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text('TOTAL À PAYER:', 5, finalY);
        doc.text(`${formatPrice(totalNet + pourboire)} GNF`, 75, finalY, { align: 'right' });
        finalY += 7;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text('Montant versé:', 5, finalY);
    doc.text(`${formatPrice(amountPaid)} GNF`, 75, finalY, { align: 'right' });
    finalY += 5;

    const balance = amountPaid - (totalNet + pourboire);

    if (balance >= 0) {
        // Cas normal : Monnaie à rendre
        doc.text('Monnaie rendue:', 5, finalY);
        doc.text(`${formatPrice(balance)} GNF`, 75, finalY, { align: 'right' });
    } else {
        // Cas dette : Reste à payer
        doc.setFont("helvetica", "bold");
        doc.text('RESTE A PAYER:', 5, finalY);
        doc.text(`${formatPrice(Math.abs(balance))} GNF`, 75, finalY, { align: 'right' });

        if (echeanceDette) {
            finalY += 5;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.text(`Echeance le : ${new Date(echeanceDette).toLocaleDateString('fr-FR')}`, 40, finalY, { align: 'center' });
        }
    }

    // --- Pied de page ---
    doc.text("------------------------------------------------", 40, finalY + 10, { align: 'center' });
    doc.setFont("helvetica", "bold");
    doc.text("Merci de votre visite !", 40, finalY + 15, { align: 'center' });

    doc.save(`ticket_${transactionId}.pdf`);
};

export const generateMovementsSummary = (movements) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const title = 'Résumé des mouvements de stock';
    const now = new Date();

    if (!Array.isArray(movements) || movements.length === 0) {
        doc.setFontSize(12);
        doc.text(title, 14, 20);
        doc.setFontSize(10);
        doc.text('Aucun mouvement à exporter.', 14, 30);
        doc.save(`mouvements_stock_${now.toISOString().split('T')[0]}.pdf`);
        return;
    }

    const rows = movements.map((mvt) => {
        const date = mvt.createdAt ? new Date(mvt.createdAt).toLocaleString('fr-FR') : '';
        const type = mvt.type || '';
        const origine = mvt.fournisseur?.nom || mvt.boutiqueSource?.nom || '';
        const destination = mvt.boutiqueDestination?.nom || (mvt.type === 'Vente' ? 'Client' : '');
        const articles = Array.isArray(mvt.articles)
            ? mvt.articles.map(article => {
                const name = article.nomArticle || article.article?.nom || article.nom || '';
                const qty = article.quantite != null ? ` x${article.quantite}` : '';
                const price = article.prixAchatUnitaire != null ? ` @${formatPrice(article.prixAchatUnitaire)}` : '';
                return `${name}${qty}${price}`;
            }).join('\n')
            : '';
        const operateur = mvt.operateur?.nom || mvt.operateur || 'Système';
        const transporteur = mvt.nomTransporteur || '-';
        const rawDetails = mvt.details || '';
        const details = typeof rawDetails === 'string' ? rawDetails : JSON.stringify(rawDetails, null, 0);
        const statut = mvt.isCancelled ? 'Annulé' : 'Validé';

        return [date, type, origine, destination, articles, operateur, transporteur, details, statut];
    });

    doc.setFontSize(14);
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.text(`Généré le ${now.toLocaleString('fr-FR')}`, 14, 22);

    autoTable(doc, {
        head: [[
            'Date',
            'Type',
            'Origine',
            'Destination',
            'Articles',
            'Opérateur',
            'Transporteur',
            'Détails',
            'Statut'
        ]],
        body: rows,
        startY: 26,
        theme: 'striped',
        tableWidth: 'auto',
        styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak',
            cellWidth: 'wrap',
            valign: 'top'
        },
        headStyles: {
            fillColor: [40, 116, 166],
            textColor: 255,
            fontStyle: 'bold',
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 22 },
            2: { cellWidth: 25 },
            3: { cellWidth: 25 },
            4: { cellWidth: 60 },
            5: { cellWidth: 22 },
            6: { cellWidth: 22 },
            7: { cellWidth: 85 },
            8: { cellWidth: 18 }
        },
        margin: { left: 14, right: 14 },
        pageBreak: 'auto',
        bodyStyles: { minCellHeight: 10 }
    });

    doc.save(`mouvements_stock_${now.toISOString().split('T')[0]}.pdf`);
};