/**
 * exportCSV.js - Utilitaire d'export CSV pour les historiques de ventes
 */

export const exportSalesCSV = (data, filename = null) => {
    if (!data || data.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const finalFilename = filename || `historique_ventes_${dateStr}.csv`;
    const BOM = '\uFEFF'; // BOM pour Excel UTF-8

    // En-têtes
    const headers = [
        'Date', 'Heure', 'Table', 'Client', 'Articles', 'Quantité Totale',
        'Montant Total (GNF)', 'Mode Paiement', 'Statut', 'Serveur/Gérant', 'Annulé'
    ];

    const rows = data.map(group => {
        const date = new Date(group.createdAt).toLocaleDateString('fr-FR');
        const time = new Date(group.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const table = group.numeroTable || 'À emporter';
        const client = group.client?.nom || 'Client de passage';
        const articles = (group.items || []).map(i => `${i.article?.nom || 'N/A'} x${i.quantite}`).join('; ');
        const totalQty = (group.items || []).reduce((sum, i) => sum + (i.quantite || 1), 0);
        const total = group.totalGroupPrice || 0;
        const mode = group.items?.[0]?.modePaiement || 'N/A';
        const statut = group.isCancelled ? 'Annulé' :
            group.statut === 'finalisee' ? 'Payé' :
            group.statut === 'en_preparation' ? 'Prêt' : 'En attente';
        const serveur = group.gerant?.nom || 'N/A';
        const cancelled = group.isCancelled ? 'Oui' : 'Non';

        return [
            date, time, table, client, articles, totalQty,
            total, mode, statut, serveur, cancelled
        ];
    });

    // Génération CSV
    const csvContent = [headers.join(','), ...rows.map(r =>
        r.map(cell => {
            const str = String(cell);
            return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        }).join(',')
    )].join('\n');

    // Téléchargement
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const exportSalesPDF = async (data, filename = null) => {
    if (!data || data.length === 0) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const finalFilename = filename || `historique_ventes_${dateStr}.pdf`;

    // Utiliser jsPDF via une compatibilité navigateur
    try {
        const { default: jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const doc = new jsPDF('landscape', 'mm', 'a4');

        // En-tête
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, 297, 22, 'F');
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text('Historique des Ventes', 14, 14);
        doc.setFontSize(9);
        doc.setTextColor(220, 220, 220);
        doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR'), 14, 20);

        const body = data.map(group => {
            const date = new Date(group.createdAt).toLocaleDateString('fr-FR');
            const time = new Date(group.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const table = group.numeroTable || 'Emporter';
            const articles = (group.items || []).map(i => `${i.article?.nom || '?'} x${i.quantite}`).join(', ');
            const total = (group.totalGroupPrice || 0).toLocaleString('fr-FR').replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ') + ' GNF';
            const mode = group.items?.[0]?.modePaiement || 'N/A';
            const statut = group.isCancelled ? 'Annulé' :
                group.statut === 'finalisee' ? 'Payé' :
                group.statut === 'en_preparation' ? 'Prêt' : 'Attente';
            const serveur = group.gerant?.nom || 'N/A';

            return [date, time, table, articles, total, mode, statut, serveur];
        });

        autoTable(doc, {
            startY: 28,
            head: [['Date', 'Heure', 'Table', 'Articles', 'Montant', 'Paiement', 'Statut', 'Serveur']],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 16 },
                2: { cellWidth: 20 },
                3: { cellWidth: 75 },
                4: { cellWidth: 35, halign: 'right' },
                5: { cellWidth: 25 },
                6: { cellWidth: 18 },
                7: { cellWidth: 25 },
            },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { left: 14, right: 14 }
        });

        // Pied de page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text('StockDash Gestion', 14, doc.internal.pageSize.height - 8);
            doc.text('Page ' + i + ' / ' + pageCount, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 8, { align: 'right' });
        }

        doc.save(finalFilename);
    } catch (err) {
        console.error('Erreur export PDF:', err);
    }
};