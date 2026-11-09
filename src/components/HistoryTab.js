/**
 * @file HistoryTab.js - Version 2.0
 * @description Historique des ventes complet avec filtres avancés, tri, export et modal de détail.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
    Card, Table, Badge, Button, Form, Pagination, Spinner,
    Row, Col, OverlayTrigger, Tooltip, Modal, InputGroup
} from 'react-bootstrap';
import { formatCurrency } from '../utils/formatUtils';
import { exportSalesCSV, exportSalesPDF } from '../utils/exportCSV';
import { toast } from 'react-toastify';

// Étiquettes de statut pour les badges
const STATUS_LABELS = {
    'finalisee': 'Payé',
    'commande': 'En attente',
    'en_preparation': 'Prêt',
    'annulee': 'Annulé'
};

const STATUS_COLORS = {
    'finalisee': 'success',
    'commande': 'info',
    'en_preparation': 'warning',
    'annulee': 'danger'
};

// Modes de paiement disponibles
const PAYMENT_MODES = ['Cash', 'Orange Money', 'MobiCash', 'PayCard', 'Virement', 'Dette'];

const HistoryTab = ({
    historique,
    showCancelledOnly,
    setShowCancelledOnly,
    filterPaymentMode,
    setFilterPaymentMode,
    filterClient,
    setFilterClient,
    currentPage,
    totalPages,
    setCurrentPage,
    isCancellationAllowed,
    handleImageClick,
    setSaleToCancel,
    setShowCancelModal,
    handleFinalizeOrder,
    userRole,
    isUpdatingStatus,
    isPendingView,
    ecoMode
}) => {
    // État local pour les filtres
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInvoice, setSearchInvoice] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [periodFilter, setPeriodFilter] = useState(''); // 'today', 'month', 'custom'

    // Effet pour gérer les filtres de période
    useEffect(() => {
        if (!periodFilter) return;
        
        const now = new Date();
        let start, end;
        
        if (periodFilter === 'today') {
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
        } else if (periodFilter === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }
        
        if (start && end) {
            setDateStart(start.toISOString().split('T')[0]);
            setDateEnd(end.toISOString().split('T')[0]);
        }
    }, [periodFilter]);

    // Tri
    const [sortField, setSortField] = useState('createdAt');
    const [sortDirection, setSortDirection] = useState('desc');

    // Modal de détail
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Accordéon
    const [expandedGroups, setExpandedGroups] = useState({});
    const [selectedItems, setSelectedItems] = useState({});

    const getRelativeTime = (date) => {
        const diff = new Date() - new Date(date);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "À l'instant";
        if (mins < 60) return `Il y a ${mins} min`;
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const toggleItemSelection = (tableId, itemId) => {
        setSelectedItems(prev => {
            const currentSelection = prev[tableId] || [];
            const newSelection = currentSelection.includes(itemId)
                ? currentSelection.filter(id => id !== itemId)
                : [...currentSelection, itemId];
            return { ...prev, [tableId]: newSelection };
        });
    };

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const renderSortIcon = (field) => {
        if (sortField !== field) return <iconify-icon icon="solar:sort-vertical-linear" className="ms-1 opacity-25" inline></iconify-icon>;
        return sortDirection === 'asc'
            ? <iconify-icon icon="solar:alt-arrow-up-bold" className="ms-1 text-primary" inline></iconify-icon>
            : <iconify-icon icon="solar:alt-arrow-down-bold" className="ms-1 text-primary" inline></iconify-icon>;
    };

    // Extraire les clients uniques pour le filtre
    const uniqueClients = useMemo(() => {
        const clients = new Map();
        (historique || []).forEach(g => {
            if (g.client?._id && !clients.has(g.client._id)) {
                clients.set(g.client._id, { id: g.client._id, nom: g.client.nom || 'Client' });
            }
        });
        return Array.from(clients.values());
    }, [historique]);

    // Filtrage et tri des données
    const filteredData = useMemo(() => {
        if (!historique) return [];

        let data = [...historique];

        // Filtre annulées
        if (showCancelledOnly) {
            data = data.filter(g => g.isCancelled);
        }

        // Recherche textuelle
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            data = data.filter(g => {
                const itemNames = (g.items || []).map(i => (i.article?.nom || '').toLowerCase()).join(' ');
                const clientName = (g.client?.nom || '').toLowerCase();
                const table = (g.numeroTable || '').toString().toLowerCase();
                return itemNames.includes(term) || clientName.includes(term) || table.includes(term);
            });
        }

        // Filtre statut
        if (filterStatus) {
            data = data.filter(g => {
                if (filterStatus === 'annulee') return g.isCancelled;
                return g.statut === filterStatus;
            });
        }

        // Filtre mode de paiement
        if (filterPaymentMode) {
            data = data.filter(g => g.items?.[0]?.modePaiement === filterPaymentMode);
        }

        // Filtre par numéro de facture
        if (searchInvoice.trim()) {
            const invoiceTerm = searchInvoice.trim().toUpperCase();
            data = data.filter(g => {
                const invoiceNumber = g.items?.[0]?.numeroFacture || '';
                return invoiceNumber.toUpperCase().includes(invoiceTerm);
            });
        }

        // Filtre client
        if (filterClient) {
            data = data.filter(g => g.client?._id === filterClient);
        }

        // Filtre date
        if (dateStart) {
            const start = new Date(dateStart);
            start.setHours(0, 0, 0, 0);
            data = data.filter(g => new Date(g.createdAt) >= start);
        }
        if (dateEnd) {
            const end = new Date(dateEnd);
            end.setHours(23, 59, 59, 999);
            data = data.filter(g => new Date(g.createdAt) <= end);
        }

        // Tri
        data.sort((a, b) => {
            let valA, valB;
            switch (sortField) {
                case 'createdAt':
                    valA = new Date(a.createdAt).getTime();
                    valB = new Date(b.createdAt).getTime();
                    break;
                case 'totalGroupPrice':
                    valA = a.totalGroupPrice || 0;
                    valB = b.totalGroupPrice || 0;
                    break;
                case 'statut':
                    valA = a.isCancelled ? 'zzz' : (a.statut || '');
                    valB = b.isCancelled ? 'zzz' : (b.statut || '');
                    break;
                case 'table':
                    valA = a.numeroTable || 0;
                    valB = b.numeroTable || 0;
                    break;
                case 'client':
                    valA = (a.client?.nom || '').toLowerCase();
                    valB = (b.client?.nom || '').toLowerCase();
                    break;
                case 'numeroFacture':
                    valA = (a.numeroFacture || a.items?.[0]?.numeroFacture || '').toLowerCase();
                    valB = (b.numeroFacture || b.items?.[0]?.numeroFacture || '').toLowerCase();
                    break;
                default:
                    valA = new Date(a.createdAt).getTime();
                    valB = new Date(b.createdAt).getTime();
            }
            if (sortDirection === 'asc') return valA > valB ? 1 : valA < valB ? -1 : 0;
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        });

        return data;
    }, [historique, showCancelledOnly, searchTerm, filterStatus, filterPaymentMode, filterClient, dateStart, dateEnd, sortField, sortDirection]);

    // Pagination calculée localement
    const totalFiltered = filteredData.length;
    const totalFilteredPages = Math.ceil(totalFiltered / rowsPerPage);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // Compteur pour l'affichage
    const startCount = filteredData.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const endCount = Math.min(currentPage * rowsPerPage, totalFiltered);

    // Handle export
    const handleExportCSV = () => {
        if (filteredData.length === 0) {
            toast.warning('Aucune donnée à exporter.');
            return;
        }
        exportSalesCSV(filteredData);
        toast.success('Export CSV téléchargé avec succès !');
    };

    const handleExportPDF = async () => {
        if (filteredData.length === 0) {
            toast.warning('Aucune donnée à exporter.');
            return;
        }
        await exportSalesPDF(filteredData);
        toast.success('Export PDF téléchargé avec succès !');
    };

    // Handlers for page change (reset to 1 when filters change)
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    // Reset page when rows per page changes
    const handleRowsPerPageChange = (e) => {
        setRowsPerPage(parseInt(e.target.value));
        setCurrentPage(1);
    };

    // Clear all filters
    const clearFilters = () => {
        setSearchTerm('');
        setFilterStatus('');
        setFilterPaymentMode('');
        setFilterClient('');
        setDateStart('');
        setDateEnd('');
        setShowCancelledOnly(false);
        setCurrentPage(1);
    };

    const hasActiveFilters = searchTerm || filterStatus || filterPaymentMode || filterClient || dateStart || dateEnd || showCancelledOnly;

    // --- VUE PENDING (mode panier - inchangée) ---
    if (isPendingView) {
        const newOrders = (historique || []).filter(g => g.statut === 'commande');
        const readyOrders = (historique || []).filter(g => g.statut === 'en_preparation');

        return (
            <>
                <Row className="g-3">
                    {newOrders.map(group => (
                        <Col xl={3} lg={4} md={6} xs={12} key={group.orderGroupId}>
                            <Card className="border-0 shadow-sm rounded-4 h-100 overflow-hidden border-top border-4 border-warning animate__animated animate__fadeIn position-relative">
                                <Card.Header className="bg-white py-3 border-0">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <Badge bg="primary" className="fs-6 px-3 py-2 rounded-pill shadow-sm">
                                            <iconify-icon icon="solar:chair-bold" className="me-2 align-middle"></iconify-icon>
                                            {group.numeroTable ? `TABLE ${group.numeroTable}` : 'À EMPORTER'}
                                        </Badge>
                                        <div className="text-end">
                                            <div className="small fw-bold text-primary">{getRelativeTime(group.createdAt)}</div>
                                            <div className="x-small text-muted">Par: {group.gerant?.nom || 'N/A'}</div>
                                        </div>
                                    </div>
                                </Card.Header>
                                <Card.Body className="p-2 bg-light bg-opacity-50">
                                    <div className="pending-items-list" style={{ maxHeight: '450px', overflowY: 'auto', overflowX: 'hidden' }}>
                                        {group.items?.map(item => (
                                            <div key={item._id} className={`d-flex align-items-center p-2 mb-2 bg-white rounded-3 shadow-sm ${item.isCancelled ? 'opacity-50' : ''}`} style={{ transition: 'all 0.2s' }}>
                                                {!item.isCancelled && (
                                                    <Form.Check
                                                        type="checkbox"
                                                        className="me-2 custom-cart-checkbox"
                                                        style={{ transform: 'scale(1.2)' }}
                                                        checked={selectedItems[group.orderGroupId]?.includes(item._id) || false}
                                                        onChange={() => toggleItemSelection(group.orderGroupId, item._id)}
                                                    />
                                                )}
                                                {item.article?.image && !ecoMode ? (
                                                    <img src={item.article.image} alt="" className="rounded me-2" style={{ width: '40px', height: '40px', objectFit: 'cover' }} />
                                                ) : (
                                                    <div className="bg-secondary bg-opacity-10 rounded d-flex align-items-center justify-content-center me-2" style={{ width: '50px', height: '50px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                                )}
                                                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                    <div className={`fw-bold small ${item.isCancelled ? 'text-decoration-line-through' : ''}`}>{item.article?.nom || 'Article supprimé'}</div>
                                                    <div className="d-flex align-items-center gap-2 mt-1">
                                                        {item.statut === 'en_preparation' ? (
                                                            <Badge bg="success-subtle" text="success" pill style={{ fontSize: '0.65rem' }}>DÉJÀ PRÊT</Badge>
                                                        ) : (
                                                            <Badge bg="warning-subtle" text="warning-emphasis" pill style={{ fontSize: '0.65rem' }}>NOUVEAU</Badge>
                                                        )}
                                                    </div>
                                                    <div className="d-flex align-items-center mt-1">
                                                        <span className="badge bg-dark rounded-pill me-2">x{item.quantite}</span>
                                                        <span className="text-success small fw-bold">{item.prixTotal.toLocaleString()} GNF</span>
                                                    </div>
                                                </div>
                                                {!item.isCancelled && isCancellationAllowed(item) && (
                                                    <OverlayTrigger overlay={<Tooltip>Annuler cet article</Tooltip>}>
                                                        <Button variant="link" className="text-danger p-1 ms-1" onClick={() => { setSaleToCancel(item); setShowCancelModal(true); }}>
                                                            <iconify-icon icon="solar:trash-bin-trash-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                        </Button>
                                                    </OverlayTrigger>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Card.Body>
                                <Card.Footer className="bg-white border-0 pt-0 pb-3 px-3">
                                    <div className="d-flex justify-content-between align-items-center mb-3 pt-3 border-top">
                                        <span className="text-muted small fw-bold">TOTAL COMMANDE</span>
                                        <span className="fw-bold fs-6 text-dark">{formatCurrency(group.totalGroupPrice)}</span>
                                    </div>
                                    <Button
                                        variant={selectedItems[group.orderGroupId]?.length > 0 ? "primary" : "success"}
                                        className="w-100 rounded-pill py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center"
                                        onClick={() => {
                                            const idsToUpdate = selectedItems[group.orderGroupId]?.length > 0
                                                ? selectedItems[group.orderGroupId]
                                                : group.items.map(i => i._id);
                                            handleFinalizeOrder(group.orderGroupId, 'en_preparation', true, group.items?.[0]?.modePaiement || 'Cash', idsToUpdate);
                                            setSelectedItems(prev => ({ ...prev, [group.orderGroupId]: [] }));
                                        }}
                                        disabled={isUpdatingStatus || group.isCancelled}
                                    >
                                        {isUpdatingStatus ? <Spinner as="span" animation="border" size="sm" /> : <>
                                            <iconify-icon icon="solar:cup-hot-bold" className="me-2 fs-5"></iconify-icon>
                                            {selectedItems[group.orderGroupId]?.length > 0
                                                ? `MARQUER LA SÉLECTION PRÊTE (${selectedItems[group.orderGroupId].length})`
                                                : 'TOUTE LA TABLE EST PRÊTE'}
                                        </>}
                                    </Button>
                                </Card.Footer>
                            </Card>
                        </Col>
                    ))}
                    {newOrders.length === 0 && (
                        <Col xs={12} className="text-center py-5">
                            <iconify-icon icon="solar:cup-hot-bold-duotone" style={{ fontSize: '100px', opacity: '0.1' }}></iconify-icon>
                            <h4 className="text-muted mt-3">Aucune commande en attente</h4>
                        </Col>
                    )}
                </Row>

                {readyOrders.length > 0 && (
                    <div className="mt-5 pt-4 border-top">
                        <h5 className="fw-bold mb-3 d-flex align-items-center text-success">
                            <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                            Tables Prêtes (En attente d'encaissement par les serveurs)
                        </h5>
                        <div className="d-flex flex-wrap gap-2">
                            {readyOrders.map(group => (
                                <Card key={group.orderGroupId} className="border-0 shadow-sm rounded-4 bg-success bg-opacity-10 border border-success border-opacity-25" style={{ minWidth: '200px' }}>
                                    <Card.Body className="p-3 text-center">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <Badge bg="success" pill>TABLE {group.numeroTable || 'N/A'}</Badge>
                                            <small className="text-muted">{new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                                        </div>
                                        <div className="fw-bold fs-5 text-dark mb-1">{formatCurrency(group.totalGroupPrice)}</div>
                                        <div className="small text-muted mb-0">Serveur: {group.gerant?.nom || 'N/A'}</div>
                                    </Card.Body>
                                </Card>
                            ))}
                        </div>
                        <p className="text-muted small mt-3">
                            <iconify-icon icon="solar:info-circle-linear" className="me-1 align-middle"></iconify-icon>
                            Ces tables ont été validées au bar. Elles apparaissent en vert sur le dashboard des serveurs.
                        </p>
                    </div>
                )}
            </>
        );
    }

    // --- VUE HISTORIQUE PRINCIPALE (Version 2.0) ---
    return (
        <>
            {/* Barre de filtres */}
            <Card className="border-0 shadow-sm rounded-4 mb-3">
                <Card.Body className="p-3">
                    <Row className="g-2 align-items-end">
                        <Col md={3} sm={6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Recherche</Form.Label>
                                <InputGroup size="sm">
                                    <InputGroup.Text className="bg-white"><iconify-icon icon="solar:magnifer-linear"></iconify-icon></InputGroup.Text>
                                    <Form.Control
                                        placeholder="Article, client, table..."
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    />
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={2} sm={6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">N° Facture</Form.Label>
                                <InputGroup size="sm">
                                    <InputGroup.Text className="bg-white"><iconify-icon icon="solar:document-text-linear"></iconify-icon></InputGroup.Text>
                                    <Form.Control
                                        placeholder="FAC-XXXXXX-2024"
                                        value={searchInvoice}
                                        onChange={(e) => { setSearchInvoice(e.target.value); setCurrentPage(1); }}
                                    />
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={1} sm={3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Période</Form.Label>
                                <Form.Select size="sm" value={periodFilter} onChange={(e) => { setPeriodFilter(e.target.value); setCurrentPage(1); }}>
                                    <option value="">Toutes</option>
                                    <option value="today">Aujourd'hui</option>
                                    <option value="month">Ce mois</option>
                                    <option value="custom">Personnalisé</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2} sm={6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Statut</Form.Label>
                                <Form.Select size="sm" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
                                    <option value="">Tous</option>
                                    <option value="commande">En attente</option>
                                    <option value="en_preparation">Prêt</option>
                                    <option value="finalisee">Payé</option>
                                    <option value="annulee">Annulé</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2} sm={6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Paiement</Form.Label>
                                <Form.Select size="sm" value={filterPaymentMode} onChange={(e) => { setFilterPaymentMode(e.target.value); setCurrentPage(1); }}>
                                    <option value="">Tous</option>
                                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={2} sm={6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Client</Form.Label>
                                <Form.Select size="sm" value={filterClient} onChange={(e) => { setFilterClient(e.target.value); setCurrentPage(1); }}>
                                    <option value="">Tous</option>
                                    {uniqueClients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={1} sm={3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Début</Form.Label>
                                <Form.Control type="date" size="sm" value={dateStart} onChange={(e) => { setDateStart(e.target.value); setCurrentPage(1); }} />
                            </Form.Group>
                        </Col>
                        <Col md={1} sm={3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold text-muted mb-1">Fin</Form.Label>
                                <Form.Control type="date" size="sm" value={dateEnd} onChange={(e) => { setDateEnd(e.target.value); setCurrentPage(1); }} />
                            </Form.Group>
                        </Col>
                        <Col md={1} sm={6} className="d-flex align-items-end gap-1">
                            {hasActiveFilters && (
                                <Button variant="outline-danger" size="sm" onClick={clearFilters} className="w-100" title="Réinitialiser les filtres">
                                    <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
                                </Button>
                            )}
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* Barre d'actions et compteur */}
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                <div className="d-flex align-items-center gap-3">
                    <span className="text-muted small">
                        <strong>{totalFiltered}</strong> résultat{totalFiltered !== 1 ? 's' : ''}
                        {totalFiltered > 0 && (
                            <span className="ms-2 text-muted">({startCount}-{endCount} affichés)</span>
                        )}
                    </span>
                    <Form.Select size="sm" style={{ width: 'auto' }} value={rowsPerPage} onChange={handleRowsPerPageChange}>
                        <option value="10">10 / page</option>
                        <option value="25">25 / page</option>
                        <option value="50">50 / page</option>
                        <option value="100">100 / page</option>
                    </Form.Select>
                    <Form.Check
                        type="switch"
                        id="cancelled-sales-switch"
                        label={<span className="small">Annulées</span>}
                        checked={showCancelledOnly}
                        onChange={() => { setShowCancelledOnly(prev => !prev); setCurrentPage(1); }}
                    />
                </div>
                <div className="d-flex gap-2">
                    <Button variant="outline-success" size="sm" onClick={handleExportCSV} disabled={filteredData.length === 0}>
                        <iconify-icon icon="solar:file-text-bold" className="me-1 align-middle"></iconify-icon>
                        CSV
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={handleExportPDF} disabled={filteredData.length === 0}>
                        <iconify-icon icon="solar:file-pdf-bold" className="me-1 align-middle"></iconify-icon>
                        PDF
                    </Button>
                </div>
            </div>

            {/* Tableau principal */}
            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <div style={{ overflowX: 'auto' }}>
                        <Table responsive className="align-middle mb-0 border-0" hover>
                            <thead className="bg-light text-muted small text-uppercase">
                                <tr>
                                    <th className="ps-4 border-0" style={{ cursor: 'pointer' }} onClick={() => handleSort('createdAt')}>
                                        Date {renderSortIcon('createdAt')}
                                    </th>
                                    <th className="border-0" style={{ cursor: 'pointer' }} onClick={() => handleSort('table')}>
                                        Table {renderSortIcon('table')}
                                    </th>
                                    <th className="border-0" style={{ cursor: 'pointer' }} onClick={() => handleSort('client')}>
                                        Client {renderSortIcon('client')}
                                    </th>
                                    <th className="border-0" style={{ cursor: 'pointer' }} onClick={() => handleSort('numeroFacture')}>
                                        N° Facture {renderSortIcon('numeroFacture')}
                                    </th>
                                    <th className="border-0">Articles</th>
                                    <th className="border-0 text-end" style={{ cursor: 'pointer' }} onClick={() => handleSort('totalGroupPrice')}>
                                        Montant {renderSortIcon('totalGroupPrice')}
                                    </th>
                                    <th className="border-0 text-center" style={{ cursor: 'pointer' }} onClick={() => handleSort('statut')}>
                                        Statut {renderSortIcon('statut')}
                                    </th>
                                    <th className="pe-4 border-0 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.length > 0 ? (
                                    paginatedData.map(group => (
                                        <React.Fragment key={group.orderGroupId}>
                                            <tr
                                                className={`odoo-row ${group.isCancelled ? 'bg-annulee' : ''}`}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => { setSelectedGroup(group); setShowDetailModal(true); }}
                                            >
                                                <td className="ps-4 py-3">
                                                    <div className="fw-bold text-dark small">
                                                        {new Date(group.createdAt).toLocaleDateString('fr-FR')}
                                                    </div>
                                                    <div className="x-small text-muted">
                                                        {new Date(group.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="d-flex align-items-center">
                                                        <iconify-icon icon="solar:chair-bold" className="me-1 text-primary"></iconify-icon>
                                                        <span className="fw-bold small">{group.numeroTable ? `Table ${group.numeroTable}` : 'À emporter'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="small">{group.client?.nom || 'Client de passage'}</span>
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
                                                <td onClick={(e) => { e.stopPropagation(); toggleGroup(group.orderGroupId); }} style={{ minWidth: '180px' }}>
                                                    <div className="d-flex align-items-center small">
                                                        <Badge bg="light" text="dark" className="me-2">{group.items?.length || 0} article(s)</Badge>
                                                        <iconify-icon icon={expandedGroups[group.orderGroupId] ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"} style={{ fontSize: '12px' }}></iconify-icon>
                                                    </div>
                                                    {expandedGroups[group.orderGroupId] && (
                                                        <ul className="list-unstyled mb-0 mt-1 x-small">
                                                            {group.items?.map(item => (
                                                                <li key={item._id} className={item.isCancelled ? "text-decoration-line-through text-muted" : ""}>
                                                                    • {item.article?.nom || 'Article'} x{item.quantite}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                                <td className="text-end">
                                                    <span className={`fw-bold small ${group.isCancelled ? 'text-decoration-line-through text-muted' : 'text-dark'}`}>
                                                        {formatCurrency(group.totalGroupPrice)}
                                                    </span>
                                                    {group.items?.[0]?.modePaiement && (
                                                        <div className="x-small text-muted">{group.items[0].modePaiement}</div>
                                                    )}
                                                </td>
                                                <td className="text-center">
                                                    {group.isCancelled ? (
                                                        <Badge bg="danger" className="px-2 py-1 rounded-pill small">Annulé</Badge>
                                                    ) : (
                                                        <Badge bg={STATUS_COLORS[group.statut] || 'secondary'} className="px-2 py-1 rounded-pill small">
                                                            {STATUS_LABELS[group.statut] || group.statut}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className="pe-4 text-center">
                                                    {!group.isCancelled && group.statut === 'commande' && userRole === 'Gérant' && (
                                                        <Button variant="primary" size="sm" className="rounded-pill" onClick={(e) => { e.stopPropagation(); handleFinalizeOrder(group.orderGroupId, 'en_preparation', true, group.items?.[0]?.modePaiement || 'Cash'); }} disabled={isUpdatingStatus}>
                                                            {isUpdatingStatus ? <Spinner size="sm" /> : 'Prêt'}
                                                        </Button>
                                                    )}
                                                    {!group.isCancelled && isCancellationAllowed(group.items?.[0]) && (
                                                        <Button variant="link" className="text-danger p-0 ms-1" onClick={(e) => { e.stopPropagation(); setSaleToCancel(group.items[0]); setShowCancelModal(true); }} title="Annuler">
                                                            <iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon>
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="text-center py-5 text-muted">
                                            <div className="d-flex flex-column align-items-center">
                                                <iconify-icon icon="solar:history-bold-duotone" style={{ fontSize: '64px', opacity: '0.3' }}></iconify-icon>
                                                <h5 className="mt-3 fw-bold">Aucun historique de vente</h5>
                                                <p className="small mb-0">
                                                    {hasActiveFilters ? 'Essayez de modifier vos filtres.' : 'Il n\'y a aucune vente à afficher pour cette période.'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                </Card.Body>
                {totalFilteredPages > 1 && (
                    <Card.Footer className="d-flex justify-content-center border-0 bg-white py-3">
                        <Pagination className="mb-0">
                            <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
                            <Pagination.Prev onClick={() => handlePageChange(Math.max(currentPage - 1, 1))} disabled={currentPage === 1} />
                            {(() => {
                                const pages = [];
                                for (let i = 1; i <= totalFilteredPages; i++) {
                                    if (i === 1 || i === totalFilteredPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                                        pages.push(i);
                                    }
                                }
                                return pages.map((p, idx) => (
                                    <React.Fragment key={p}>
                                        {idx > 0 && pages[idx - 1] !== p - 1 && <Pagination.Ellipsis disabled />}
                                        <Pagination.Item active={p === currentPage} onClick={() => handlePageChange(p)}>{p}</Pagination.Item>
                                    </React.Fragment>
                                ));
                            })()}
                            <Pagination.Next onClick={() => handlePageChange(Math.min(currentPage + 1, totalFilteredPages))} disabled={currentPage === totalFilteredPages} />
                            <Pagination.Last onClick={() => handlePageChange(totalFilteredPages)} disabled={currentPage === totalFilteredPages} />
                        </Pagination>
                    </Card.Footer>
                )}
            </Card>

            {/* Modal de détail d'une vente */}
            <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} centered size="lg">
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold d-flex align-items-center gap-2">
                        <iconify-icon icon="solar:receipt-bold-duotone" className="text-primary"></iconify-icon>
                        Détail de la vente
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="pt-2">
                    {selectedGroup && (
                        <>
                            {/* En-tête info */}
                            <div className="bg-light rounded-3 p-3 mb-3">
                                <Row className="g-2">
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Date & Heure</div>
                                        <div className="fw-bold small">
                                            {new Date(selectedGroup.createdAt).toLocaleDateString('fr-FR')} - {new Date(selectedGroup.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </Col>
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">N° Facture</div>
                                        <div className="fw-bold small">
                                            <Badge bg="primary-subtle" text="primary" className="rounded-pill px-2 py-1">
                                                <iconify-icon icon="solar:document-text-bold" className="me-1" style={{ fontSize: '11px' }}></iconify-icon>
                                                {selectedGroup.numeroFacture || selectedGroup.items?.[0]?.numeroFacture || 'N/A'}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={2}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Client</div>
                                        <div className="fw-bold small">{selectedGroup.client?.nom || 'Client de passage'}</div>
                                    </Col>
                                    {userRole !== 'Gérant' && (
                                    <Col md={2}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Table</div>
                                        <div className="fw-bold small">{selectedGroup.numeroTable ? `Table ${selectedGroup.numeroTable}` : 'À emporter'}</div>
                                    </Col>
                                    )}
                                    <Col md={2}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Statut</div>
                                        <Badge bg={selectedGroup.isCancelled ? 'danger' : (STATUS_COLORS[selectedGroup.statut] || 'secondary')}>
                                            {selectedGroup.isCancelled ? 'Annulé' : (STATUS_LABELS[selectedGroup.statut] || selectedGroup.statut)}
                                        </Badge>
                                    </Col>
                                </Row>
                            </div>

                            {/* Articles */}
                            <h6 className="fw-bold mb-2">Articles</h6>
                            <Table size="sm" hover className="mb-3">
                                <thead className="table-light">
                                    <tr>
                                        <th>Article</th>
                                        <th className="text-center">Qté</th>
                                        <th className="text-end">Prix Unitaire</th>
                                        <th className="text-end">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedGroup.items || []).map(item => (
                                        <tr key={item._id} className={item.isCancelled ? 'text-decoration-line-through text-muted' : ''}>
                                            <td className="fw-bold small">{item.article?.nom || 'Article supprimé'}</td>
                                            <td className="text-center small">{item.quantite}</td>
                                            <td className="text-end small">{(item.prixTotal / item.quantite).toLocaleString()} GNF</td>
                                            <td className="text-end fw-bold small">{item.prixTotal.toLocaleString()} GNF</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="table-active">
                                    <tr>
                                        <td colSpan="3" className="text-end fw-bold">TOTAL</td>
                                        <td className="text-end fw-bold fs-6">{formatCurrency(selectedGroup.totalGroupPrice)}</td>
                                    </tr>
                                </tfoot>
                            </Table>

                            {/* Infos supplémentaires */}
                            <div className="bg-light rounded-3 p-3">
                                <Row className="g-2">
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Mode de paiement</div>
                                        <div className="fw-bold small">{selectedGroup.items?.[0]?.modePaiement || 'N/A'}</div>
                                    </Col>
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Réf. Transaction</div>
                                        <div className="fw-bold small">{selectedGroup.transactionRef || selectedGroup.items?.[0]?.transactionRef || '—'}</div>
                                    </Col>
                                    {userRole !== 'Gérant' && (
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Serveur/Gérant</div>
                                        <div className="fw-bold small">{selectedGroup.gerant?.nom || 'N/A'}</div>
                                    </Col>
                                    )}
                                    {userRole !== 'Gérant' && (
                                    <Col md={3}>
                                        <div className="x-small text-muted text-uppercase fw-bold">Pourboire</div>
                                        <div className="fw-bold small">{formatCurrency(selectedGroup.totalGroupPourboire || 0)}</div>
                                    </Col>
                                    )}
                                </Row>
                            </div>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0">
                    <Button variant="secondary" onClick={() => setShowDetailModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            {/* Styles inline */}
            <style>{`
                .odoo-row { 
                    transition: all 0.2s; 
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                }
                .odoo-row:hover { background-color: rgba(13, 110, 253, 0.03) !important; }
                .bg-annulee { background-color: #f8f9fa !important; opacity: 0.7; }
                .bg-finalisee { border-left: 4px solid #198754; } 
                .bg-commande { border-left: 4px solid #0dcaf0; }
                .bg-en_preparation { border-left: 4px solid #ffc107; }
            `}</style>
        </>
    );
};

export default HistoryTab;