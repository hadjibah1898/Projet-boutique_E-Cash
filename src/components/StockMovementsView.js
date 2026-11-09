// src/components/StockMovementsView.js
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Form, Row, Col, Badge, Button, Modal, Pagination, OverlayTrigger, Tooltip, Table } from 'react-bootstrap';
import { mouvementAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import { generateMovementsSummary } from '../utils/pdfUtils';

const StockMovementsView = () => {
    const [mouvements, setMouvements] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ type: '', boutique: '', fournisseur: '', startDate: '', endDate: '' });
    const [successMessage, setSuccessMessage] = useState('');
    
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 15;
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [movementToCancel, setMovementToCancel] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    const fetchMouvements = useCallback(async () => {
        try {
            setLoading(true);
            const params = { ...filters, page: currentPage, limit: itemsPerPage };
            const [mouvementsRes, boutiquesRes, fournisseursRes] = await Promise.all([
                mouvementAPI.getAll(params),
                boutiqueAPI.getAll(),
                fournisseurAPI.getAll()
            ]);

            let rawData = [];
            if (mouvementsRes.data && Array.isArray(mouvementsRes.data)) {
                rawData = mouvementsRes.data;
                setTotalPages(mouvementsRes.totalPages || 1);
            } else if (Array.isArray(mouvementsRes)) {
                rawData = mouvementsRes;
                setTotalPages(1);
            }

            setMouvements(rawData);
            setBoutiques(Array.isArray(boutiquesRes) ? boutiquesRes : (boutiquesRes.data || []));
            setFournisseurs((fournisseursRes.data && Array.isArray(fournisseursRes.data)) ? fournisseursRes.data : (Array.isArray(fournisseursRes) ? fournisseursRes : []));
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des mouvements.");
        } finally {
            setLoading(false);
        }
    }, [filters, currentPage]);

    useEffect(() => {
        fetchMouvements();
    }, [fetchMouvements]);

    useEffect(() => {
        setSelectedIds([]);
    }, [currentPage, filters]);

    const getTypeBadge = (typeCode) => {
        let bg = 'secondary';
        let textColor = 'white';
        let icon = 'solar:info-circle-bold';
        let label = typeCode;

        switch (typeCode) {
            case 'PURCHASE_RECEIPT':
                bg = 'success';
                icon = 'solar:box-bold';
                label = 'Approvisionnement';
                break;
            case 'TRANSFER_IN':
                bg = 'info';
                icon = 'solar:download-square-bold';
                label = "Transfert d'entrée";
                break;
            case 'TRANSFER_OUT':
                bg = 'warning';
                textColor = 'dark';
                icon = 'solar:upload-square-bold';
                label = 'Sortie Transfert';
                break;
            case 'SALE':
                bg = 'primary';
                icon = 'solar:cart-large-bold';
                label = 'Vente';
                break;
            case 'ADJUSTMENT_OUT':
                bg = 'danger';
                icon = 'solar:danger-triangle-bold';
                label = 'Perte / Casse';
                break;
            case 'ADJUSTMENT_IN':
                bg = 'dark';
                icon = 'solar:add-circle-bold';
                label = 'Ajustement +';
                break;
            case 'SALE_CANCEL':
                bg = 'secondary';
                icon = 'solar:undo-left-round-bold';
                label = 'Annulation Vente';
                break;
            default:
                bg = 'secondary';
                icon = 'solar:info-circle-bold';
        }

        return (
            <Badge bg={bg} text={textColor} className="d-inline-flex align-items-center gap-1 px-3 py-2 rounded-pill shadow-sm" style={{ fontSize: '0.8rem' }}>
                <iconify-icon icon={icon} style={{ fontSize: '16px' }}></iconify-icon>
                {label}
            </Badge>
        );
    };

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedIds(mouvements.map(m => m._id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleCancelClick = (movement) => {
        setMovementToCancel(movement);
        setShowCancelModal(true);
    };

    const confirmCancel = async () => {
        try {
            await mouvementAPI.cancel(movementToCancel._id);
            setSuccessMessage("Opération annulée avec succès.");
            fetchMouvements();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'annulation.");
        } finally {
            setShowCancelModal(false);
            setTimeout(() => setSuccessMessage(''), 3000);
        }
    };

    const handlePrintSelected = () => {
        const selectedMouvements = mouvements.filter(m => selectedIds.includes(m._id));
        generateMovementsSummary(selectedMouvements);
    };

    const handleExportExcel = async () => {
        setLoading(true);
        const res = await mouvementAPI.getAll({ ...filters, limit: 0 });
        let rawData = Array.isArray(res) ? res : (res.data || []);
        
        const dataToExport = rawData.map(mvt => ({
            'Date': new Date(mvt.createdAt).toLocaleString('fr-FR'),
            'Type': mvt.typeLabel || mvt.type,
            'Origine': mvt.boutiqueSource?.nom || 'N/A', 
            'Destination': mvt.type === 'SALE' ? 'Client' : (mvt.boutiqueDestination?.nom || 'N/A'),
            'Articles': (mvt.articles || []).map(a => `${a.nomArticle} (${a.quantite})`).join(', '),
            'Opérateur': mvt.operateur?.nom || 'Système',
            'Détails': mvt.details || '-',
            'Statut': mvt.isCancelled ? 'Annulé' : 'Validé'
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Mouvements_Stock");
        XLSX.writeFile(workbook, `export_mouvements_${new Date().toISOString().split('T')[0]}.xlsx`);
        setLoading(false);
    };

    const columns = [
        {
            key: 'select',
            label: (
                <Form.Check 
                    type="checkbox" 
                    onChange={(e) => handleSelectAll(e.target.checked)} 
                    checked={mouvements.length > 0 && selectedIds.length === mouvements.length}
                />
            ),
            render: (_, item) => (
                <Form.Check 
                    type="checkbox" 
                    checked={selectedIds.includes(item._id)} 
                    onChange={() => handleSelectOne(item._id)} 
                />
            )
        },
        {
            key: 'createdAt',
            label: 'Date',
            render: (date) => {
                const d = new Date(date);
                return isNaN(d.getTime()) ? '-' : d.toLocaleString('fr-FR');
            }
        },
        {
            key: 'type',
            label: 'Type',
            render: (_, item) => getTypeBadge(item.type)
        },
        {
            key: 'origineNom',
            label: 'Origine',
            render: (_, item) => item.boutiqueSource?.nom || 'N/A'
        },
        {
            key: 'destination',
            label: 'Destination',
            render: (_, item) => item.type === 'SALE' ? 'Client' : (item.boutiqueDestination?.nom || 'N/A')
        },
        {
            key: 'articles',
            label: 'Articles',
            render: (articles) => (
                <ul className="list-unstyled mb-0 small">
                    {(articles || []).map((art, idx) => (
                        <li key={idx}>
                            {art.nomArticle} <Badge pill bg="light" text="dark" className="ms-1">x{art.quantite}</Badge>
                        </li>
                    ))}
                </ul>
            )
        },
        {
            key: 'operateurNom',
            label: 'Opérateur',
            render: (_, item) => item.operateur?.nom || 'Système'
        },
        {
            key: 'details',
            label: 'Détails',
            render: (details) => <span className="small text-muted">{details}</span>
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (_, item) => {
                if (item.isCancelled) {
                    return (
                        <Badge bg="secondary" className="d-flex align-items-center gap-1 px-2 py-1" style={{width: 'fit-content'}}>
                            Annulée
                        </Badge>
                    );
                }
                
                if (['TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIPT'].includes(item.type)) {
                    return (
                        <OverlayTrigger overlay={<Tooltip>Annuler cette opération.</Tooltip>}>
                            <Button variant="link" className="text-danger p-0" onClick={() => handleCancelClick(item)}>
                                <iconify-icon icon="solar:undo-left-round-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                            </Button>
                        </OverlayTrigger>
                    );
                }
                return null;
            }
        }
    ];

    if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
                <h3 className="fw-bold mb-0">Mouvements de Stock</h3> 
                <div className="d-flex gap-2">
                    {selectedIds.length > 0 && (
                        <Button variant="primary" onClick={handlePrintSelected} className="rounded-pill px-4 shadow-sm">
                            <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                            Imprimer ({selectedIds.length})
                        </Button>
                    )}
                    <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter Excel
                    </Button>
                </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={3}>
                            <Form.Label>Type de mouvement</Form.Label>
                            <Form.Select name="type" value={filters.type} onChange={handleFilterChange}>
                                <option value="">Tous les types</option>
                                <option value="PURCHASE_RECEIPT">Approvisionnement</option>
                                <option value="TRANSFER_OUT">Transfert (Sortie)</option>
                                <option value="TRANSFER_IN">Transfert (Entrée)</option>
                                <option value="SALE">Vente</option>
                                <option value="ADJUSTMENT_OUT">Perte / Casse</option>
                            </Form.Select>
                        </Col>
                        {/* 🟢 NOUVEAU FILTRE : Sélection de la boutique */}
                        <Col md={3}>
                            <Form.Label>Filtrer par boutique</Form.Label>
                            <Form.Select name="boutique" value={filters.boutique} onChange={handleFilterChange}>
                                <option value="">Toutes les boutiques</option>
                                {boutiques.map(b => (
                                    <option key={b._id} value={b._id}>{b.nom}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date début</Form.Label>
                            <Form.Control type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date fin</Form.Label>
                            <Form.Control type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <Table hover responsive className="align-middle mb-0">
                        <thead className="bg-light">
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} className="border-0 small text-uppercase text-secondary">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {mouvements.length > 0 ? (
                                mouvements.map((item, index) => (
                                    <tr key={item._id || index} className={item.isCancelled ? 'bg-light text-muted' : ''}>
                                        {columns.map(col => (
                                            <td key={col.key} className="border-0">
                                                {col.render ? col.render(item[col.key], item) : item[col.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={columns.length} className="text-center py-5 text-muted">
                                    <p className="mb-0">Aucun mouvement de stock trouvé.</p>
                                </td></tr>
                            )}
                        </tbody>
                    </Table>
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-center p-3 border-top">
                            <Pagination className="mb-0">
                                <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                                <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                            </Pagination>
                        </div>
                    )}
                </Card.Body>
            </Card>

            <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Confirmer l'annulation</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Êtes-vous sûr de vouloir annuler cette opération ? Le stock sera restauré.
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Non</Button>
                    <Button variant="danger" onClick={confirmCancel}>Oui, annuler</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default StockMovementsView;