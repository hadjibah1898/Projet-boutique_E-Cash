// src/components/Dashboard.js
// Tableau de bord principal pour les administrateurs
// Affiche les statistiques clés, les graphiques et les raccourcis vers les fonctionnalités principales
// Permet de visualiser rapidement l'état du stock et les performances

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Row, Col, Card, Alert, Table, Badge, Button, Pagination, Placeholder, Toast, ToastContainer, Modal, Form, Spinner } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { dashboardAPI, articleAPI, clientAPI, caisseAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';
import logo from '../assets/logo.png';
import { boutiqueAPI } from '../services/api';
import { playSuccessSound } from '../utils/audioUtils';
import { getOfflineVentesCount, syncVentes } from '../utils/offlineSync';

// Helper to safely convert value to number
const safeNum = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value.$numberDecimal) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  return 0;
};

const formatCurrency = (value) => {
  return (safeNum(value).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

// --- Composants Modernes UI ---
const HoverCard = ({ children, className = "", style = {}, ...props }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Card
      className={`border-0 shadow-sm ${className}`}
      style={{
        ...style,
        transform: isHovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        boxShadow: isHovered ? '0 1rem 3rem rgba(0,0,0,.175) !important' : '0 .125rem .25rem rgba(0,0,0,.075)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </Card>
  );
};

const DashboardSkeleton = () => (
  <div className="dashboard-content p-4">
    <Card className="border-0 mb-4 shadow-sm" style={{ height: '200px', backgroundColor: '#e9ecef' }}>
      <Card.Body className="p-4 d-flex flex-column justify-content-center">
        <Placeholder as="h2" animation="glow"><Placeholder xs={6} /></Placeholder>
        <Placeholder as="p" animation="glow"><Placeholder xs={4} /> <Placeholder xs={3} /></Placeholder>
      </Card.Body>
    </Card>
    <Row className="mb-4 g-4">
      {[1, 2, 3].map(i => (
        <Col md={4} key={i}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-4">
              <Placeholder as="div" animation="glow" className="d-flex align-items-center">
                <Placeholder xs={3} style={{ height: '50px', width: '50px' }} className="rounded-circle me-3" />
                <div className="w-100">
                  <Placeholder xs={5} />
                  <Placeholder xs={8} size="lg" />
                </div>
              </Placeholder>
            </Card.Body>
          </Card>
        </Col>
      ))}
    </Row>
    <Row className="g-4">
      <Col lg={8}><Card className="border-0 shadow-sm" style={{ height: '400px' }}><Card.Body><Placeholder animation="glow" className="w-100 h-100" /></Card.Body></Card></Col>
      <Col lg={4}><Card className="border-0 shadow-sm" style={{ height: '400px' }}><Card.Body><Placeholder animation="glow" className="w-100 h-100" /></Card.Body></Card></Col>
    </Row>
  </div>
);

const Dashboard = () => {
  const { theme, userRole } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [lowStockArticles, setLowStockArticles] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [rapports, setRapports] = useState([]);
  const [allArticles, setAllArticles] = useState([]);
  const [evolutionData, setEvolutionData] = useState([]);
  const [isDetailedDebt, setIsDetailedDebt] = useState(false);
  const [isDetailedSales, setIsDetailedSales] = useState(false);
  const [salesMetric, setSalesMetric] = useState('ca');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', variant: 'light' });
  const [timeRange, setTimeRange] = useState('monthly');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [offlineCount, setOfflineCount] = useState(0);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ sourceId: '', targetId: '', articleId: '', articleName: '', maxQuantity: 0, availableStock: 0 });
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferLoading, setTransferLoading] = useState(false);
  const [centralShopId, setCentralShopId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ✅ Normalisation du rôle pour éviter les bugs de casse (Admin vs ADMIN)
  const isAdmin = userRole?.toUpperCase() === 'ADMIN' || userRole?.toUpperCase() === 'SUPER_ADMIN';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [statsRes, articlesRes, boutiquesRes, evolutionRes, rapportsRes] = await Promise.all([
          dashboardAPI.getStats({ range: timeRange }),
          articleAPI.getAll(),
          boutiqueAPI.getAll(),
          clientAPI.getDebtEvolution(),
          caisseAPI.listerRapports({ limit: 100 })
        ]);

        // ✅ CORRECTION : L'intercepteur Axios a déjà extrait les données (pas de .data)
        let statsData = statsRes || {};
        const fetchedArticles = Array.isArray(articlesRes) ? articlesRes : (articlesRes?.data || []);
        const allBoutiques = Array.isArray(boutiquesRes) ? boutiquesRes : (boutiquesRes?.data || []);
        const debtEvo = Array.isArray(evolutionRes) ? evolutionRes : (evolutionRes?.data || []);
        const allRapports = Array.isArray(rapportsRes) ? rapportsRes : (rapportsRes?.data || []);

        setEvolutionData(debtEvo);

        const centrale = allBoutiques.find(b => b.type === 'Centrale' || b.type === 'Bar');
        if (centrale) setCentralShopId(centrale._id);

        setStats(statsData);
        setBoutiques(allBoutiques);
        setRapports(allRapports);
        setAllArticles(fetchedArticles);

        const lowStockItems = fetchedArticles.filter(a => safeNum(a.quantite) <= (a.seuilAlerte || 10));
        setLowStockArticles(lowStockItems);

        const userId = localStorage.getItem('userId');
        if (userId) {
          const count = await getOfflineVentesCount(userId);
          setOfflineCount(count);
        }

      } catch (err) {
        setToast({ show: true, message: err.response?.data?.message || "Erreur lors du chargement des statistiques.", variant: 'danger' });
        setStats({
          dailySales: 0, dailyOrders: 0, totalCA: 0, totalRefunds: 0, totalBenefice: 0,
          salesProfit: { categories: [], series: [] },
          productSales: { labels: [], series: [] },
          performanceBoutiques: [],
          performanceGerants: [],
          stockBoutiques: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [timeRange, refreshTrigger]);

  const handleSyncManual = async () => {
    if (isAdmin) return;
    const userId = localStorage.getItem('userId');
    const result = await syncVentes(userId);
    if (result.success > 0) {
      setToast({ show: true, message: `${result.success} ventes synchronisées !`, variant: 'success' });
      playSuccessSound();
      setRefreshTrigger(prev => prev + 1);
    }
    const count = await getOfflineVentesCount(userId);
    setOfflineCount(count);
  };

  const textColor = theme === 'dark' ? '#cdd9e5' : '#373d3f';
  const gridColor = theme === 'dark' ? '#444c56' : '#f1f1f1';
  const cardBg = theme === 'dark' ? '#22272e' : '#ffffff';

  const processedSalesSeries = useMemo(() => {
    if (!stats?.detailedSales || !Array.isArray(stats.detailedSales) || !stats?.salesProfit?.categories) return [];
    const categories = stats.salesProfit.categories;
    const metricName = salesMetric === 'ca' ? "Chiffre d'affaires" : "Bénéfice Net";

    if (!isDetailedSales) {
      const dataMap = new Array(categories.length).fill(0);
      stats.detailedSales.forEach(item => {
        if (item.unit) dataMap[item.unit - 1] += safeNum(item[salesMetric]);
      });
      return [{ name: metricName, data: dataMap }];
    } else {
      const uniqueBoutiques = [...new Set(stats.detailedSales.map(d => d.boutique))];
      return uniqueBoutiques.map(bName => {
        const data = new Array(categories.length).fill(0);
        stats.detailedSales.filter(d => d.boutique === bName).forEach(item => {
          if (item.unit) data[item.unit - 1] = safeNum(item[salesMetric]);
        });
        return { name: bName, data };
      });
    }
  }, [stats, isDetailedSales, salesMetric]);

  const salesChartOptions = {
    chart: { type: 'area', toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor },
    colors: isDetailedSales ? undefined : (salesMetric === 'ca' ? ['#0d6efd'] : ['#198754']),
    legend: { show: isDetailedSales, position: 'top', labels: { colors: textColor } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
    xaxis: { categories: stats?.salesProfit?.categories || [] },
    tooltip: { theme: theme },
    grid: { borderColor: gridColor }
  };

  const productChartOptions = {
    chart: { type: 'donut', fontFamily: 'inherit', foreColor: textColor },
    labels: stats?.productSales?.labels || [],
    colors: ['#0d6efd', '#198754', '#ffc107'],
    plotOptions: {
      pie: {
        donut: {
          size: '75%',
          labels: {
            show: true,
            total: { show: true, label: 'Total', color: textColor, fontSize: '16px', fontWeight: 600 },
            value: { color: textColor }
          }
        }
      }
    },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    stroke: { show: true, colors: [cardBg], width: 2 }
  };

  const processedDebtData = useMemo(() => {
    if (!evolutionData || !Array.isArray(evolutionData) || evolutionData.length === 0) return { categories: [], series: [], totalLatest: 0 };
    const uniqueDates = [...new Set(evolutionData.map(d => d.date))].sort();

    if (isDetailedDebt) {
      const uniqueBoutiques = [...new Set(evolutionData.map(d => d.boutiqueName))];
      const series = uniqueBoutiques.map(bName => {
        let runningTotal = 0;
        const data = uniqueDates.map(date => {
          const dailyEntries = evolutionData.filter(d => d.date === date && d.boutiqueName === bName);
          runningTotal += dailyEntries.reduce((acc, curr) => acc + safeNum(curr.netChange), 0);
          return runningTotal;
        });
        return { name: bName, data };
      });
      const totalLatest = series.reduce((sum, s) => sum + s.data[s.data.length - 1], 0);
      return { categories: uniqueDates, series, totalLatest };
    } else {
      let globalRunningTotal = 0;
      const data = uniqueDates.map(date => {
        const dailyNetChange = evolutionData.filter(d => d.date === date).reduce((acc, curr) => acc + safeNum(curr.netChange), 0);
        globalRunningTotal += dailyNetChange;
        return globalRunningTotal;
      });
      return { categories: uniqueDates, series: [{ name: "Dette Totale", data }], totalLatest: globalRunningTotal };
    }
  }, [evolutionData, isDetailedDebt]);

  const debtEvolutionChartOptions = {
    chart: { type: 'area', toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor },
    colors: isDetailedDebt ? undefined : ['#dc3545'],
    legend: { show: isDetailedDebt, position: 'top', labels: { colors: textColor } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1, stops: [0, 100] } },
    xaxis: { type: 'datetime', categories: processedDebtData.categories },
    yaxis: { title: { text: 'Montant Total des Dettes (GNF)' } },
    tooltip: {
      theme: theme,
      x: { format: 'dd MMM yyyy' },
      y: { formatter: function (val) { return safeNum(val).toLocaleString('fr-FR') + " GNF" } }
    },
    grid: { borderColor: gridColor }
  };
  const debtEvolutionChartSeries = processedDebtData.series;

  // ✅ CORRECTION ICI : Gestion des noms de champs SQL (dtCreatedAt, mDifferenceAmount)
  const ecartsChartData = useMemo(() => {
    if (!rapports || !Array.isArray(rapports)) {
      return { options: { chart: { type: 'bar', stacked: true, toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor } }, series: [] };
    }
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const uniqueBoutiques = [...new Set(rapports.map(r => r.boutique?.nom || r.storeName || r.vcStoreName || 'Boutique Inconnue'))];

    const series = uniqueBoutiques.map(boutiqueNom => {
      const data = last7Days.map(date => {
        return rapports
          .filter(r => {
            const dateStr = r.createdAt || r.dtCreatedAt;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            
            const currentBoutique = r.boutique?.nom || r.storeName || r.vcStoreName || 'Boutique Inconnue';
            
            return d.toISOString().split('T')[0] === date && currentBoutique === boutiqueNom;
          })
          .reduce((acc, r) => {
            const ecartValue = r.mDifferenceAmount !== undefined ? r.mDifferenceAmount : r.ecart;
            return acc + safeNum(ecartValue);
          }, 0);
      });
      return { name: boutiqueNom, data };
    });

    return {
      options: {
        chart: { type: 'bar', stacked: true, toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor },
        plotOptions: { bar: { columnWidth: '70%', borderRadius: 4 } },
        xaxis: { categories: last7Days.map(d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })) },
        yaxis: { title: { text: 'Écart (GNF)' } },
        tooltip: { theme: theme, y: { formatter: (val) => val.toLocaleString() + ' GNF' } },
        legend: { position: 'top', labels: { colors: textColor } },
        grid: { borderColor: gridColor }
      },
      series: series
    };
  }, [rapports, theme, textColor, gridColor]);

  const boutiquePerformanceChart = useMemo(() => {
    if (!stats?.performanceBoutiques || !Array.isArray(stats.performanceBoutiques)) return null;
    return {
      series: [{ name: "Chiffre d'affaires", data: stats.performanceBoutiques.map(b => safeNum(b.chiffreAffaires)) }],
      options: {
        chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'inherit' },
        plotOptions: { bar: { borderRadius: 4, horizontal: true, dataLabels: { position: 'top' } } },
        colors: ['#0d6efd'],
        dataLabels: { enabled: true, formatter: (val) => formatCurrency(val), style: { fontSize: '10px', colors: [textColor] } },
        xaxis: { categories: stats.performanceBoutiques.map(b => b.nom), labels: { show: false } },
        tooltip: { theme: theme, y: { formatter: (val) => formatCurrency(val) } }
      }
    };
  }, [stats, theme, textColor]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLowStockArticles = Array.isArray(lowStockArticles) ? lowStockArticles.slice(indexOfFirstItem, indexOfLastItem) : [];
  const totalPages = Math.ceil(lowStockArticles.length / itemsPerPage);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    let finalY = 0;

    try { doc.addImage(logo, 'PNG', 14, 8, 40, 15); } catch (e) { }
    doc.setFontSize(18);
    doc.setTextColor(41, 128, 185);
    doc.setFont("helvetica", "bold");
    doc.text("Rapport de Synthèse - Dashboard Admin", 60, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 60, 22);
    finalY = 35;

    doc.setFontSize(14);
    doc.setTextColor(41, 128, 185);
    doc.text("Indicateurs Clés", 14, finalY);
    finalY += 5;

    const summaryData = [
      ['Ventes du Jour', formatCurrency(safeNum(stats?.dailySales))],
      ['Commandes du Jour', safeNum(stats?.dailyOrders)],
      ['Recouvrement du Jour', formatCurrency(safeNum(stats?.dailyRecoveries))],
      ['Chiffre d\'Affaires Total', formatCurrency(safeNum(stats?.totalCA))],
      ['Bénéfice Net Total', formatCurrency(safeNum(stats?.totalBenefice))],
      ['Dette Totale Actuelle', formatCurrency(safeNum(processedDebtData.totalLatest))],
      ['Articles en Stock Faible', `${lowStockArticles.length} article(s)`],
    ];

    autoTable(doc, {
      startY: finalY,
      body: summaryData,
      theme: 'grid',
      styles: { fontStyle: 'bold', fontSize: 10 },
      columnStyles: { 0: { fillColor: [245, 247, 250], textColor: 50 }, 1: { halign: 'right' } }
    });
    finalY = doc.lastAutoTable.finalY + 10;

    if (stats?.performanceBoutiques?.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(41, 128, 185);
      doc.text("Répartition du Chiffre d'Affaires par Boutique", 14, finalY);
      finalY += 5;

      const totalCA = stats.performanceBoutiques.reduce((sum, b) => sum + (b.chiffreAffaires || 0), 0);
      const maxCA = Math.max(...stats.performanceBoutiques.map(b => b.chiffreAffaires || 0));

      autoTable(doc, {
        startY: finalY,
        head: [['Boutique', 'Chiffre d\'Affaires', '% Contribution', 'Volume']],
        body: stats.performanceBoutiques.map(b => {
          const percentage = totalCA > 0 ? ((b.chiffreAffaires / totalCA) * 100).toFixed(1) : 0;
          return [b.nom, formatCurrency(b.chiffreAffaires), `${percentage}%`, ''];
        }),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { cellWidth: 40 } },
        didDrawCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const rowIndex = data.row.index;
            const boutiqueCA = stats.performanceBoutiques[rowIndex].chiffreAffaires || 0;
            const barWidth = maxCA > 0 ? (boutiqueCA / maxCA) * 30 : 0;
            doc.setFillColor(230, 230, 230);
            doc.rect(data.cell.x + 2, data.cell.y + 4, 30, 3, 'F');
            doc.setFillColor(41, 128, 185);
            doc.rect(data.cell.x + 2, data.cell.y + 4, barWidth, 3, 'F');
          }
        }
      });
      finalY = doc.lastAutoTable.finalY + 10;
    }

    if (stats?.performanceGerants?.length > 0) {
      if (finalY > pageHeight - 40) { doc.addPage(); finalY = 20; }
      doc.setFontSize(14);
      doc.setTextColor(41, 128, 185);
      doc.text("Performance par Gérant", 14, finalY);
      finalY += 5;
      autoTable(doc, {
        startY: finalY,
        head: [['Gérant', 'Boutique', 'Chiffre d\'Affaires']],
        body: stats.performanceGerants.map(g => [g.nom, g.boutiqueNom || 'N/A', formatCurrency(safeNum(g.chiffreAffaires))]),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        columnStyles: { 2: { halign: 'right' } }
      });
      finalY = doc.lastAutoTable.finalY + 10;
    }

    if (stats?.productSales?.labels?.length > 0) {
      if (finalY > pageHeight - 40) { doc.addPage(); finalY = 20; }
      doc.setFontSize(14);
      doc.setTextColor(41, 128, 185);
      doc.text("Top 5 des Articles les plus Vendus", 14, finalY);
      finalY += 5;
      autoTable(doc, {
        startY: finalY,
        head: [['Article', 'Quantité Vendue']],
        body: stats.productSales.labels.map((label, index) => [label, safeNum(stats.productSales.series[index])]),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        columnStyles: { 1: { halign: 'center' } }
      });
      finalY = doc.lastAutoTable.finalY + 10;
    }

    if (lowStockArticles.length > 0) {
      if (finalY > pageHeight - 50) { doc.addPage(); finalY = 20; }
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Alerte Stock Faible (max 10 unites)", 14, finalY);
      finalY += 5;
      autoTable(doc, {
        startY: finalY,
        head: [['Article', 'Boutique', 'Quantité Restante']],
        body: lowStockArticles.map(a => [a.nom, a.boutique?.nom || 'N/A', safeNum(a.quantite)]),
        theme: 'striped',
        headStyles: { fillColor: [220, 53, 69] },
        columnStyles: { 2: { halign: 'center' } }
      });
      finalY = doc.lastAutoTable.finalY + 10;
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`StockDash - Rapport Admin`, 14, pageHeight - 10);
      doc.text(`Page ${i} sur ${pageCount}`, doc.internal.pageSize.width - 14, pageHeight - 10, { align: 'right' });
    }

    doc.save(`rapport_synthese_admin_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleLowStockAction = useCallback((article) => {
    if (article.boutique && article.boutique.type !== 'Centrale' && centralShopId) {
      const centralArticle = allArticles.find(a =>
        (a.boutique?._id?.toString() === centralShopId?.toString() || a.boutique?.toString() === centralShopId?.toString()) &&
        a.nom === article.nom
      );
      const availableStock = centralArticle ? centralArticle.quantite : 0;

      setTransferData({
        sourceId: centralShopId,
        targetId: article.boutique._id,
        articleId: article._id,
        articleName: article.nom,
        availableStock: availableStock
      });
      setTransferQuantity(10);
      setShowTransferModal(true);
    }
  }, [allArticles, centralShopId]);

  useEffect(() => {
    const openTransferId = searchParams.get('openTransfer');
    if (openTransferId && !loading && allArticles.length > 0) {
      const article = allArticles.find(a => a._id === openTransferId);
      if (article) {
        handleLowStockAction(article);
        setSearchParams(params => {
          params.delete('openTransfer');
          return params;
        });
      }
    }
  }, [loading, allArticles, searchParams, setSearchParams, handleLowStockAction]);

  const confirmTransfer = async (e) => {
    e.preventDefault();
    const qty = parseInt(transferQuantity);
    if (isNaN(qty) || qty <= 0) {
      setToast({ show: true, message: "Veuillez saisir une quantité valide (supérieure à 0).", variant: 'warning' });
      return;
    }

    setTransferLoading(true);
    try {
      const res = await articleAPI.restock({
        targetId: transferData.targetId,
        articles: [{ articleId: transferData.articleId, quantite: qty }]
      });
      setToast({ show: true, message: res.data.message, variant: 'success' });
      setShowTransferModal(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || "Erreur lors du transfert.", variant: 'danger' });
    } finally {
      setTransferLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dashboard-content p-4 position-relative" role="main" aria-label="Tableau de bord administrateur">
      <Button
        variant="primary"
        className="position-fixed bottom-0 end-0 m-4 rounded-circle shadow-lg z-3 d-flex align-items-center justify-content-center border-0"
        style={{ width: '45px', height: '45px', opacity: '0.8' }}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Retour en haut de page"
      >
        <iconify-icon icon="solar:alt-arrow-up-bold" style={{ fontSize: '24px' }}></iconify-icon>
      </Button>

      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999, position: 'fixed' }}>
        <Toast onClose={() => setToast({ ...toast, show: false })} show={toast.show} delay={5000} autohide bg={toast.variant}>
          <Toast.Header>
            <strong className="me-auto">Notification</strong>
          </Toast.Header>
          <Toast.Body className={toast.variant === 'danger' ? 'text-white' : ''}>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      {offlineCount > 0 && !isAdmin && (
        <Alert variant="warning" className="d-flex justify-content-between align-items-center shadow-sm rounded-4 border-0 mb-4">
          <div>
            <iconify-icon icon="solar:cloud-upload-bold-duotone" className="me-2 align-middle fs-4"></iconify-icon>
            <strong>Mode Hors-ligne :</strong> Il y a {offlineCount} vente(s) en attente de synchronisation.
          </div>
          <Button variant="warning" size="sm" className="rounded-pill fw-bold" onClick={handleSyncManual} disabled={!navigator.onLine}>
            Synchroniser maintenant
          </Button>
        </Alert>
      )}

      <Card className="welcome-banner border-0 mb-4 text-white overflow-hidden">
        <Card.Body className="p-4 d-flex align-items-center justify-content-between position-relative">
          <div className="z-1 position-relative w-100">
            <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
              <h1 className="fw-bold mb-0 fs-2">{isAdmin ? 'Tableau de Bord Admin' : 'Mes Performances Ventes'} 👋</h1>
              <Button variant="light" size="sm" onClick={handleExportPDF} className="text-primary fw-bold shadow-sm">
                <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                Exporter Rapport
              </Button>
            </div>
            <p className="mb-4 opacity-75" style={{ maxWidth: '600px' }}>
              {isAdmin ? 'Aperçu global de toutes les boutiques.' : 'Voici vos résultats personnels pour cette période.'}
            </p>
            <div className="d-flex flex-wrap gap-4">
              <div className="glass-stat p-2 px-3 rounded-3">
                <h4 className="mb-0 fw-bold">{formatCurrency(stats?.dailySales)}</h4>
                <small className="opacity-75">Ventes du jour</small>
              </div>
              <div className="glass-stat p-2 px-3 rounded-3">
                <h4 className="mb-0 fw-bold">{stats?.dailyOrders || 0}</h4>
                <small className="opacity-75">Commandes</small>
              </div>
              <div className="glass-stat p-2 px-3 rounded-3">
                <h4 className="mb-0 fw-bold">{formatCurrency(stats?.dailyRecoveries)}</h4>
                <small className="opacity-75">Recouvrement</small>
              </div>
              <div className="glass-stat p-2 px-3 rounded-3 border border-white border-opacity-25 bg-white bg-opacity-10">
                <h4 className="mb-0 fw-bold">{formatCurrency((stats?.dailySales || 0) + (stats?.dailyRecoveries || 0))}</h4>
                <small className="opacity-100 fw-bold">Encaissement Total</small>
              </div>
            </div>
          </div>
          <div className="illustration-placeholder d-none d-md-block">
            <iconify-icon icon="solar:rocket-2-bold-duotone" style={{ fontSize: '180px', opacity: '0.9', transform: 'rotate(-15deg)' }}></iconify-icon>
          </div>
        </Card.Body>
      </Card>

      <div className="d-flex flex-wrap gap-2 mb-4 sticky-top py-2" style={{ top: '0', zIndex: 10, backdropFilter: 'blur(10px)', backgroundColor: theme === 'dark' ? 'rgba(28, 33, 40, 0.8)' : 'rgba(245, 247, 250, 0.8)' }}>
        <Button variant="light" size="sm" className="rounded-pill shadow-sm px-3 fw-bold border-0" onClick={() => document.getElementById('quick-stats')?.scrollIntoView({ behavior: 'smooth' })}>
          <iconify-icon icon="solar:widget-bold-duotone" className="me-2 align-middle text-primary"></iconify-icon> Résumé
        </Button>
        <Button variant="light" size="sm" className="rounded-pill shadow-sm px-3 fw-bold border-0" onClick={() => document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' })}>
          <iconify-icon icon="solar:chart-square-bold-duotone" className="me-2 align-middle text-success"></iconify-icon> Analyses
        </Button>
        <Button variant="light" size="sm" className="rounded-pill shadow-sm px-3 fw-bold border-0" onClick={() => document.getElementById('low-stock')?.scrollIntoView({ behavior: 'smooth' })}>
          <iconify-icon icon="solar:box-bold-duotone" className="me-2 align-middle text-danger"></iconify-icon> Alertes Stock
        </Button>
        <Button variant="light" size="sm" className="rounded-pill shadow-sm px-3 fw-bold border-0" onClick={() => document.getElementById('performance')?.scrollIntoView({ behavior: 'smooth' })}>
          <iconify-icon icon="solar:users-group-two-rounded-bold-duotone" className="me-2 align-middle text-warning"></iconify-icon> Équipes
        </Button>
      </div>

      <Row className="mb-4 g-4" id="quick-stats" role="region" aria-label="Statistiques rapides">
        {[
          { title: "Chiffre d'affaires", value: formatCurrency(safeNum(stats?.totalCA)), icon: 'solar:bag-smile-bold-duotone', color: 'primary', trend: 'Global', trendColor: 'primary' },
          { title: 'Bénéfice', value: formatCurrency(safeNum(stats?.totalBenefice)), icon: 'solar:wallet-money-bold-duotone', color: 'success', trend: 'Net', trendColor: 'success' },
          { title: 'Alerte Stock Faible', value: `${lowStockArticles.length} articles`, icon: 'solar:box-minimalistic-bold-duotone', color: 'danger', trend: '< 10 unités', trendColor: 'danger' },
        ].map((stat, idx) => (
          <Col md={4} key={idx}>
            <HoverCard className="h-100" aria-label={`${stat.title}: ${stat.value}`}>
              <Card.Body className="d-flex align-items-center p-4">
                <div className={`icon-box bg-${stat.color}-subtle text-${stat.color} rounded-circle d-flex align-items-center justify-content-center me-3`}>
                  <iconify-icon icon={stat.icon} style={{ fontSize: '28px' }}></iconify-icon>
                </div>
                <div>
                  <h6 className="text-muted mb-1 fs-14">{stat.title}</h6>
                  <h4 className="fw-bold mb-0 d-flex align-items-center">
                    {stat.value}
                    <span className={`badge bg-${stat.trendColor}-subtle text-${stat.trendColor} fs-12 ms-2 rounded-pill fw-medium`}>
                      {stat.trend}
                    </span>
                  </h4>
                </div>
              </Card.Body>
            </HoverCard>
          </Col>
        ))}
      </Row>

      <Row className="g-4" id="charts">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="fw-bold mb-0">{salesMetric === 'ca' ? 'Analyse des Ventes' : 'Analyse des Bénéfices'}</h5>
                <div className="d-flex gap-3 align-items-center">
                  <Form.Check
                    type="switch"
                    id="sales-metric-switch"
                    label={salesMetric === 'ca' ? "Vue CA" : "Vue Bénéfice"}
                    checked={salesMetric === 'profit'}
                    onChange={(e) => setSalesMetric(e.target.checked ? 'profit' : 'ca')}
                    className="fw-medium small text-primary"
                  />
                  <Form.Check
                    type="switch"
                    id="sales-detail-switch"
                    label="Par boutique"
                    checked={isDetailedSales}
                    onChange={(e) => setIsDetailedSales(e.target.checked)}
                    className="fw-medium small"
                  />
                  <select
                    className="form-select form-select-sm w-auto border-0 bg-body-tertiary fw-medium"
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                  >
                    <option value="monthly">Ce mois</option>
                    <option value="yearly">Cette année</option>
                  </select>
                </div>
              </div>
              <Chart options={salesChartOptions} series={processedSalesSeries} type="area" height={350} />
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <h5 className="fw-bold mb-4">Articles les plus vendus</h5>
              <Chart options={productChartOptions} series={Array.isArray(stats?.productSales?.series) ? stats.productSales.series.map(safeNum) : []} type="donut" height={320} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4 mt-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <h5 className="fw-bold mb-2">Précision des Caisses (7 derniers jours)</h5>
              <p className="text-muted small mb-4">
                Ce graphique montre les erreurs de comptage par boutique.
                Une barre qui <strong>monte</strong> indique un surplus d'argent,
                une barre qui <strong>descend</strong> indique un manque d'argent (déficit).
              </p>
              <Chart options={ecartsChartData.options} series={ecartsChartData.series} type="bar" height={300} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4 mt-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold mb-0">Évolution du Total des Dettes</h5>
                <Form.Check
                  type="switch"
                  id="debt-detail-switch"
                  label="Comparer par boutique"
                  checked={isDetailedDebt}
                  onChange={(e) => setIsDetailedDebt(e.target.checked)}
                  className="fw-medium small"
                />
              </div>
              {loading ? (
                <div className="text-center py-5"><Spinner animation="border" /></div>
              ) : processedDebtData.series.length > 0 ? (
                <Chart options={debtEvolutionChartOptions} series={debtEvolutionChartSeries} type="area" height={300} />
              ) : (
                <Alert variant="info" className="m-0">Aucune donnée disponible pour afficher l'évolution des dettes.</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mt-4 g-4" id="low-stock">
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">Articles en Stock Faible (≤ 10 unités)</h5>
              {lowStockArticles.length > 0 && <Badge bg="danger-subtle" text="danger" pill>{lowStockArticles.length} articles concernés</Badge>}
            </Card.Header>
            <Card.Body className="p-0">
              {lowStockArticles.length > 0 ? (
                <>
                  <Table responsive hover className="align-middle mb-0">
                    <thead>
                      <tr>
                        <th className="ps-4 border-0">Article</th>
                        <th className="border-0">Boutique</th>
                        <th className="text-center border-0">Quantité Restante</th>
                        <th className="text-end pe-4 border-0">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLowStockArticles.map(article => (
                        <tr key={article._id}>
                          <td className="ps-4"><span className="fw-bold">{article.nom}</span></td>
                          <td>{article.boutique?.nom || <Badge bg="secondary">Non assignée</Badge>}</td>
                          <td className="text-center"><Badge bg="danger" pill>{safeNum(article.quantite)}</Badge></td>
                          <td className="text-end pe-4">
                            {article.boutique && article.boutique.type !== 'Centrale' && centralShopId ? (
                              <Button
                                variant="outline-success"
                                size="sm"
                                onClick={() => handleLowStockAction(article)}
                              >
                                Expédier vers une Boutique
                              </Button>
                            ) : (
                              <Button
                                as={Link}
                                to="/admin/articles"
                                state={{
                                  openSupplyModal: true,
                                  articleId: article._id,
                                  supplierId: article.fournisseur?._id
                                }}
                                variant="outline-primary"
                                size="sm"
                              >
                                Approvisionner
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {totalPages > 1 && (
                    <div className="d-flex justify-content-center p-3 border-top">
                      <Pagination size="sm" className="mb-0">
                        <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                        {[...Array(totalPages)].map((_, idx) => (
                          <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                            {idx + 1}
                          </Pagination.Item>
                        ))}
                        <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                      </Pagination>
                    </div>
                  )}
                </>
              ) : (
                <Alert variant="success" className="m-4 text-center">Aucun article en stock faible pour le moment. Excellent travail !</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {isAdmin && (
        <Row className="mt-4 g-4" id="performance">
          <Col lg={5}>
            <Card className="border-0 shadow-sm h-100 rounded-4">
              <Card.Body className="p-4">
                <h5 className="fw-bold mb-4">CA par Boutique</h5>
                {boutiquePerformanceChart && (
                  <Chart
                    options={boutiquePerformanceChart.options}
                    series={boutiquePerformanceChart.series}
                    type="bar"
                    height={300}
                  />
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col lg={7}>
            <Card className="border-0 shadow-sm h-100 rounded-4">
              <Card.Body className="p-4">
                <h5 className="fw-bold mb-4">Classement des Gérants</h5>
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th className="border-0 small">Gérant</th>
                        <th className="border-0 text-end small">Ventes</th>
                        <th className="border-0 text-end small">Recouvrement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats?.performanceGerants?.map((gerant, idx) => (
                        <tr key={idx}>
                          <td>
                            <div className="fw-bold">{gerant.nom}</div>
                            <div className="small text-muted">{gerant.boutiqueNom}</div>
                          </td>
                          <td className="text-end fw-bold text-primary">{formatCurrency(gerant.chiffreAffaires)}</td>
                          <td className="text-end fw-bold text-success">{formatCurrency(gerant.totalRecouvrements)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {isAdmin && (
        <Row className="mt-4">
          <Col lg={12}>
            <Card className="border-0 shadow-sm h-100 rounded-4">
              <Card.Header className="bg-body py-3 d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">Affectation des Gérants par Boutique</h5>
                <Button as={Link} to="/admin/boutiques" variant="primary" size="sm" className="rounded-pill px-3 fw-bold shadow-sm">
                  <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
                  Modifier les accès
                </Button>
              </Card.Header>
              <Card.Body className="p-0">
                <Table responsive hover className="align-middle mb-0">
                  <thead className="bg-body-tertiary">
                    <tr>
                      <th className="ps-4 border-0 text-muted small text-uppercase">Boutique</th>
                      <th className="border-0 text-muted small text-uppercase">Type</th>
                      <th className="border-0 text-muted small text-uppercase">Gérants Assignés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boutiques.map((boutique) => (
                      <tr key={boutique._id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center">
                            <div className={`bg-${boutique.type === 'Centrale' || boutique.type === 'Bar' ? 'primary' : 'info'}-subtle text-${boutique.type === 'Centrale' || boutique.type === 'Bar' ? 'primary' : 'info'} rounded-circle p-2 me-3 d-flex align-items-center justify-content-center`} style={{ width: '35px', height: '35px' }}>
                              <iconify-icon icon={boutique.type === 'Centrale' ? "solar:home-2-bold" : (boutique.type === 'Bar' ? "solar:wine-glass-bold" : "solar:shop-2-bold")}></iconify-icon>
                            </div>
                            <span className="fw-bold">{boutique.nom}</span>
                          </div>
                        </td>
                        <td>
                          <Badge bg={boutique.type === 'Centrale' ? 'primary-subtle' : 'info-subtle'} text={boutique.type === 'Centrale' ? 'primary' : 'info'} pill>
                            {boutique.type === 'Centrale' ? 'Dépôt Principal' : (boutique.type === 'Bar' ? 'Bar / Boîte' : 'Secondaire')}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {boutique.vendeurs && boutique.vendeurs.length > 0 ? (
                              boutique.vendeurs.map((v, i) => (
                                <Badge key={i} bg="secondary-subtle" text="dark" pill className="fw-normal">
                                  <iconify-icon icon="solar:user-bold" className="me-1 small"></iconify-icon>
                                  {v.nom || 'Utilisateur'}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted small italic">Aucun gérant assigné</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      <Modal show={showTransferModal} onHide={() => setShowTransferModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Réapprovisionner {transferData.articleName}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={confirmTransfer}>
          <Modal.Body>
            <Alert variant="info" className="small">
              Transfert depuis le <strong>Dépôt Principal</strong> vers la boutique concernée.
              <div className="mt-2 fw-bold">
                Stock disponible en centrale : <Badge bg={transferData.availableStock > 0 ? "success" : "danger"}>{transferData.availableStock}</Badge>
              </div>
            </Alert>
            <Form.Group>
              <Form.Label>Quantité à transférer</Form.Label>
              <Form.Control
                type="number"
                min="1"
                value={transferQuantity}
                max={transferData.availableStock}
                onChange={(e) => setTransferQuantity(e.target.value)}
                required
                isInvalid={parseInt(transferQuantity) > transferData.availableStock}
              />
              <Form.Control.Feedback type="invalid">
                La quantité ne peut pas dépasser le stock disponible ({transferData.availableStock}).
              </Form.Control.Feedback>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Annuler</Button>
            <Button variant="success" type="submit" disabled={transferLoading || parseInt(transferQuantity) > transferData.availableStock || transferData.availableStock <= 0}>
              {transferLoading ? <Spinner size="sm" /> : 'Valider le transfert'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default Dashboard;