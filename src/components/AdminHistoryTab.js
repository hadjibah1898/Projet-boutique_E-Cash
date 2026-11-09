/**
 * @file AdminHistoryTab.js
 * @description Ce composant est un composant de présentation (.
 * Il est responsable de l'affichage de l'historique complet des ventes pour un utilisateur "Admin".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation, la génération de ticket) via ses props depuis le composant parent `VentesView`.
 * Il inclut également la pagination pour naviguer à travers l'historique.
 */
import React, { useState } from 'react';
import { Card, Table, Badge, Button, Pagination, Form } from 'react-bootstrap';
import { generateReceiptPDF, generateMovementsSummary } from '../utils/pdfUtils';

const AdminHistoryTab = ({
    historique,
    totalPages,
    currentPage,
    setCurrentPage,
    isCancellationAllowed,
    handleImageClick,
    setSaleToCancel,
    setShowCancelModal
}) => {

    const handleReprint = (group) => {
        const subTotal = group.items.reduce((acc, item) => acc + ((item.article?.prixVente || (item.prixTotal / item.quantite)) * item.quantite), 0);
        const netGoods = group.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : item.prixTotal), 0);
        const totalPourboire = group.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : (item.pourboire || 0)), 0);
        
        const ticketData = {
            shopName: group.boutique?.nom || "Boutique",
            address: group.boutique?.adresse || "",
            phone: group.boutique?.telephone || "",
            transactionId: `GRP-${group.orderGroupId.toString().slice(-6).toUpperCase()}`,
            cashierName: group.gerant?.nom || "Admin",
            clientName: group.client?.nom || 'Client de passage',
            date: group.createdAt,
            items: group.items.map(item => ({
                article: item.article,
                quantite: item.quantite,
                prixUnitaire: item.prixTotal / item.quantite,
                prixTotal: item.prixTotal
            })),
            subTotal: subTotal,
            itemLevelDiscount: subTotal - netGoods,
            pourboire: totalPourboire,
            totalNet: netGoods + totalPourboire,
            amountPaid: netGoods + totalPourboire,
            change: 0 // Assurez-vous que le change est calculé correctement si nécessaire
        };
        generateReceiptPDF(ticketData);
    };

    const [selectedIds, setSelectedIds] = useState([]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(historique.map(g => g.orderGroupId));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handlePrintSelected = () => {
        const selectedGroups = historique.filter(g => selectedIds.includes(g.orderGroupId));
        // On transforme les ventes en format "Mouvement" pour réutiliser l'utilitaire puissant
        const movementsFormat = [];
        selectedGroups.forEach(group => {
            group.items.forEach(item => {
                movementsFormat.push({
                    ...item,
                    type: 'Vente',
                    articles: [{ 
                        nomArticle: item.article?.nom, 
                        quantite: item.quantite, 
                        prixAchatUnitaire: item.article?.prixAchat 
                    }],
                    operateur: item.gerant
                });
            });
        });
        generateMovementsSummary(movementsFormat);
    };

    return (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold">Historique des Mouvements (Ventes)</h5>
                {selectedIds.length > 0 && (
                    <Button variant="primary" size="sm" className="rounded-pill px-4 shadow-sm" onClick={handlePrintSelected}>
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                        Imprimer la sélection ({selectedIds.length})
                    </Button>
                )}
            </Card.Header>
            <Card.Body className="p-0">
                <Table responsive hover className="align-middle mb-0">
                    <thead className="bg-light small text-uppercase">
                        <tr>
                            <th className="ps-4" style={{ width: '40px' }}><Form.Check type="checkbox" onChange={handleSelectAll} checked={historique?.length > 0 && selectedIds.length === historique.length} /></th>
                            <th>Date & Origine</th>
                            <th>N° Facture</th>
                            <th>Articles Vendus</th>
                            <th className="text-end">Total Net</th>
                            <th>Règlement</th>
                            <th className="pe-4 text-end">Statut / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historique && historique.length > 0 ? (
                            historique.map(group => (
                            <tr key={group.orderGroupId} className={group.isCancelled ? "bg-light opacity-50" : group.statut === 'finalisee' ? "bg-warning-subtle" : group.statut === 'commande' ? "bg-info-subtle" : ""}>
                                <td className="ps-4">
                                    <Form.Check type="checkbox" checked={selectedIds.includes(group.orderGroupId)} onChange={() => handleSelectOne(group.orderGroupId)} />
                                </td>
                                <td>
                                    <div className="fw-bold">{new Date(group.createdAt).toLocaleDateString()}</div>
                                    <Badge bg="info" className="fw-normal">{group.boutique?.nom || 'N/A'}</Badge>
                                    <div className="x-small text-muted mt-1">Par: {group.gerant?.nom || 'Admin'}</div>
                                </td>
                                <td>
                                    {group.numeroFacture || group.items?.[0]?.numeroFacture ? (
                                        <Badge bg="primary-subtle" text="primary" className="rounded-pill px-2 py-1 small fw-bold">
                                            <iconify-icon icon="solar:document-text-bold" className="me-1" style={{ fontSize: '11px' }}></iconify-icon>
                                            {group.numeroFacture || group.items?.[0]?.numeroFacture}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted x-small">—</span>
                                    )}
                                </td>
                                <td>
                                    <ul className="list-unstyled mb-0 small">
                                        {group.items?.map(item => (
                                            <li key={item._id} className={item.isCancelled ? "text-decoration-line-through text-muted" : ""}>
                                                • {item.article?.nom || 'Article supprimé'} <Badge bg="light" text="dark">x{item.quantite}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                                <td className="text-end fw-bold text-success">
                                    {group.totalGroupPrice.toLocaleString()} GNF
                                </td>
                                <td>
                                    <div className="d-flex flex-column align-items-start">
                                        <Badge bg={group.items[0]?.modePaiement === 'Cash' ? "success-subtle" : "primary-subtle"} text="dark" className="border-0 fw-normal">
                                            {group.items[0]?.modePaiement || 'Cash'}
                                        </Badge>
                                        {group.items[0]?.transactionRef && <small className="text-muted x-small mt-1 font-monospace" style={{fontSize: '0.65rem'}}>{group.items[0].transactionRef}</small>}
                                    </div>
                                </td>
                                <td className="pe-4 text-end">
                                    <div className="d-flex gap-2 justify-content-end align-items-center">
                                        {group.isCancelled ? <Badge bg="danger">ANNULÉE</Badge> :
                                         group.statut === 'finalisee' ? <Badge bg="warning" text="dark">ENCAISSÉE</Badge> :
                                         <Badge bg="info">EN ATTENTE</Badge>}
                                        
                                        {group.statut === 'finalisee' && (
                                            <Button variant="outline-secondary" size="sm" className="rounded-circle p-1" onClick={() => handleReprint(group)}>
                                                <iconify-icon icon="solar:printer-bold"></iconify-icon>
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7" className="text-center py-5 text-muted">
                                    <div className="d-flex flex-column align-items-center">
                                        <iconify-icon icon="solar:history-bold-duotone" style={{ fontSize: '64px', opacity: '0.3' }}></iconify-icon>
                                        <h5 className="mt-3 fw-bold">Aucun historique de vente</h5>
                                        <p className="small mb-0">Il n'y a aucune vente à afficher pour cette période.</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </Card.Body>
            {totalPages > 1 && (
                <Card.Footer className="d-flex justify-content-center border-0 pt-0">
                    <Pagination className="mb-0">
                        <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                        
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(page => 
                                page === 1 || 
                                page === totalPages || 
                                (page >= currentPage - 1 && page <= currentPage + 1)
                            )
                            .map((page, index, array) => (
                                <React.Fragment key={page}>
                                    {index > 0 && array[index - 1] !== page - 1 && <Pagination.Ellipsis disabled />}
                                    <Pagination.Item 
                                        active={page === currentPage} 
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </Pagination.Item>
                                </React.Fragment>
                            ))
                        }

                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                        <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                    </Pagination>
                </Card.Footer>
            )}
        </Card>
    );
};

export default AdminHistoryTab;