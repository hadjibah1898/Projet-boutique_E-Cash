/**
 * @file CrmDashboard.js
 * @description Tableau de bord CRM professionnel & moderne.
 * KPI, graphiques (ApexCharts), segmentation, filtres, actions recommandées & relance.
 */

import React, { useMemo, useState } from 'react';
import { Alert, Badge, Spinner, Button, Modal, Form, Dropdown } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { clientAPI } from '../services/api';
import './CrmDashboard.css';

/* ---------- Helpers ---------- */
const fmtGNF = (val) => `${Math.round(val || 0).toLocaleString('fr-FR')} GNF`;

const getInitials = (name = '') =>
  (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/* ---------- Styles Niveau / Segmentation ---------- */
const NIVEAU_CLASS = {
  'Bronze': 'crm-badge crm-badge--bronze',
  'Argent': 'crm-badge crm-badge--argent',
  'Or': 'crm-badge crm-badge--or',
  'Platine': 'crm-badge crm-badge--platine',
};
const SEG_CLASS = {
  'Fidèle': 'crm-badge crm-badge--fidele',
  'Actif': 'crm-badge crm-badge--actif',
  'À risque': 'crm-badge crm-badge--risque',
  'Perdu': 'crm-badge crm-badge--perdu',
};

const NIVEAU_COLORS = {
  'Bronze': '#b08d57',
  'Argent': '#9ca3af',
  'Or': '#f59e0b',
  'Platine': '#6366f1',
};
const SEG_COLORS = {
  'Fidèle': '#22c55e',
  'Actif': '#3b82f6',
  'À risque': '#f59e0b',
  'Perdu': '#ef4444',
};

/**
 * Composant principal CRM
 * @param {Object} props
 * @param {Array} props.crmData — données d'analyse par client
 * @param {Array} props.crmQuartiers — statistiques par quartier
 * @param {boolean} props.loading
 * @param {Function} props.onRelancer — (clientId, nom) => void
 */
const CrmDashboard = ({ crmData = [], crmQuartiers = [], loading = false, onRelancer, onSettingsUpdated }) => {
  const [search, setSearch] = useState('');
  const [niveauFilter, setNiveauFilter] = useState('Tous');
  const [segFilter, setSegFilter] = useState('Toutes');
  const [quartierFilter, setQuartierFilter] = useState('Tous');
  const [exporting, setExporting] = useState(false);

  /* ---------- Paramètres des seuils (configurables) ---------- */
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ seuilArgent: 250000, seuilOr: 1000000, seuilPlatine: 5000000 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // Charger les paramètres existants à l'ouverture de la modale
  const openSettings = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    setShowSettings(true);
    setSettingsLoading(true);
    try {
      const res = await clientAPI.getCrmSettings();
      const data = res?.data || res;
      setSettings({
        seuilArgent: Number(data?.seuilArgent) || 250000,
        seuilOr: Number(data?.seuilOr) || 1000000,
        seuilPlatine: Number(data?.seuilPlatine) || 5000000,
      });
    } catch (err) {
      setSettingsError(err.response?.data?.message || "Impossible de charger les paramètres.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: Number(value) || 0 }));
  };

const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      await clientAPI.updateCrmSettings(settings);
      setSettingsSuccess("Paramètres enregistrés. Les niveaux seront recalculés au prochain chargement.");
      // Recharger les données CRM auprès du parent si possible
      if (typeof onSettingsUpdated === 'function') {
        onSettingsUpdated();
      }
    } catch (err) {
      setSettingsError(err.response?.data?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSettingsSaving(false);
    }
  };

  /* ---------- Paramètres de segmentation (configurables) ---------- */
  const [showSegSettings, setShowSegSettings] = useState(false);
  const [segSettings, setSegSettings] = useState({ joursActif: 30, joursRisque: 60, minAchatsFidele: 4 });
  const [segLoading, setSegLoading] = useState(false);
  const [segSaving, setSegSaving] = useState(false);
  const [segError, setSegError] = useState('');
  const [segSuccess, setSegSuccess] = useState('');

  const openSegSettings = async () => {
    setSegError('');
    setSegSuccess('');
    setShowSegSettings(true);
    setSegLoading(true);
    try {
      const res = await clientAPI.getSegmentationSettings();
      const data = res?.data || res;
      setSegSettings({
        joursActif: Number(data?.joursActif) || 30,
        joursRisque: Number(data?.joursRisque) || 60,
        minAchatsFidele: Number(data?.minAchatsFidele) || 4,
      });
    } catch (err) {
      setSegError(err.response?.data?.message || "Impossible de charger les paramètres de segmentation.");
    } finally {
      setSegLoading(false);
    }
  };

  const handleSegSettingsChange = (e) => {
    const { name, value } = e.target;
    setSegSettings(prev => ({ ...prev, [name]: Number(value) || 0 }));
  };

  const saveSegSettings = async () => {
    setSegSaving(true);
    setSegError('');
    setSegSuccess('');
    try {
      await clientAPI.updateSegmentationSettings(segSettings);
      setSegSuccess("Paramètres de segmentation enregistrés. Ils seront appliqués au prochain chargement.");
      if (typeof onSettingsUpdated === 'function') {
        onSettingsUpdated();
      }
    } catch (err) {
      setSegError(err.response?.data?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSegSaving(false);
    }
  };

  /* ---------- KPI ---------- */
  const kpis = useMemo(() => {
    const total = crmData.length;
    const caTotal = crmData.reduce((s, c) => s + (c.depenseTotale || 0), 0);
    const nbAchats = crmData.reduce((s, c) => s + (c.nbAchats || 0), 0);
    const panierMoyen = nbAchats > 0 ? caTotal / nbAchats : 0;
    const caMoyenClient = total > 0 ? caTotal / total : 0;
    const nbFideles = crmData.filter(c => c.segmentation === 'Fidèle').length;
    const nbPerdus = crmData.filter(c => c.segmentation === 'Perdu').length;
    const nbRisque = crmData.filter(c => c.segmentation === 'À risque').length;
    const aRisque = nbRisque + nbPerdus;
    const pctFideles = total > 0 ? Math.round((nbFideles / total) * 100) : 0;
    const pctARisque = total > 0 ? Math.round((aRisque / total) * 100) : 0;
    return { total, caTotal, nbAchats, panierMoyen, caMoyenClient, nbFideles, aRisque, nbPerdus, nbRisque, pctFideles, pctARisque };
  }, [crmData]);

  /* ---------- Données graphiques ---------- */
  const charts = useMemo(() => {
    const compteurNiveaux = {};
    crmData.forEach(c => { const n = c.niveau || 'Bronze'; compteurNiveaux[n] = (compteurNiveaux[n] || 0) + 1; });

    const compteurSeg = {};
    crmData.forEach(c => { const s = c.segmentation || 'Perdu'; compteurSeg[s] = (compteurSeg[s] || 0) + 1; });

    const compteurCat = {};
    crmData.forEach(c => (c.topCategories || []).forEach(({ categorie, count }) => {
      compteurCat[categorie] = (compteurCat[categorie] || 0) + count;
    }));
    const topCats = Object.entries(compteurCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topCatLabels = topCats.map(([k]) => k);
    const topCatValues = topCats.map(([, v]) => v);

    return {
      niveaux: {
        labels: Object.keys(compteurNiveaux),
        series: Object.values(compteurNiveaux),
        colors: Object.keys(compteurNiveaux).map(k => NIVEAU_COLORS[k] || '#999'),
      },
      segs: {
        labels: Object.keys(compteurSeg),
        series: Object.values(compteurSeg),
        colors: Object.keys(compteurSeg).map(k => SEG_COLORS[k] || '#999'),
      },
      quartiers: {
        labels: (crmQuartiers || []).slice(0, 7).map(q => q.quartier),
        values: (crmQuartiers || []).slice(0, 7).map(q => q.depenseTotale || 0),
      },
      topCats: { labels: topCatLabels, values: topCatValues },
    };
  }, [crmData, crmQuartiers]);

  /* ---------- Filtrage ---------- */
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return crmData.filter(c => {
      const matchSearch =
        !q ||
        (c.nom || '').toLowerCase().includes(q) ||
        (c.telephone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q);
      const matchNiv = niveauFilter === 'Tous' || (c.niveau || 'Bronze') === niveauFilter;
      const matchSeg = segFilter === 'Toutes' || (c.segmentation || 'Perdu') === segFilter;
      const matchQuartier = quartierFilter === 'Tous' || (c.quartier || 'Non renseigné') === quartierFilter;
      return matchSearch && matchNiv && matchSeg && matchQuartier;
    });
  }, [crmData, search, niveauFilter, segFilter, quartierFilter]);

  /* ---------- Actions recommandées ---------- */
  const recoActions = useMemo(() => {
    const list = [];
    if (kpis.aRisque > 0) {
      list.push({ icon: 'solar:bell-bold', text: <><strong>{kpis.aRisque}</strong> clients perdus ou à risque — pensez à les <strong>relancer</strong></> });
    }
    const topQuartier = (crmQuartiers || [])[0];
    if (topQuartier) {
      list.push({ icon: 'solar:map-point-bold', text: <><strong>{topQuartier.quartier}</strong> est votre quartier le plus rentable ({fmtGNF(topQuartier.depenseTotale)}) — ciblez-le</> });
    }
    if (charts.topCats.labels.length > 0) {
      list.push({ icon: 'solar:bag-bold', text: <><strong>{charts.topCats.labels[0]}</strong> est votre catégorie préférée — mettez-la en avant</> });
    }
    if (kpis.nbFideles > 0) {
      list.push({ icon: 'solar:cup-star-bold', text: <><strong>{kpis.nbFideles} clients fidèles</strong> ({kpis.pctFideles}%) — créez un programme de fidélité</> });
    }
    if (kpis.total > 0 && kpis.caMoyenClient > 0) {
      list.push({ icon: 'solar:chart-2-bold', text: <>Vos clients dépensent en moyenne <strong>{fmtGNF(kpis.caMoyenClient)}</strong> — objectif : augmenter via des offres groupées</> });
    }
    if (list.length === 0) {
      list.push({ icon: 'solar:info-circle-bold', text: <>Ajoutez des clients et attendez qu'ils achètent pour générer des recommandations.</> });
    }
    return list;
  }, [kpis, crmQuartiers, charts.topCats]);

  /* ---------- Export Excel filtré ---------- */
  const handleExportExcel = () => {
    setExporting(true);
    try {
      const data = filteredData.map(c => ({
        'Client': c.nom || '',
        'Téléphone': c.telephone || '',
        'Email': c.email || '',
        'Quartier': c.quartier || '',
        'Ville': c.ville || '',
        'Niveau': c.niveau || 'Bronze',
        'Segmentation': c.segmentation || 'Perdu',
        'Dépense Totale (GNF)': Math.round(c.depenseTotale || 0),
        'Nb Achats': c.nbAchats || 0,
        'Panier Moyen (GNF)': Math.round(c.panierMoyen || 0),
        'Fréquence Mensuelle': c.frequenceMensuelle ? Number(c.frequenceMensuelle.toFixed(2)) : 0,
        'Dernier Achat': c.dernierAchat ? new Date(c.dernierAchat).toLocaleDateString('fr-FR') : '',
        'Top Catégories': (c.topCategories || []).map(t => t.categorie).join(', '),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Analyse CRM');
      XLSX.writeFile(wb, `crm_analyse_${new Date().toISOString().split('T')[0]}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  /* ---------- Export PDF filtré ---------- */
  const handleExportPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const dateStr = new Date().toLocaleDateString('fr-FR');
      
      // En-tête
      doc.setFontSize(18);
      doc.setTextColor(99, 102, 241);
      doc.text('Analyse CRM - eCash', 14, 15);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Genere le ${dateStr} | ${filteredData.length} client(s)`, 14, 22);

      // KPI en en-tête
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const kpiText = `CA Total: ${fmtGNF(kpis.caTotal)} | Panier Moyen: ${fmtGNF(kpis.panierMoyen)} | Fideles: ${kpis.nbFideles} (${kpis.pctFideles}%) | A Risque/Perdus: ${kpis.aRisque} (${kpis.pctARisque}%)`;
      doc.text(kpiText, 14, 28);

      // Tableau principal
      const tableData = filteredData.map(c => [
        c.nom || '',
        c.niveau || 'Bronze',
        `${Math.round(c.depenseTotale || 0).toLocaleString('fr-FR')} GNF`,
        String(c.nbAchats || 0),
        `${Math.round(c.panierMoyen || 0).toLocaleString('fr-FR')} GNF`,
        `${(c.frequenceMensuelle || 0).toFixed(1)}/mois`,
        c.segmentation || 'Perdu',
        c.dernierAchat ? new Date(c.dernierAchat).toLocaleDateString('fr-FR') : '—',
        (c.topCategories || []).map(t => t.categorie).join(', ').substring(0, 40),
      ]);

      autoTable(doc, {
        startY: 33,
        head: [['Client', 'Niveau', 'Depense Totale', 'Nb Achats', 'Panier Moyen', 'Frequence', 'Segmentation', 'Dernier Achat', 'Top Categories']],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 30 },
          2: { halign: 'right' },
          4: { halign: 'right' },
        },
        didDrawPage: (data) => {
          // Pied de page
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(
            `eCash - Analyse CRM | Page ${doc.internal.getNumberOfPages()}`,
            14,
            doc.internal.pageSize.height - 5
          );
        },
      });

      // Page 2 : Résumé quartiers si disponible
      if (crmQuartiers.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor(99, 102, 241);
        doc.text('Repartition par Quartier', 14, 15);

        const quartierData = crmQuartiers.map(q => [
          q.quartier || 'Non renseigne',
          String(q.nbClients || 0),
          `${Math.round(q.depenseTotale || 0).toLocaleString('fr-FR')} GNF`,
          String(q.nbAchats || 0),
        ]);

        autoTable(doc, {
          startY: 22,
          head: [['Quartier', 'Nb Clients', 'Depense Totale', 'Nb Achats']],
          body: quartierData,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [13, 110, 253], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
      }

      doc.save(`crm_analyse_${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  /* ---------- Options ApexCharts ---------- */
  const baseChartOpts = {
    chart: { type: 'donut', fontFamily: 'inherit', toolbar: { show: false } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom', fontSize: '12px' },
    plotOptions: { pie: { donut: { size: '72%', labels: { show: true, name: { fontSize: '13px' }, value: { fontSize: '16px', fontWeight: 600, formatter: (v) => Number(v).toLocaleString('fr-FR') } } } } },
  };

  const barOptions = (color) => ({
    chart: { type: 'bar', fontFamily: 'inherit', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 8, columnWidth: '55%' } },
    dataLabels: { enabled: false },
    colors: [color],
    xaxis: { labels: { style: { fontSize: '11px' } } },
    yaxis: { labels: { formatter: (v) => `${Math.round(v).toLocaleString('fr-FR')}` } },
    tooltip: { y: { formatter: (v) => fmtGNF(v) } },
    legend: { show: false },
    grid: { borderColor: '#f1f5f9' },
  });

  const hBarOptions = {
    chart: { type: 'bar', fontFamily: 'inherit', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, horizontal: true } },
    dataLabels: { enabled: false },
    colors: ['#8b5cf6'],
    xaxis: { labels: { style: { fontSize: '11px' } } },
    grid: { borderColor: '#f1f5f9' },
    legend: { show: false },
  };

  if (loading) {
    return (
      <div className="text-center p-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-2 text-muted">Chargement de l'analyse CRM...</p>
      </div>
    );
  }

  return (
    <div className="crm-wrap">
      {/* ---------- KPI ---------- */}
      <div className="crm-kpi-grid">
        <div className="crm-kpi crm-kpi--blue">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">CA Total Clients</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:wallet-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{fmtGNF(kpis.caTotal)}</div>
            <div className="crm-kpi__sub">{kpis.nbAchats} achats cumulés</div>
          </div>
        </div>

        <div className="crm-kpi crm-kpi--violet">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">Clients Analysés</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:users-group-rounded-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{kpis.total}</div>
            <div className="crm-kpi__sub">clients avec historique</div>
          </div>
        </div>

        <div className="crm-kpi crm-kpi--green">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">Panier Moyen</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:cart-large-2-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{fmtGNF(kpis.panierMoyen)}</div>
            <div className="crm-kpi__sub">par transaction</div>
          </div>
        </div>

        <div className="crm-kpi crm-kpi--gold">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">Clients Fidèles</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:cup-star-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{kpis.nbFideles} <small style={{ fontSize: '0.8rem', fontWeight: 400 }}>({kpis.pctFideles}%)</small></div>
            <div className="crm-kpi__sub">≥ 4 achats / mois</div>
          </div>
        </div>

        <div className="crm-kpi crm-kpi--red">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">À Risque / Perdus</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:danger-circle-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{kpis.aRisque} <small style={{ fontSize: '0.8rem', fontWeight: 400 }}>({kpis.pctARisque}%)</small></div>
            <div className="crm-kpi__sub">{kpis.nbRisque} à risque · {kpis.nbPerdus} perdus</div>
          </div>
        </div>

        <div className="crm-kpi crm-kpi--cyan">
          <div className="crm-kpi__top">
            <span className="crm-kpi__label">CA Moyen / Client</span>
            <span className="crm-kpi__icon"><iconify-icon icon="solar:pie-chart-2-bold"></iconify-icon></span>
          </div>
          <div>
            <div className="crm-kpi__value">{fmtGNF(kpis.caMoyenClient)}</div>
            <div className="crm-kpi__sub">valeur client moyenne</div>
          </div>
        </div>
      </div>

      {/* ---------- Actions recommandées ---------- */}
      <div className="crm-actions-reco">
        <div className="crm-actions-reco__title">
          <iconify-icon icon="solar:magic-stick-3-bold"></iconify-icon>
          Actions recommandées
        </div>
        <div className="crm-actions-reco__list">
          {recoActions.map((a, i) => (
            <span key={i} className="crm-reco-chip">
              <iconify-icon icon={a.icon} style={{ color: '#fbbf24' }}></iconify-icon>
              {a.text}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Graphiques ---------- */}
      <div className="crm-charts-grid">
        <div className="crm-chart-card">
          <div className="crm-chart-card__title">
            <iconify-icon icon="solar:trophy-bold" style={{ color: '#f59e0b' }}></iconify-icon>
            Répartition par Niveau
          </div>
          <div className="crm-chart-card__sub">Bronze → Argent → Or → Platine</div>
          <Chart
            options={{ ...baseChartOpts, colors: charts.niveaux.colors, labels: charts.niveaux.labels }}
            series={charts.niveaux.series}
            type="donut"
            height={240}
          />
        </div>

        <div className="crm-chart-card">
          <div className="crm-chart-card__title">
            <iconify-icon icon="solar:pie-chart-2-bold" style={{ color: '#6366f1' }}></iconify-icon>
            Segmentation Clientèle
          </div>
          <div className="crm-chart-card__sub">Fidèle · Actif · À risque · Perdu</div>
          <Chart
            options={{ ...baseChartOpts, colors: charts.segs.colors, labels: charts.segs.labels }}
            series={charts.segs.series}
            type="donut"
            height={240}
          />
        </div>

        <div className="crm-chart-card">
          <div className="crm-chart-card__title">
            <iconify-icon icon="solar:map-point-bold" style={{ color: '#0d6efd' }}></iconify-icon>
            CA par Quartier
          </div>
          <div className="crm-chart-card__sub">Zones les plus rentables</div>
          {charts.quartiers.labels.length > 0 ? (
            <Chart
              options={{ ...barOptions('#0d6efd'), xaxis: { labels: { style: { fontSize: '10px' } }, trim: true } }}
              series={[{ name: 'CA', data: charts.quartiers.values }]}
              type="bar"
              height={240}
            />
          ) : (
            <div className="text-center text-muted py-5">Aucune donnée de quartier</div>
          )}
        </div>

        <div className="crm-chart-card">
          <div className="crm-chart-card__title">
            <iconify-icon icon="solar:bag-4-bold" style={{ color: '#8b5cf6' }}></iconify-icon>
            Top Catégories
          </div>
          <div className="crm-chart-card__sub">Produits les plus vendus</div>
          {charts.topCats.labels.length > 0 ? (
            <Chart
              options={{ ...hBarOptions, xaxis: { categories: charts.topCats.labels, labels: { style: { fontSize: '11px' } } } }}
              series={[{ name: 'Ventes', data: charts.topCats.values }]}
              type="bar"
              height={240}
            />
          ) : (
            <div className="text-center text-muted py-5">Aucune catégorie détectée</div>
          )}
        </div>
      </div>

      {/* ---------- Filtres ---------- */}
      <div className="crm-filters">
        <div className="crm-filters__group" style={{ flex: 2, minWidth: 220 }}>
          <label className="crm-filters__label">Rechercher</label>
          <input
            className="crm-filters__input"
            placeholder="Nom, téléphone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="crm-filters__group">
          <label className="crm-filters__label">Niveau</label>
          <select className="crm-filters__input" value={niveauFilter} onChange={(e) => setNiveauFilter(e.target.value)}>
            <option>Tous</option>
            {['Bronze', 'Argent', 'Or', 'Platine'].map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className="crm-filters__group">
          <label className="crm-filters__label">Segmentation</label>
          <select className="crm-filters__input" value={segFilter} onChange={(e) => setSegFilter(e.target.value)}>
            <option>Toutes</option>
            {['Fidèle', 'Actif', 'À risque', 'Perdu'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="crm-filters__group">
          <label className="crm-filters__label">Quartier</label>
          <select className="crm-filters__input" value={quartierFilter} onChange={(e) => setQuartierFilter(e.target.value)}>
            <option>Tous</option>
            {(crmQuartiers || []).map((q, i) => <option key={i}>{q.quartier}</option>)}
          </select>
        </div>
<Button variant="outline-secondary" onClick={openSettings} className="rounded-pill px-4" title="Configurer les seuils des niveaux">
          <iconify-icon icon="solar:settings-bold" className="me-1 align-middle"></iconify-icon> Niveaux
        </Button>
        <Button variant="outline-secondary" onClick={openSegSettings} className="rounded-pill px-4" title="Configurer les critères de segmentation">
          <iconify-icon icon="solar:chart-2-bold" className="me-1 align-middle"></iconify-icon> Segmentation
        </Button>
        <Dropdown>
          <Dropdown.Toggle variant="outline-primary" disabled={exporting || filteredData.length === 0} className="rounded-pill px-4">
            {exporting ? <Spinner as="span" size="sm" animation="border" className="me-1" /> : (
              <><iconify-icon icon="solar:download-bold" className="me-1 align-middle"></iconify-icon></>
            )}
            Exporter
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item onClick={handleExportExcel}>
              <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle" style={{ color: '#22c55e' }}></iconify-icon>
              Exporter en Excel (.xlsx)
            </Dropdown.Item>
            <Dropdown.Item onClick={handleExportPDF}>
              <iconify-icon icon="solar:file-pdf-bold" className="me-2 align-middle" style={{ color: '#ef4444' }}></iconify-icon>
              Exporter en PDF (.pdf)
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* ---------- Tableau ---------- */}
      <div className="crm-table-card">
        <div className="crm-table-card__head">
          <div className="crm-table-card__title">
            <iconify-icon icon="solar:users-group-rounded-bold" style={{ color: '#6366f1' }}></iconify-icon>
            Détail par Client
          </div>
          <Badge bg="light" text="dark" className="rounded-pill px-3">{filteredData.length} client(s)</Badge>
        </div>

        {filteredData.length === 0 ? (
          <Alert variant="light" className="m-3 border-0">
            Aucun client ne correspond aux filtres. Les clients devront effectuer des achats pour être analysés.
          </Alert>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {['Client', 'Niveau', 'Dépense Totale', 'Nb Achats', 'Panier Moyen', 'Fréquence', 'Segmentation', 'Dernier Achat', 'Top Catégories', 'Action'].map(h => (
                    <th key={h} style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((c, idx) => (
                  <tr key={c.clientId || idx}>
                    <td>
                      <div className="crm-client-cell">
                        <div className="crm-avatar">{getInitials(c.nom)}</div>
                        <div className="crm-client-cell__info">
                          <div className="crm-client-cell__name">{c.nom}</div>
                          <div className="crm-client-cell__phone">{c.telephone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={NIVEAU_CLASS[c.niveau] || 'crm-badge crm-badge--bronze'}>{c.niveau || 'Bronze'}</span></td>
                    <td><strong>{fmtGNF(c.depenseTotale)}</strong></td>
                    <td><Badge bg="info">{c.nbAchats || 0}</Badge></td>
                    <td>{fmtGNF(c.panierMoyen)}</td>
                    <td>{(c.frequenceMensuelle || 0).toFixed(1)}/mois</td>
                    <td><span className={SEG_CLASS[c.segmentation] || 'crm-badge crm-badge--perdu'}>{c.segmentation || 'Perdu'}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{c.dernierAchat ? new Date(c.dernierAchat).toLocaleDateString('fr-FR') : '—'}</td>
                    <td>
                      <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 160 }}>
                        {(c.topCategories || []).slice(0, 2).map((t, i) => (
                          <span key={i} className="badge bg-light text-dark border" style={{ fontSize: '0.7rem' }}>{t.categorie}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {c.email ? (
                        <button className="crm-relance-btn" onClick={() => onRelancer(c.clientId, c.nom)}>
                          <iconify-icon icon="solar:mail-bold" className="me-1 align-middle"></iconify-icon>
                          Relancer
                        </button>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>Pas d'email</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

<div className="crm-table-footer">
          <span>
            <iconify-icon icon="solar:info-circle-bold" className="me-1 align-middle"></iconify-icon>
            Les filtres sont appliqués aux données affichées et à l'export Excel.
          </span>
          <span>{filteredData.length} / {crmData.length} clients</span>
        </div>
      </div>

      {/* ---------- Modale Paramètres (seuils de niveau) ---------- */}
      <Modal show={showSettings} onHide={() => setShowSettings(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <iconify-icon icon="solar:settings-bold" className="me-2 align-middle" style={{ color: '#6366f1' }}></iconify-icon>
            Paramètres des Niveaux CRM
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Définissez les seuils de dépense totale (en GNF) à partir desquels un client est classé
            <strong> Argent</strong>, <strong>Or</strong> ou <strong>Platine</strong>. Les clients sous le seuil Argent restent
            <strong> Bronze</strong>. Les seuils doivent être croissants.
          </p>
          {settingsSuccess && <Alert variant="success">{settingsSuccess}</Alert>}
          {settingsError && <Alert variant="danger">{settingsError}</Alert>}
          {settingsLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted small">Chargement des paramètres...</p>
            </div>
          ) : (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--argent me-2">Argent</span> Seuil Argent (GNF)
                </Form.Label>
                <Form.Control
                  type="number"
                  name="seuilArgent"
                  min="0"
                  value={settings.seuilArgent}
                  onChange={handleSettingsChange}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--or me-2">Or</span> Seuil Or (GNF)
                </Form.Label>
                <Form.Control
                  type="number"
                  name="seuilOr"
                  min="0"
                  value={settings.seuilOr}
                  onChange={handleSettingsChange}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--platine me-2">Platine</span> Seuil Platine (GNF)
                </Form.Label>
                <Form.Control
                  type="number"
                  name="seuilPlatine"
                  min="0"
                  value={settings.seuilPlatine}
                  onChange={handleSettingsChange}
                />
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
<Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSettings(false)} disabled={settingsSaving}>
            Annuler
          </Button>
          <Button variant="primary" onClick={saveSettings} disabled={settingsLoading || settingsSaving}>
            {settingsSaving ? <Spinner as="span" size="sm" animation="border" className="me-1" /> : null}
            Enregistrer
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ---------- Modale Paramètres de segmentation ---------- */}
      <Modal show={showSegSettings} onHide={() => setShowSegSettings(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <iconify-icon icon="solar:chart-2-bold" className="me-2 align-middle" style={{ color: '#8b5cf6' }}></iconify-icon>
            Paramètres de Segmentation CRM
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Personnalisez les critères qui déterminent la catégorie de chaque client :
            <strong> Fidèle</strong>, <strong>Actif</strong>, <strong>À risque</strong> ou <strong>Perdu</strong>.
          </p>
          {segSuccess && <Alert variant="success">{segSuccess}</Alert>}
          {segError && <Alert variant="danger">{segError}</Alert>}
          {segLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted small">Chargement des paramètres...</p>
            </div>
          ) : (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--actif me-2">Actif</span>
                  Jours d'inactivité avant qu'un client ne soit "À risque"
                </Form.Label>
                <Form.Control
                  type="number"
                  name="joursActif"
                  min="1"
                  value={segSettings.joursActif}
                  onChange={handleSegSettingsChange}
                />
                <Form.Text className="text-muted">
                  Un client ayant acheté il y a moins de ce nombre de jours est considéré <strong>Actif</strong>.
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--risque me-2">À risque</span>
                  Jours d'inactivité avant qu'un client ne soit "Perdu"
                </Form.Label>
                <Form.Control
                  type="number"
                  name="joursRisque"
                  min="1"
                  value={segSettings.joursRisque}
                  onChange={handleSegSettingsChange}
                />
                <Form.Text className="text-muted">
                  Doit être supérieur au seuil des clients actifs. Au-delà de ce délai, le client est <strong>Perdu</strong>.
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>
                  <span className="crm-badge crm-badge--fidele me-2">Fidèle</span>
                  Nombre minimum d'achats pour être "Fidèle"
                </Form.Label>
                <Form.Control
                  type="number"
                  name="minAchatsFidele"
                  min="1"
                  value={segSettings.minAchatsFidele}
                  onChange={handleSegSettingsChange}
                />
                <Form.Text className="text-muted">
                  Un client actif ayant au moins ce nombre d'achats est classé <strong>Fidèle</strong>.
                </Form.Text>
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSegSettings(false)} disabled={segSaving}>
            Annuler
          </Button>
          <Button variant="primary" onClick={saveSegSettings} disabled={segLoading || segSaving}>
            {segSaving ? <Spinner as="span" size="sm" animation="border" className="me-1" /> : null}
            Enregistrer
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CrmDashboard;
