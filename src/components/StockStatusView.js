
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Spinner, Alert, Table, Badge, Form, Row, Col, Button } from 'react-bootstrap';
import { articleAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const blinkAnimationStyle = `
.blink-animation { animation: blinker 1.5s linear infinite; }
@keyframes blinker { 50% { opacity: 0.3; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('stock-blink-style')) {
    const style = document.createElement('style');
    style.id = 'stock-blink-style';
    style.innerText = blinkAnimationStyle;
    document.head.appendChild(style);
}

const formatCurrency = (value) => {
    const num = Number(value);
    return ((Number.isFinite(num) ? num : 0).toLocaleString('fr-FR') + ' GNF')
        .replace(/[\u00a0\u202f]/g, ' ');
};

const getId = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        return String(value._id ?? value.storeId ?? value.supplierId ?? value.id ?? '');
    }
    return String(value);
};

const getBoutiqueId = (article) =>
    getId(article.boutique ?? article.storeId ?? article.boutiqueId);

const getFournisseurId = (article) =>
    getId(article.fournisseur ?? article.fournisseurId ?? article.supplierId);

const getSeuil = (article) => {
    const seuil = Number(article.seuilAlerte ?? 10);
    return Number.isFinite(seuil) ? seuil : 10;
};

const getStockStatus = (article) => {
    const qty = Number(article.quantite) || 0;
    if (qty <= 0) return 'rupture';
    if (qty <= getSeuil(article)) return 'reapprovisionnement';
    return 'en-stock';
};

const getArray = (response, keys = []) => {
    if (Array.isArray(response)) return response;
    const data = response?.data ?? response;
    if (Array.isArray(data)) return data;

    for (const key of keys) {
        if (Array.isArray(data?.[key])) return data[key];
        if (Array.isArray(data?.data?.[key])) return data.data[key];
    }

    if (Array.isArray(data?.data)) return data.data;
    return [];
};

const StockStatusView = () => {
    const [allArticles, setAllArticles] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [centralShopId, setCentralShopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [filterStatus, setFilterStatus] = useState('all');
    const [filterBoutique, setFilterBoutique] = useState('all');
    const [filterFournisseur, setFilterFournisseur] = useState('all');

    const [sortConfig, setSortConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('stockStatusSort');
            return saved ? JSON.parse(saved) : { key: 'nom', direction: 'asc' };
        } catch {
            return { key: 'nom', direction: 'asc' };
        }
    });

    useEffect(() => {
        localStorage.setItem('stockStatusSort', JSON.stringify(sortConfig));
    }, [sortConfig]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            const [articlesRes, boutiquesRes, fournisseursRes] = await Promise.all([
                articleAPI.getAll({ limit: 0 }),
                boutiqueAPI.getAll(),
                fournisseurAPI.getAll()
            ]);

            const articles = getArray(articlesRes, ['articles', 'items', 'results']);
            const stores = getArray(boutiquesRes, ['boutiques', 'stores', 'items'])
                .sort((a, b) =>
                    String(a.nom ?? a.vcStoreName ?? '').localeCompare(
                        String(b.nom ?? b.vcStoreName ?? '')
                    )
                );
            const suppliers = getArray(fournisseursRes, ['fournisseurs', 'suppliers', 'items']);

            const centrale = stores.find(b =>
                b.type === 'Centrale' || b.type === 'Bar' ||
                b.storeTypeCode === 'STORE'
            );

            setCentralShopId(centrale ? getId(centrale) : null);
            setAllArticles(articles);
            setBoutiques(stores);
            setFournisseurs(suppliers);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Erreur lors du chargement de l'état des stocks."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredArticles = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();

        return allArticles.filter(article => {
            const boutiqueId = getBoutiqueId(article);
            const fournisseurId = getFournisseurId(article);
            const status = getStockStatus(article);

            const matchesSearch =
                !search ||
                String(article.nom ?? article.vcProductName ?? '')
                    .toLowerCase().includes(search) ||
                String(article.code ?? article.vcProductCode ?? '')
                    .toLowerCase().includes(search);

            const matchesBoutique =
                filterBoutique === 'all' ||
                boutiqueId === String(filterBoutique);

            const matchesFournisseur =
                filterFournisseur === 'all' ||
                fournisseurId === String(filterFournisseur);

            const matchesStatus =
                filterStatus === 'all' ||
                status === filterStatus;

            return matchesSearch &&
                matchesBoutique &&
                matchesFournisseur &&
                matchesStatus;
        });
    }, [
        allArticles,
        searchTerm,
        filterBoutique,
        filterFournisseur,
        filterStatus
    ]);

    const resetAllFilters = () => {
        setSearchTerm('');
        setFilterStatus('all');
        setFilterBoutique('all');
        setFilterFournisseur('all');
        setSortConfig({ key: 'nom', direction: 'asc' });
    };

    const handleSort = (key) => {
        setSortConfig(previous => ({
            key,
            direction: previous.key === key && previous.direction === 'asc'
                ? 'desc'
                : 'asc'
        }));
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) {
            return <iconify-icon icon="solar:sort-vertical-linear" className="ms-1 align-middle opacity-50" />;
        }

        return sortConfig.direction === 'asc'
            ? <iconify-icon icon="solar:sort-from-top-to-bottom-bold" className="ms-1 align-middle text-primary" />
            : <iconify-icon icon="solar:sort-from-bottom-to-top-bold" className="ms-1 align-middle text-primary" />;
    };

    const getStatusBadge = (article) => {
        const status = getStockStatus(article);

        if (status === 'rupture') {
            return <Badge bg="danger">Rupture de Stock</Badge>;
        }

        if (status === 'reapprovisionnement') {
            return <Badge bg="warning" text="dark">Réapprovisionnement</Badge>;
        }

        return <Badge bg="success">En Stock</Badge>;
    };

    const financialTotals = useMemo(() => {
        return filteredArticles.reduce((acc, article) => {
            const qty = Number(article.quantite) || 0;
            acc.buy += qty * (Number(article.prixAchat) || 0);
            acc.sell += qty * (Number(article.prixVente) || 0);
            return acc;
        }, { buy: 0, sell: 0 });
    }, [filteredArticles]);

    const { groupedArticles, outOfStockMap } = useMemo(() => {
        const grouped = {};
        const outOfStock = {};

        filteredArticles.forEach(article => {
            const id = getBoutiqueId(article) || 'unassigned';

            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(article);

            if (getStockStatus(article) === 'rupture') {
                outOfStock[id] = true;
            }
        });

        return { groupedArticles: grouped, outOfStockMap: outOfStock };
    }, [filteredArticles]);

    const handleExportExcel = () => {
        if (!filteredArticles.length) {
            alert("Aucune donnée à exporter.");
            return;
        }

        const rows = filteredArticles.map(a => ({
            Boutique: a.boutique?.nom || a.boutique?.vcStoreName || 'N/A',
            Code: a.code || '-',
            Produit: a.nom,
            Fournisseur: a.fournisseur?.nom || 'N/A',
            Quantité: Number(a.quantite) || 0,
            'Prix Achat (GNF)': Number(a.prixAchat) || 0,
            'Prix Vente (GNF)': Number(a.prixVente) || 0,
            'Marge Unitaire (GNF)': (Number(a.prixVente) || 0) - (Number(a.prixAchat) || 0),
            'Valeur Stock Achat (GNF)': (Number(a.quantite) || 0) * (Number(a.prixAchat) || 0),
            Statut: getStockStatus(a) === 'rupture'
                ? 'Rupture'
                : getStockStatus(a) === 'reapprovisionnement'
                    ? 'Faible'
                    : 'En Stock'
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Etat_Stocks');
        XLSX.writeFile(workbook, `etat_global_stocks_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleExportPDF = () => {
        if (!filteredArticles.length) {
            alert("Aucune donnée à exporter.");
            return;
        }

        const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

        try {
            doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        } catch (e) {}

        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.text("État Global des Stocks", 60, 16);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 60, 22);

        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(220, 220, 220);
        doc.roundedRect(14, 28, 269, 10, 1, 1, 'FD');

        doc.setFontSize(10).setTextColor(50).setFont('helvetica', 'bold');
        doc.text(`Valeur Achat : ${formatCurrency(financialTotals.buy)}`, 20, 34.5);
        doc.text(`Valeur Vente : ${formatCurrency(financialTotals.sell)}`, 110, 34.5);
        doc.setTextColor(41, 128, 185);
        doc.text(`Marge Estimée : ${formatCurrency(financialTotals.sell - financialTotals.buy)}`, 200, 34.5);

        const columns = [
            'Boutique', 'Produit', 'Code', 'Fournisseur', 'Qté',
            'P. Achat', 'P. Vente', 'Valeur Stock', 'Statut'
        ];

        const rows = filteredArticles.map(a => [
            a.boutique?.nom || a.boutique?.vcStoreName || 'N/A',
            a.nom || '-',
            a.code || '-',
            a.fournisseur?.nom || 'N/A',
            Number(a.quantite) || 0,
            formatCurrency(a.prixAchat),
            formatCurrency(a.prixVente),
            formatCurrency((Number(a.quantite) || 0) * (Number(a.prixAchat) || 0)),
            getStockStatus(a) === 'rupture'
                ? 'Rupture'
                : getStockStatus(a) === 'reapprovisionnement'
                    ? 'Faible'
                    : 'En Stock'
        ]);

        autoTable(doc, {
            head: [columns],
            body: rows,
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
            const pageHeight = pageSize.height || pageSize.getHeight();

            doc.text('StockDash - Inventaire', 14, pageHeight - 10);
            doc.text(
                `Page ${i} sur ${pageCount}`,
                pageSize.width - 20,
                pageHeight - 10,
                { align: 'right' }
            );
        }

        doc.save(`etat_stocks_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    if (loading) {
        return (
            <div className="p-4 text-center">
                <Spinner animation="border" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4">
                <Alert variant="danger">{error}</Alert>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">État des Stocks par Boutique</h3>

                <div className="d-flex gap-2">
                    <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle" />
                        Exporter Excel
                    </Button>

                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle" />
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
                            <iconify-icon icon="solar:cart-large-minimalistic-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }} />
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
                            <iconify-icon icon="solar:tag-price-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }} />
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
                            <iconify-icon icon="solar:graph-up-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }} />
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
                                <Form.Select
                                    value={filterBoutique}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setFilterBoutique(id);

                                        if (id !== centralShopId) {
                                            setFilterFournisseur('all');
                                        }
                                    }}
                                >
                                    <option value="all">Toutes les boutiques</option>
                                    {boutiques.map(b => (
                                        <option key={getId(b)} value={getId(b)}>
                                            {b.nom || b.vcStoreName}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>

                        {filterBoutique === centralShopId && (
                            <Col md={2}>
                                <Form.Group>
                                    <Form.Label className="small fw-bold">Filtrer par fournisseur</Form.Label>
                                    <Form.Select
                                        value={filterFournisseur}
                                        onChange={e => setFilterFournisseur(e.target.value)}
                                    >
                                        <option value="all">Tous les fournisseurs</option>
                                        {fournisseurs.map(f => (
                                            <option key={getId(f)} value={getId(f)}>
                                                {f.nom || f.vcSupplierName}
                                            </option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        )}

                        <Col md={filterBoutique === centralShopId ? 2 : 3}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Filtrer par état du stock</Form.Label>
                                <Form.Select
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                >
                                    <option value="all">Tous les états</option>
                                    <option value="rupture">Rupture de Stock</option>
                                    <option value="reapprovisionnement">Réapprovisionnement</option>
                                    <option value="en-stock">En Stock</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>

                        <Col md="auto" className="ms-auto d-flex gap-2 align-self-end pb-1">
                            {(sortConfig.key !== 'nom' ||
                                sortConfig.direction !== 'asc' ||
                                filterStatus !== 'all' ||
                                filterBoutique !== 'all' ||
                                filterFournisseur !== 'all' ||
                                searchTerm !== '') && (
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={resetAllFilters}
                                    className="rounded-pill shadow-sm d-flex align-items-center"
                                    title="Réinitialiser tous les filtres et le tri"
                                >
                                    <iconify-icon icon="solar:restart-bold" className="me-1 align-middle" />
                                    Réinitialiser
                                </Button>
                            )}
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {boutiques
                .filter(b => filterBoutique === 'all' || getId(b) === String(filterBoutique))
                .map(boutique => {
                    const boutiqueId = getId(boutique);
                    const boutiqueArticles = groupedArticles[boutiqueId] || [];

                    const totalStockValue = boutiqueArticles.reduce(
                        (sum, a) =>
                            sum + (Number(a.quantite) || 0) * (Number(a.prixAchat) || 0),
                        0
                    );

                    const isCentral = boutique.type === 'Centrale';

                    const sortedBoutiqueArticles = [...boutiqueArticles].sort((a, b) => {
                        const getValue = article => {
                            switch (sortConfig.key) {
                                case 'nom':
                                    return String(article.nom || '').toLowerCase();
                                case 'code':
                                    return String(article.code || '').toLowerCase();
                                case 'fournisseur':
                                    return String(article.fournisseur?.nom || '').toLowerCase();
                                case 'quantite':
                                    return Number(article.quantite) || 0;
                                case 'prixAchat':
                                    return Number(article.prixAchat) || 0;
                                case 'prixVente':
                                    return Number(article.prixVente) || 0;
                                case 'valeurStock':
                                    return (Number(article.quantite) || 0) * (Number(article.prixAchat) || 0);
                                case 'margeUnitaire':
                                    return (Number(article.prixVente) || 0) - (Number(article.prixAchat) || 0);
                                case 'margePourcent': {
                                    const vente = Number(article.prixVente) || 0;
                                    const achat = Number(article.prixAchat) || 0;
                                    return vente > 0 ? (vente - achat) / vente : 0;
                                }
                                default:
                                    return article[sortConfig.key];
                            }
                        };

                        const aValue = getValue(a);
                        const bValue = getValue(b);

                        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                        return 0;
                    });

                    const columnCount = 11 + (isCentral ? 1 : 0);

                    return (
                        <Card
                            key={boutiqueId}
                            className={`border-0 shadow-sm rounded-4 mb-4 ${boutique.type === 'Bar' ? 'bar-card-header' : ''}`}
                        >
                            <Card.Header className="bg-body py-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
                                <div>
                                    <h5 className="fw-bold mb-0">
                                        {boutique.nom || boutique.vcStoreName}
                                        {isCentral && <Badge bg="primary" pill className="ms-2">Dépôt Principal</Badge>}
                                    </h5>

                                    <Badge bg="primary-subtle" text="primary-emphasis" className="p-2 fs-6 mt-1">
                                        {outOfStockMap[boutiqueId] && (
                                            <span className="blink-animation me-2">
                                                <iconify-icon icon="solar:danger-triangle-bold" className="me-1" />
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
                                            <th className="text-center border-0 text-muted small text-uppercase cursor-pointer" onClick={() => handleSort('quantite')}>Unité Disponible {getSortIcon('quantite')}</th>
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
                                        {sortedBoutiqueArticles.length > 0 ? (
                                            sortedBoutiqueArticles.map((article, index) => {
                                                const achat = Number(article.prixAchat) || 0;
                                                const vente = Number(article.prixVente) || 0;
                                                const qty = Number(article.quantite) || 0;
                                                const margeUnitaire = vente - achat;
                                                const margePourcentage = vente > 0
                                                    ? (margeUnitaire / vente) * 100
                                                    : 0;

                                                return (
                                                    <tr key={article._id || article.articleId || index}>
                                                        <td className="ps-4">
                                                            {article.image ? (
                                                                <img
                                                                    src={article.image}
                                                                    alt=""
                                                                    className="rounded shadow-sm"
                                                                    style={{ width: '35px', height: '35px', objectFit: 'cover' }}
                                                                />
                                                            ) : <span className="text-muted small">-</span>}
                                                        </td>

                                                        <td className="ps-4 text-muted small">{article.code || '-'}</td>
                                                        <td className="ps-4 fw-bold">{article.nom}</td>

                                                        {isCentral && (
                                                            <td className="ps-4">
                                                                {article.fournisseur?.nom || <Badge bg="secondary">Non spécifié</Badge>}
                                                            </td>
                                                        )}

                                                        <td className="text-center">{qty}</td>
                                                        <td className="text-end text-danger">{formatCurrency(achat)}</td>
                                                        <td className="text-end text-success">{formatCurrency(vente)}</td>
                                                        <td className="text-end text-primary fw-bold">{formatCurrency(margeUnitaire)}</td>
                                                        <td className="text-end text-primary">{margePourcentage.toFixed(1)}%</td>
                                                        <td className="text-end fw-bold">{formatCurrency(qty * achat)}</td>
                                                        <td className="text-center text-muted">{getSeuil(article)}</td>
                                                        <td className="text-center pe-4">{getStatusBadge(article)}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={columnCount} className="text-center text-muted p-4">
                                                    Aucun article correspondant aux filtres.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    );
                })}

            {boutiques.length === 0 && (
                <Alert variant="info">Aucune boutique n'a été configurée.</Alert>
            )}
        </div>
    );
};

export default StockStatusView;
