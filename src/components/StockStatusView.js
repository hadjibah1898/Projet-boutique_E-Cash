// src/components/StockStatusView.js
// Composant d'affichage de l'état du stock
// Permet de visualiser le stock par boutique et par article
// Affiche les alertes de stock faible et les mouvements récents
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Spinner, Alert, Table, Badge, Form, Row, Col, Button } from 'react-bootstrap';
import { articleAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

// Style pour l'animation de clignotement
const blinkAnimationStyle = `
.blink-animation {
    animation: blinker 1.5s linear infinite;
}
@keyframes blinker {
    50% { opacity: 0.3; }
}`;

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = blinkAnimationStyle;
document.head.appendChild(styleSheet);

const formatCurrency = (value) => {
    const num = Number(value);
    if (isNaN(num)) return '0 GNF';
    return (num.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

const StockStatusView = () => {
    const [allArticles, setAllArticles] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [centralShopId, setCentralShopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Filtres
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterBoutique, setFilterBoutique] = useState('all');
    const [filterFournisseur, setFilterFournisseur] = useState('all');

    // État pour le tri
    const [sortConfig, setSortConfig] = useState(() => {
        const savedSort = localStorage.getItem('stockStatusSort');
        return savedSort ? JSON.parse(savedSort) : { key: 'nom', direction: 'asc' };
    });

    useEffect(() => {
        localStorage.setItem('stockStatusSort', JSON.stringify(sortConfig));
    }, [sortConfig]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            const params = {
                limit: 0,
                search: searchTerm,
                // 🟢 CORRECTION ICI : On envoie undefined si on veut "Toutes les boutiques"
                boutique: filterBoutique !== 'all' ? filterBoutique : undefined, 
                fournisseur: filterFournisseur !== 'all' ? filterFournisseur : undefined,
                status: filterStatus !== 'all' ? filterStatus : undefined
            };

            const [articlesRes, boutiquesRes, fournisseursRes] = await Promise.all([
                articleAPI.getAll(params),
                boutiqueAPI.getAll(),
                fournisseurAPI.getAll()
            ]);

            const articles = Array.isArray(articlesRes) ? articlesRes : (articlesRes.data || []);
            const allBoutiques = (Array.isArray(boutiquesRes) ? boutiquesRes : []).sort((a, b) => a.nom.localeCompare(b.nom));
            const allFournisseurs = (fournisseursRes.data && Array.isArray(fournisseursRes.data)) ? fournisseursRes.data : (Array.isArray(fournisseursRes) ? fournisseursRes : []);

            const centrale = allBoutiques.find(b => b.type === 'Centrale' || b.type === 'Bar');
            if (centrale) {
                setCentralShopId(centrale._id);
                // Si Admin et pas de boutique sélectionnée, on ne force pas la Centrale pour voir tout
                if (filterBoutique === 'all' && !localStorage.getItem('boutiqueId')) {
                    setFilterBoutique(centrale._id);
                }
            }

            setAllArticles(articles);
            setBoutiques(allBoutiques);
            setFournisseurs(allFournisseurs);

        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement de l'état des stocks.");
        } finally {
            setLoading(false);
        }
    }, [filterBoutique, filterFournisseur, filterStatus, searchTerm]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const resetAllFilters = () => {
        setSearchTerm('');
        setFilterStatus('all');
        setFilterBoutique('all');
        setFilterFournisseur('all');
        setSortConfig({ key: 'nom', direction: 'asc' });
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) {
            return <iconify-icon icon="solar:sort-vertical-linear" className="ms-1 align-middle opacity-50"></iconify-icon>;
        }
        return sortConfig.direction === 'asc'
            ? <iconify-icon icon="solar:sort-from-top-to-bottom-bold" className="ms-1 align-middle text-primary"></iconify-icon>
            : <iconify-icon icon="solar:sort-from-bottom-to-top-bold" className="ms-1 align-middle text-primary"></iconify-icon>;
    };

    const getStatusBadge = (quantite, seuil = 10) => {
        if (quantite <= 0) {
            return <Badge bg="danger">Rupture de Stock</Badge>;
        }
        if (quantite <= seuil) {
            return <Badge bg="warning" text="dark">Réapprovisionnement</Badge>;
        }
        return <Badge bg="success">En Stock</Badge>;
    };

    const financialTotals = useMemo(() => {
        return allArticles.reduce((acc, a) => {
            const qty = Number(a.quantite) || 0;
            const buyPrice = Number(a.prixAchat) || 0;
            const sellPrice = Number(a.prixVente) || 0;
            
            acc.buy += (qty * buyPrice);
            acc.sell += (qty * sellPrice);
            return acc;
        }, { buy: 0, sell: 0 });
    }, [allArticles]);

    const { groupedArticles, outOfStockMap } = useMemo(() => {
        const outOfStock = {};
        const grouped = allArticles.reduce((acc, article) => {
            const bId = article.boutique?._id || 'unassigned';
            if (!acc[bId]) acc[bId] = [];
            acc[bId].push(article);
            if (article.quantite <= 0) outOfStock[bId] = true;
            return acc;
        }, {});

        return { groupedArticles: grouped, outOfStockMap: outOfStock };
    }, [allArticles]);

    const handleExportExcel = () => {
        if (allArticles.length === 0) return alert("Aucune donnée à exporter.");

        const dataToExport = allArticles.map(a => ({
            'Boutique': a.boutique?.nom || 'N/A',
            'Code': a.code || '-',
            'Produit': a.nom,
            'Fournisseur': a.fournisseur?.nom || 'N/A',
            'Quantité': a.quantite,
            'Prix Achat (GNF)': a.prixAchat,
            'Prix Vente (GNF)': a.prixVente,
            'Marge Unitaire (GNF)': (Number(a.prixVente) || 0) - (Number(a.prixAchat) || 0),
            'Valeur Stock Achat (GNF)': (Number(a.quantite) || 0) * (Number(a.prixAchat) || 0),
            'Statut': a.quantite <= 0 ? 'Rupture' : (a.quantite <= (a.seuilAlerte || 10) ? 'Faible' : 'OK')
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Etat_Stocks");
        XLSX.writeFile(workbook, `etat_global_stocks_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportPDF = () => {
        if (allArticles.length === 0) return alert("Aucune donnée à exporter.");

        const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

        try { doc.addImage(logo, 'PNG', 14, 8, 40, 15); } catch (e) { }

        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.text("État Global des Stocks", 60, 16);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 60, 22);

        const fin = allArticles.reduce((acc, a) => {
            const qty = Number(a.quantite) || 0;
            acc.buy += (qty * (Number(a.prixAchat) || 0));
            acc.sell += (qty * (Number(a.prixVente) || 0));
            return acc;
        }, { buy: 0, sell: 0 });

        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(14, 28, 269, 10, 1, 1, 'FD');

        doc.setFontSize(10).setTextColor(50).setFont("helvetica", "bold");
        doc.text(`Valeur Achat : ${formatCurrency(fin.buy)}`, 20, 34.5);
        doc.text(`Valeur Vente : ${formatCurrency(fin.sell)}`, 110, 34.5);
        doc.setTextColor(41, 128, 185);
        doc.text(`Marge Estimée : ${formatCurrency(fin.sell - fin.buy)}`, 200, 34.5);

        const tableColumn = ["Boutique", "Produit", "Code", "Fournisseur", "Qté", "P. Achat", "P. Vente", "Valeur Stock", "Statut"];
        const tableRows = allArticles.map(a => [
            a.boutique?.nom || 'N/A',
            a.nom,
            a.code || '-',
            a.fournisseur?.nom || 'N/A',
            a.quantite,
            formatCurrency(a.prixAchat),
            formatCurrency(a.prixVente),
            formatCurrency((Number(a.quantite) || 0) * (Number(a.prixAchat) || 0)),
            a.quantite <= 0 ? 'Rupture' : (a.quantite <= (a.seuilAlerte || 10) ? 'Faible' : 'En Stock')
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 42,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], halign: 'center' },
            columnStyles: {
                4: { halign: 'center' },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'right', fontStyle: 'bold' },
                8: { halign: 'center' }
            }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            doc.text(`StockDash - Inventaire`, 14, pageHeight - 10);
            doc.text(`Page ${i} sur ${pageCount}`, pageSize.width - 20, pageHeight - 10, { align: 'right' });
        }

        doc.save(`etat_stocks_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    if (loading) return <div className="p-4 text-center"><Spinner animation="border" /></div>;
    if (error) return <div className="p-4"><Alert variant="danger">{error}</Alert></div>;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">État des Stocks par Boutique</h3>
                <div className="d-flex gap-2">
                    <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter Excel
                    </Button>
                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter PDF
                    </Button>
                </div>
            </div>

            <Row className="mb-4 g-3">
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-danger-subtle text-danger h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between p-4">
                            <div>
                                <h6 className="mb-1 text-uppercase small fw-bold opacity-75">Valeur Stock (Achat)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(financialTotals.buy)}</h4>
                            </div>
                            <iconify-icon icon="solar:cart-large-minimalistic-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-success-subtle text-success h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between p-4">
                            <div>
                                <h6 className="mb-1 text-uppercase small fw-bold opacity-75">Valeur Potentielle (Vente)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(financialTotals.sell)}</h4>
                            </div>
                            <iconify-icon icon="solar:tag-price-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="border-0 shadow-sm bg-primary-subtle text-primary h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between p-4">
                            <div>
                                <h6 className="mb-1 text-uppercase small fw-bold opacity-75">Marge Globale Estimée</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(financialTotals.sell - financialTotals.buy)}</h4>
                            </div>
                            <iconify-icon icon="solar:graph-up-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3 align-items-center">
                        <Col md={3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Rechercher</Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Nom ou code article..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="rounded-pill"
                                />
                            </Form.Group>
                        </Col>
                        <Col md={filterBoutique === centralShopId ? 2 : 3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Filtrer par boutique</Form.Label>
                                <Form.Select value={filterBoutique} onChange={e => {
                                    const newBoutiqueFilter = e.target.value;
                                    setFilterBoutique(newBoutiqueFilter);
                                    if (newBoutiqueFilter !== centralShopId) {
                                        setFilterFournisseur('all');
                                    }
                                }}>
                                    <option value="all">Toutes les boutiques</option>
                                    {boutiques.map(boutique => <option key={boutique._id} value={boutique._id}>{boutique.nom}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        {filterBoutique === centralShopId ? (
                            <Col md={2}>
                                <Form.Group>
                                    <Form.Label className="small fw-bold">Filtrer par fournisseur</Form.Label>
                                    <Form.Select
                                        value={filterFournisseur}
                                        onChange={e => setFilterFournisseur(e.target.value)}
                                    >
                                        <option value="all">Tous les fournisseurs</option>
                                        {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        ) : null}
                        <Col md={filterBoutique === centralShopId ? 2 : 3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Filtrer par état du stock</Form.Label>
                                <Form.Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                    <option value="all">Tous les états</option>
                                    <option value="rupture">Rupture de Stock</option>
                                    <option value="reapprovisionnement">Réapprovisionnement</option>
                                    <option value="en-stock">En Stock</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md="auto" className="ms-auto d-flex gap-2 align-self-end pb-1">
                            {(sortConfig.key !== 'nom' || sortConfig.direction !== 'asc' || filterStatus !== 'all' || filterBoutique !== 'all' || searchTerm !== '') && (
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={resetAllFilters}
                                    className="rounded-pill shadow-sm d-flex align-items-center"
                                    title="Réinitialiser tous les filtres et le tri"
                                >
                                    <iconify-icon icon="solar:restart-bold" className="me-1 align-middle"></iconify-icon>
                                    Réinitialiser
                                </Button>
                            )}
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {boutiques
                .filter(boutique => filterBoutique === 'all' || boutique._id === filterBoutique)
                .map(boutique => {
                    const boutiqueArticles = groupedArticles[boutique._id] || [];
                    const totalStockValue = boutiqueArticles.reduce((sum, article) => sum + ((Number(article.quantite) || 0) * (Number(article.prixAchat) || 0)), 0);
                    const isCentral = boutique.type === 'Centrale';

                    const sortedBoutiqueArticles = [...boutiqueArticles].sort((a, b) => {
                        let aValue, bValue;
                        switch (sortConfig.key) {
                            case 'nom': aValue = a.nom.toLowerCase(); bValue = b.nom.toLowerCase(); break;
                            case 'code': aValue = (a.code || '').toLowerCase(); bValue = (b.code || '').toLowerCase(); break;
                            case 'fournisseur': aValue = (a.fournisseur?.nom || '').toLowerCase(); bValue = (b.fournisseur?.nom || '').toLowerCase(); break;
                            case 'quantite': aValue = a.quantite; bValue = b.quantite; break;
                            case 'prixAchat': aValue = Number(a.prixAchat); bValue = Number(b.prixAchat); break;
                            case 'prixVente': aValue = Number(a.prixVente); bValue = Number(b.prixVente); break;
                            case 'valeurStock': aValue = (Number(a.quantite) || 0) * (Number(a.prixAchat) || 0); bValue = (Number(b.quantite) || 0) * (Number(b.prixAchat) || 0); break;
                            case 'margeUnitaire': aValue = (Number(a.prixVente) || 0) - (Number(a.prixAchat) || 0); bValue = (Number(b.prixVente) || 0) - (Number(b.prixAchat) || 0); break;
                            case 'margePourcent':
                                aValue = a.prixVente > 0 ? ((Number(a.prixVente) - Number(a.prixAchat)) / Number(a.prixVente)) : 0;
                                bValue = b.prixVente > 0 ? ((Number(b.prixVente) - Number(b.prixAchat)) / Number(b.prixVente)) : 0;
                                break;
                            default: aValue = a[sortConfig.key]; bValue = b[sortConfig.key];
                        }
                        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                        return 0;
                    });

                    const columnCount = 11 + (isCentral ? 1 : 0);

                    return (
                        <Card key={boutique._id} className={`border-0 shadow-sm rounded-4 mb-4 ${boutique.type === 'Bar' ? 'bar-card-header' : ''}`}>
                            <Card.Header className="bg-body py-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
                                <div>
                                    <h5 className="fw-bold mb-0">{boutique.nom} {boutique.type === 'Centrale' && <Badge bg="primary" pill>Dépôt Principal</Badge>}</h5>
                                    <Badge bg="primary-subtle" text="primary-emphasis" className="p-2 fs-6 mt-1">
                                        {outOfStockMap[boutique._id] && (
                                            <span className="blink-animation me-2">
                                                <iconify-icon icon="solar:danger-triangle-bold" className="me-1"></iconify-icon>
                                                Besoin de réapprovisionnement
                                            </span>
                                        )}
                                        Valeur totale: {formatCurrency(totalStockValue)}
                                    </Badge>
                                </div>
                            </Card.Header>
                            <Card.Body className="p-0">
                                <Table responsive hover className="align-middle mb-0">
                                    <thead className="bg-body-tertiary">
                                        <tr>
                                            <th className="ps-4 border-0 text-muted small text-uppercase">Img</th>
                                            <th className="ps-4 border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('code')}>Code {getSortIcon('code')}</th>
                                            <th className="ps-4 border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('nom')}>Produit {getSortIcon('nom')}</th>
                                            {isCentral && <th className="ps-4 border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('fournisseur')}>Fournisseur {getSortIcon('fournisseur')}</th>}
                                            <th className="text-center border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('quantite')}>unite Disponible {getSortIcon('quantite')}</th>
                                            <th className="text-end border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('prixAchat')}>Prix d'Achat {getSortIcon('prixAchat')}</th>
                                            <th className="text-end border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('prixVente')}>Prix de Vente {getSortIcon('prixVente')}</th>
                                            <th className="text-end border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('margeUnitaire')}>Marge Unitaire {getSortIcon('margeUnitaire')}</th>
                                            <th className="text-end border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('margePourcent')}>Marge (%) {getSortIcon('margePourcent')}</th>
                                            <th className="text-end border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('valeurStock')}>Valeur Stock {getSortIcon('valeurStock')}</th>
                                            <th className="text-center border-0 text-muted small text-uppercase">Seuil d'Alerte</th>
                                            <th className="text-center pe-4 border-0 text-muted small text-uppercase">Statut</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedBoutiqueArticles.length > 0 ? sortedBoutiqueArticles.map(article => {
                                            const margeUnitaire = (Number(article.prixVente) || 0) - (Number(article.prixAchat) || 0);
                                            const margePourcentage = Number(article.prixVente) > 0 ? (margeUnitaire / Number(article.prixVente)) * 100 : 0;

                                            return (
                                                <tr key={article._id}>
                                                    <td className="ps-4">{article.image ? <img src={article.image} alt="" className="rounded shadow-sm" style={{ width: '35px', height: '35px', objectFit: 'cover' }} /> : <span className="text-muted small">-</span>}</td>
                                                    <td className="ps-4 text-muted small">{article.code || '-'}</td>
                                                    <td className="ps-4 fw-bold">{article.nom}</td>
                                                    {isCentral && <td className="ps-4">{article.fournisseur?.nom || <Badge bg="secondary">Non spécifié</Badge>}</td>}
                                                    <td className="text-center">{article.quantite}</td>
                                                    <td className="text-end text-danger">{formatCurrency(article.prixAchat)}</td>
                                                    <td className="text-end text-success">{formatCurrency(article.prixVente)}</td>
                                                    <td className="text-end text-primary fw-bold">{formatCurrency(margeUnitaire)}</td>
                                                    <td className="text-end text-primary">{margePourcentage.toFixed(1)}%</td>
                                                    <td className="text-end fw-bold">{formatCurrency((Number(article.quantite) || 0) * (Number(article.prixAchat) || 0))}</td>
                                                    <td className="text-center text-muted">{article.seuilAlerte || 10}</td>
                                                    <td className="text-center pe-4">{getStatusBadge(article.quantite, article.seuilAlerte)}</td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={columnCount} className="text-center text-muted p-4">Aucun article dans cette boutique.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    );
                })}

            {(!boutiques || boutiques.length === 0) && (
                <Alert variant="info">Aucune boutique n'a été configurée.</Alert>
            )}
        </div>
    );
};

export default StockStatusView;