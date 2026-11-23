/**
 * @file caisseExportUtils.js
 * @description Toutes les fonctions d'export PDF et Excel pour le module Caisse.
 * Fonctions pures, sans dépendance React, réutilisables partout.
 */

import jsPDF from 'jspdf';
import XLSX from 'xlsx-js-style';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';
import { safeNum, formatCurrency } from './formatUtils';

const formatCurrencyPdf = (amount) =>
  (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');

export const exportFintechPDF = (
  fintechSales,
  dateFilter,
  filterGerant,
  managers,
  resolveBoutiqueName,
  resolveGerantName
) => {
  const doc = new jsPDF('portrait');

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

export const exportFintechExcel = (
  fintechSales,
  dateFilter,
  filterGerant,
  managers,
  resolveBoutiqueName,
  resolveGerantName
) => {
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

export const exportCaissePDF = (
  rapports,
  caisseAdmin,
  dateFilter,
  filterGerant,
  key,
  managers,
  formatCurrency,
  resolveBoutiqueName,
  resolveGerantName
) => {
  const doc = new jsPDF('portrait');
  let startY = 30;

  doc.addImage(logo, 'PNG', 14, 8, 40, 15);

  if (key === 'caisse-centrale' && caisseAdmin) {
    doc.setFontSize(22).setTextColor(41, 128, 185).setFont("helvetica", "bold");
    doc.text("RAPPORT FINANCIER DE CAISSE", 60, 18);

    doc.setFontSize(11).setTextColor(100);
    doc.text(`Période du ${dateFilter.startDate || 'début'} au ${dateFilter.endDate || 'fin'}`, 14, startY);
    startY += 8;

    if (filterGerant) {
      const selectedManager = managers.find(m => m._id === filterGerant);
      doc.text(`Gérant: ${selectedManager?.nom || selectedManager?.vcFirstName || 'N/A'}`, 14, startY);
      startY += 8;
    }

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
        formatCurrency(safeNum(entry.montant || entry.mAmount))
      ]);
    });

    const totalEncaissements = sortedHistory.reduce((acc, entry) => acc + safeNum(entry.montant || entry.mAmount), 0);
    tableRows.push(['', '', 'TOTAL GÉNÉRAL', formatCurrency(totalEncaissements)]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: startY,
      theme: 'grid',
      styles: { halign: 'center', valign: 'middle', fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 11, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 70 }, 2: { cellWidth: 70 }, 3: { cellWidth: 60, halign: 'right' } },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    doc.setFontSize(12).setTextColor(0);
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 100;
    doc.text(`Solde Actuel Caisse Centrale: ${formatCurrency(caisseAdmin.soldeActuel || caisseAdmin.mCurrentBalance)}`, 14, finalY + 10);
  } else {
    doc.setFontSize(22).setTextColor(41, 128, 185).setFont("helvetica", "bold");
    doc.text("RAPPORT FINANCIER DE CAISSE", 60, 18);

    doc.setFontSize(11).setTextColor(100);
    doc.text(`Période du ${dateFilter.startDate || 'début'} au ${dateFilter.endDate || 'fin'}`, 14, startY);
    startY += 8;

    if (filterGerant) {
      const selectedManager = managers.find(m => m._id === filterGerant);
      doc.text(`Gérant: ${selectedManager?.nom || selectedManager?.vcFirstName || 'N/A'}`, 14, startY);
      startY += 8;
    }

    const tableColumn = ["Date", "Gérant", "Boutique", "Ventes", "Numérique", "Dettes", "Dépenses", "Théorique", "Montant Reçu", "Écart"];
    const tableRows = [];
    rapports.forEach(report => {
      tableRows.push([
        new Date(report.dtCreatedAt || report.createdAt).toLocaleDateString('fr-FR'),
        resolveGerantName(report.gerant || report.userName || report),
        resolveBoutiqueName(report.boutique || report.storeName || report),
        formatCurrency(safeNum(report.mTotalSales || report.totalVentes)),
        formatCurrency(safeNum(report.mTotalMobileMoney || report.totalMobileMoney)),
        formatCurrency(safeNum(report.mTotalCredit || report.totalDettes)),
        formatCurrency(safeNum(report.mTotalApprovedExpenses || report.totalDepensesApprouvees)),
        formatCurrency(safeNum(report.mTheoreticalBalance || report.soldeTheorique)),
        formatCurrency(safeNum(report.mClosingAmount || report.montantCloture)),
        formatCurrency(safeNum(report.mDifferenceAmount || report.ecart))
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
      { content: formatCurrency(totalVentes), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalMobile), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalDettes), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalDepenses), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalTheo), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalRecu), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: formatCurrency(totalEcart), styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: totalEcart < 0 ? [200, 0, 0] : [0, 150, 0] } }
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: startY,
      theme: 'grid',
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




export const exportCaisseExcel = (
  rapports,
  caisseAdmin,
  dateFilter,
  filterGerant,
  key,
  managers,
  formatCurrency,
  resolveBoutiqueName,
  resolveGerantName,
  stats
) => {
  let dataToExport = [];
  let fileName = "";
  let sheetName = "";

  if (key === 'caisse-centrale' && caisseAdmin) {
    fileName = `export_caisse_centrale_${new Date().toISOString().split('T')[0]}.xlsx`;
    sheetName = "Caisse Centrale";
    const sortedHistory = [...(caisseAdmin.historique || [])].reverse();

    dataToExport = sortedHistory.map(entry => ({
      'Date': new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt).toLocaleDateString('fr-FR'),
      'Source': entry.boutiqueNom || 'Boutique inconnue',
      'Gérant': entry.gerantNom || 'Gérant inconnu',
      'Montant (GNF)': safeNum(entry.montant || entry.mAmount)
    }));

    dataToExport.push({
      'Date': 'TOTAL GÉNÉRAL', 'Source': '', 'Gérant': '', 'Montant (GNF)': stats.totalEncaissements
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
}

export const exportReportDetailsPDF = (
  reportDetails,
  formatCurrency,
  resolveGerantName,
  resolveBoutiqueName
) => {
  if (!reportDetails || !reportDetails.rapport) return;

  const doc = new jsPDF('portrait');
  const formatCurrencyPdf = (amount) =>
    (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[ \u202f]/g, ' ');
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
