/**
 * @file useCaisse.js
 * @description Hook personnalisé pour le module Caisse & Finances.
 * Encapsule toute la logique de récupération de données, d'état et d'actions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  caisseAPI,
  authAPI,
  boutiqueAPI,
  venteAPI
} from '../services/api';
import {
  CASH_REPORT_STATUS,
  DEFAULT_API_LIMIT,
  ITEMS_PER_PAGE,
  DIGITAL_PAYMENT_MODES
} from '../constants/caisseConstants';
import { safeNum } from '../utils/formatUtils';

export const useCaisse = () => {
  // =========================================================================
  // ÉTATS DE DONNÉES
  // =========================================================================
  const [managers, setManagers] = useState([]);
  const [rapports, setRapports] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [caisseAdmin, setCaisseAdmin] = useState(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [stats, setStats] = useState({
    totalEncaissements: 0,
    totalFintech: 0,
    totalTheorique: 0,
    totalEcarts: 0
  });

  // =========================================================================
  // ÉTATS DE FILTRES ET PAGINATION
  // =========================================================================
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
  const [filterGerant, setFilterGerant] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // =========================================================================
  // ÉTATS DES MODALES
  // =========================================================================
  const [showValidateReportModal, setShowValidateReportModal] = useState(false);
  const [showRejectReportModal, setShowRejectReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [fintechSales, setFintechSales] = useState([]);
  const [fintechSearchTerm, setFintechSearchTerm] = useState('');
  const [fintechLoading, setFintechLoading] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterSalesMode, setFilterSalesMode] = useState(null);
  const [reportDetails, setReportDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [adminComment, setAdminComment] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // =========================================================================
  // ÉTATS GLOBAUX
  // =========================================================================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');


  // =========================================================================
  // UTILITAIRES
  // =========================================================================

  const safeNumUtil = useCallback((v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v.$numberDecimal) return parseFloat(v.$numberDecimal) || 0;
    const parsed = parseFloat(v);
    return isNaN(parsed) ? 0 : parsed;
  }, []);

  const resolveGerantName = useCallback((data) => {
    if (!data) return 'Gérant inconnu';
    if (data.gerantNom) return data.gerantNom;
    if (data.userName) return data.userName;
    if (data.userFirstName || data.userLastName) {
      return `${data.userFirstName || ''} ${data.userLastName || ''}`.trim();
    }
    if (typeof data === 'object') {
      return `${data.vcFirstName || data.nom || ''} ${data.vcLastName || ''}`.trim() || 'N/A';
    }
    const manager = managers.find(m => m._id === data || m.userId === data);
    return manager ? `${manager.vcFirstName || ''} ${manager.vcLastName || manager.nom || ''}`.trim() : data;
  }, [managers]);

  const resolveBoutiqueName = useCallback((data) => {
    if (!data) return 'Boutique inconnue';
    if (data.boutiqueNom) return data.boutiqueNom;
    if (data.vcStoreName) return data.vcStoreName;
    if (data.storeName) return data.storeName;
    if (typeof data === 'object') {
      return data.nom || data.name || 'N/A';
    }
    const b = boutiques.find(item => item._id === data || item.storeId === data);
    return b ? (b.vcStoreName || b.nom) : data;
  }, [boutiques]);

  const getStatusText = useCallback((rapport) => {
    const statusId = rapport.cashReportStatusId;
    const statusStr = rapport.statut;
    if (statusId === CASH_REPORT_STATUS.VALIDATED || statusStr === 'VALIDE' || statusStr === 'APPROUVEE') return 'VALIDÉ';
    if (statusId === CASH_REPORT_STATUS.REJECTED || statusStr === 'REJETE' || statusStr === 'REFUSEE') return 'REJETÉ';
    return 'EN_ATTENTE';
  }, []);

  // =========================================================================
  // CHARGEMENT DES DONNÉES PRINCIPALES
  // =========================================================================

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, rapportsRes, caisseAdminRes, boutiquesRes, treasuryRes] = await Promise.all([
        authAPI.getUsers(),
        caisseAPI.listerRapports({ ...dateFilter, gerant: filterGerant, limit: DEFAULT_API_LIMIT }),
        caisseAPI.getCaisseAdmin(),
        boutiqueAPI.getAll(),
        caisseAPI.getTreasuryAccounts()
      ]);

      const usersList = Array.isArray(usersRes) ? usersRes : (usersRes?.data || []);
      setManagers(usersList.filter(u => u.role === 'Gérant' || u.role === 'MANAGER'));

      const boutiquesList = Array.isArray(boutiquesRes) ? boutiquesRes : (boutiquesRes?.data || []);
      setBoutiques(boutiquesList);

      const data = rapportsRes?.data?.data || rapportsRes?.data || rapportsRes;
      const rapportsList = data?.list || [];
      const statsData = data?.stats || {
        totalEncaissements: 0,
        totalFintech: 0,
        totalTheorique: 0,
        totalEcarts: 0
      };

      setRapports(rapportsList);
      setStats(statsData);

      const caisseObj = caisseAdminRes?.data ? caisseAdminRes.data : caisseAdminRes;
      if (caisseObj) {
        caisseObj.soldeActuel = caisseObj.mCurrentBalance || caisseObj.soldeActuel || 0;
        caisseObj.historique = caisseObj.movements || caisseObj.historique || [];
      }

      setCaisseAdmin(caisseObj || null);
      
      const treasuryAccountsData = treasuryRes?.data || treasuryRes || [];
      setTreasuryAccounts(Array.isArray(treasuryAccountsData) ? treasuryAccountsData : []);
      
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les données. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, filterGerant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  // =========================================================================
  // HISTORIQUE CAISSE CENTRALE (filtré, mémoïsé)
  // =========================================================================

  const filteredHistory = useMemo(() => {
    if (!caisseAdmin?.historique) return [];
    return caisseAdmin.historique.filter(entry => {
      const entryDate = new Date(entry.dateTransaction || entry.dtCreatedAt || entry.createdAt);
      const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
      const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      const dateMatch = (!start || entryDate >= start) && (!end || entryDate <= end);

      let gerantMatch = true;
      if (filterGerant) {
        const selectedManager = managers.find(m => m._id === filterGerant || m.userId === filterGerant);
        const gerantNomFiltre = selectedManager ? `${selectedManager.vcFirstName || ''} ${selectedManager.vcLastName || selectedManager.nom || ''}`.trim() : '';
        gerantMatch = (entry.gerantNom && gerantNomFiltre && entry.gerantNom.includes(gerantNomFiltre)) ||
                      (entry.gerant === filterGerant) ||
                      (entry.gerant === selectedManager?.nom);
      }
      return dateMatch && gerantMatch;
    });
  }, [caisseAdmin, dateFilter, filterGerant, managers]);


  // =========================================================================
  // TRANSACTIONS FINTECH
  // =========================================================================

  const fetchFintechSales = useCallback(async () => {
    setFintechLoading(true);
    try {
      const res = await venteAPI.getHistorique({
        startDate: dateFilter.startDate,
        endDate: dateFilter.endDate,
        gerantId: filterGerant,
        limit: DEFAULT_API_LIMIT,
        transactionRefSearch: fintechSearchTerm
      });

      let allSales = [];
      if (Array.isArray(res)) allSales = res;
      else if (Array.isArray(res?.data)) allSales = res.data;
      else if (Array.isArray(res?.data?.ventes)) allSales = res.data.ventes;
      else if (Array.isArray(res?.ventes)) allSales = res.ventes;

      const getPaymentMode = (item) => {
        if (!item) return '';
        return item.modePaiement || item.vcPaymentMethod || item.paymentMethod || item.moyenPaiement || item.typePaiement || '';
      };

      const isCancelled = (item) => {
        if (item === null || item === undefined) return false;
        return item.isCancelled === true || item.annule === true || item.statut === 'ANNULE';
      };

      const filtered = [];
      (allSales || []).forEach(item => {
        if (item.items && Array.isArray(item.items)) {
          item.items.forEach(subItem => {
            const mode = getPaymentMode(subItem);
            if (DIGITAL_PAYMENT_MODES.map(m => m.toLowerCase()).includes(mode.toLowerCase()) && !isCancelled(subItem)) {
              filtered.push({
                ...subItem,
                boutique: subItem.boutiqueNom || subItem.boutique || item.boutiqueNom || item.boutique,
                gerant: subItem.gerantNom || subItem.gerant || item.gerantNom || item.gerant,
                createdAt: subItem.createdAt || subItem.dtSoldAt || item.createdAt,
                transactionRef: subItem.transactionRef || item.transactionRef
              });
            }
          });
        } else {
          const mode = getPaymentMode(item);
          if (DIGITAL_PAYMENT_MODES.map(m => m.toLowerCase()).includes(mode.toLowerCase()) && !isCancelled(item)) {
            filtered.push({
              ...item,
              boutique: item.boutiqueNom || item.boutique,
              gerant: item.gerantNom || item.gerant,
              createdAt: item.dtSoldAt || item.createdAt,
              transactionRef: item.transactionRef || item.vcTransactionId
            });
          }
        }
      });

      setFintechSales(filtered);
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la récupération des transactions Fintech.");
    } finally {
      setFintechLoading(false);
    }
  }, [dateFilter, filterGerant, fintechSearchTerm]);


  // =========================================================================
  // ACTIONS : VALIDATION / REJET / DÉTAILS
  // =========================================================================

  const handleValidateReportClick = useCallback((rapport) => {
    setSelectedReport(rapport);
    setAdminComment('');
    setShowValidateReportModal(true);
  }, []);

  const confirmValidateReport = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (isValidating) return;
    setIsValidating(true);

    try {
      const reportId = selectedReport.cashReportId || selectedReport._id;
      await caisseAPI.validerRapport(reportId, { commentairesAdmin: adminComment });
      setSuccess("Rapport validé. Le montant a été transféré vers la caisse centrale.");
      setShowValidateReportModal(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const msg = err.response?.data?.message || "Erreur lors de la validation.";
      if (msg.includes('déjà')) {
        setSuccess("Ce rapport était déjà validé.");
        setShowValidateReportModal(false);
        fetchData();
      } else {
        setError(msg);
      }
    } finally {
      setIsValidating(false);
    }
  }, [selectedReport, adminComment, isValidating, fetchData]);

  const handleRejectReportClick = useCallback((rapport) => {
    setSelectedReport(rapport);
    setAdminComment('');
    setShowRejectReportModal(true);
  }, []);

  const confirmRejectReport = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!adminComment.trim()) {
      setError("Un motif de rejet est obligatoire.");
      return;
    }
    if (isValidating) return;
    setIsValidating(true);

    try {
      const reportId = selectedReport.cashReportId || selectedReport._id;
      await caisseAPI.rejeterRapport(reportId, { commentairesAdmin: adminComment });
      setSuccess("Rapport rejeté avec succès.");
      setShowRejectReportModal(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors du rejet.");
    } finally {
      setIsValidating(false);
    }
  }, [selectedReport, adminComment, isValidating, fetchData]);

  const handleShowDetails = async (rapport) => {
    const statut = getStatusText(rapport);
    if (statut === 'EN_ATTENTE') return;

    setShowDetailsModal(true);
    setDetailsLoading(true);
    setError('');
    try {
      const reportId = rapport.cashReportId || rapport._id;
      const res = await caisseAPI.getReportDetails(reportId);
      const data = res?.data?.data || res?.data || res;

      setReportDetails({
        rapport: data.rapport || (Array.isArray(data) ? data[0] : data),
        ventes: data.ventes || (Array.isArray(data) ? data[1] : []),
        depenses: data.depenses || (Array.isArray(data) ? data[2] : [])
      });
    } catch (err) {
      setError("Impossible de charger les détails du rapport.");
      setShowDetailsModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCloseDetailsModal = useCallback(() => {
    setShowDetailsModal(false);
    setFilterSalesMode(null);
  }, []);


  // =========================================================================
  // PAGINATION RAPPORTS
  // =========================================================================

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentRapports = rapports.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(rapports.length / ITEMS_PER_PAGE);

  // =========================================================================
  // VALEUR DE RETOUR DU HOOK
  // =========================================================================

  return {
    // Données
    managers,
    rapports,
    boutiques,
    caisseAdmin,
    treasuryAccounts,
    stats,
    fintechSales,
    reportDetails,
    filteredHistory,
    currentRapports,
    totalPages,

    // États
    loading,
    error,
    success,
    fintechLoading,
    detailsLoading,
    isValidating,

    // Filtres
    dateFilter,
    filterGerant,
    fintechSearchTerm,
    filterSalesMode,

    // Modales
    showValidateReportModal,
    showRejectReportModal,
    showDetailsModal,
    selectedReport,

    // Pagination
    currentPage,
    itemsPerPage: ITEMS_PER_PAGE,

    // Actions
    setDateFilter,
    setFilterGerant,
    setFintechSearchTerm,
    setFilterSalesMode,
    setCurrentPage,
    fetchData,
    fetchFintechSales,
    handleValidateReportClick,
    confirmValidateReport,
    handleRejectReportModal: () => setShowRejectReportModal(true),
    confirmRejectReport,
    handleShowDetails,
    handleCloseDetailsModal,
    setShowDetailsModal,
    setShowValidateReportModal,
    setShowRejectReportModal,
    setAdminComment,
    setError,
    setSuccess,

    // Utilitaires
    safeNum: safeNumUtil,
    resolveGerantName,
    resolveBoutiqueName,
    getStatusText,
    CASH_REPORT_STATUS
  };
};

