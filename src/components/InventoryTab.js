import React from 'react';
import { Row, Col, Form, Button, Card, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';

const InventoryTab = ({
    searchTerm, setSearchTerm, setCurrentPage, userRole, boutiqueId, boutiques,
    filterBoutique, setFilterBoutique, centralShopId, setFilterFournisseur,
    filterFournisseur, setSelectedArticles, fournisseurs, filterStatus, setFilterStatus,
    sortConfig, setSortConfig, showPromoOnly, setShowPromoOnly,
    columns, filteredArticles, totalPages, currentPage, handlePageChange, renderPaginationItems
}) => {
    return (
        <div className="animate__animated animate__fadeIn">
            <Row className="mb-4 align-items-center g-3">
                <Col md={2}>
                    <Form.Control
                        type="text"
                        placeholder="Rechercher..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </Col>
                {userRole === 'Admin' && !boutiqueId && (
                    <Col md={2}>
                        <Form.Select 
                            value={filterBoutique} 
                            onChange={(e) => {
                                setFilterBoutique(e.target.value);
                                if (e.target.value !== centralShopId) setFilterFournisseur('');
                                setCurrentPage(1);
                            }}
                        >
                            <option value="">Toutes les boutiques</option>
                            {/* ✅ CORRECTION : key et value sécurisés avec storeId */}
                            {(boutiques || []).map(b => (
                                <option key={b._id || b.storeId} value={b._id || b.storeId}>
                                    {b.nom || b.vcStoreName}
                                </option>
                            ))}
                        </Form.Select>
                    </Col>
                )}
                {userRole === 'Admin' && (boutiqueId === centralShopId || filterBoutique === centralShopId) && (
                    <Col md={2}>
                        <Form.Select 
                            value={filterFournisseur} 
                            onChange={(e) => {
                                setFilterFournisseur(e.target.value);
                                setSelectedArticles([]);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="">Tous les fournisseurs</option>
                            {/* ✅ CORRECTION : key et value sécurisés avec supplierId */}
                            {(fournisseurs || []).map(f => (
                                <option key={f._id || f.supplierId} value={f._id || f.supplierId}>
                                    {f.nom || f.vcBusinessName}
                                </option>
                            ))}
                        </Form.Select>
                    </Col>
                )}
                <Col md={2}>
                    <Form.Select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
                        <option value="">Tous les états</option>
                        <option value="low_stock">⚠️ Stock Faible</option>
                        <option value="out_of_stock">🚫 Rupture</option>
                        <option value="expired">💀 Périmés</option>
                        <option value="expiring_soon">⏰ Expire bientôt</option>
                    </Form.Select>
                </Col>
                {(sortConfig.key !== 'nom' || sortConfig.direction !== 'asc') && (
                    <Col md="auto">
                        <Button variant="outline-secondary" size="sm" onClick={() => setSortConfig({ key: 'nom', direction: 'asc' })} className="rounded-pill px-3 shadow-sm">
                            <iconify-icon icon="solar:refresh-circle-bold" className="me-1 align-middle"></iconify-icon>
                            Tri par défaut
                        </Button>
                    </Col>
                )}
                <Col md="auto">
                    <Form.Check 
                        type="switch"
                        id="promo-filter-switch"
                        label="Promotions"
                        checked={showPromoOnly}
                        onChange={(e) => setShowPromoOnly(e.target.checked)}
                        className="fw-medium"
                    />
                </Col>
            </Row>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <TableComponent 
                        columns={columns}
                        data={filteredArticles}
                        emptyMessage="Aucun article trouvé"
                    />
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-center py-3">
                            <Pagination>
                                <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
                                <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />
                                {renderPaginationItems}
                                <Pagination.Next onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} />
                                <Pagination.Last onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} />
                            </Pagination>
                        </div>
                    )}
                </Card.Body>
            </Card>
        </div>
    );
};

export default InventoryTab;