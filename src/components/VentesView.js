// src/components/VentesView.js
/**
 * @file VentesView.js
 * @description Ce composant est le "cerveau" de la page des ventes. Il agit comme un conteneur "intelligent" :
 * - Il gère l'état global de la page (panier, historique, articles, clients).
 * - Il contient toute la logique métier (ajout au panier, validation de vente, annulation, etc.).
 * - Il récupère les données depuis l'API.
 * - Il orchestre l'affichage des sous-composants (SaleTab, HistoryTab, AdminHistoryTab) et des modales, en leur passant les données et les fonctions nécessaires via les props.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert, Spinner, Modal, Button, Badge, Form, Row, Col, Nav, Table, Card } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { articleAPI, venteAPI, clientAPI, caisseAPI, authAPI, boutiqueAPI } from '../services/api'; // Importez les API nécessaires
import { Html5QrcodeScanner } from "html5-qrcode"; // Pour le scanner de code-barres
import { generateReceiptPDF } from '../utils/pdfUtils'; // Importez la fonction de génération de PDF
import ClientModal from './common/ClientModal'; // Importer le composant réutilisable
import SaleTab from './SaleTab';
import HistoryTab from './HistoryTab';
import AdminHistoryTab from './AdminHistoryTab';
import CancelSaleModal from './CancelSaleModal'; // Keep this, it's not socket related
import ReceiptModal from './ReceiptModal';
import NotificationPopover from './NotificationPopover';
import ImagePreviewModal from './ImagePreviewModal';
import { toast } from 'react-toastify';
import ScannerModal from './ScannerModal';
import { playSuccessSound, playBeep } from '../utils/audioUtils';
import { useVenteLogic } from '../hooks/useVenteLogic'; // Import du hook personnalisé
import { saveVenteOffline, syncVentes, getOfflineVentesCount, getOfflineVentes } from '../utils/offlineSync';
const VentesView = ({ userRole, initialTab = 'sale' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [clients, setClients] = useState([]); // Liste des clients
  const [panier, setPanier] = useState([]);
  const [currentCaisseId, setCurrentCaisseId] = useState(null);
  const [itemRemiseInput, setItemRemiseInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPromoOnly] = useState(false);
  const [isApiReachable] = useState(true); // État pour le diagnostic réseau
  const [itemRemiseType, setItemRemiseType] = useState('montant'); // Nouvel état pour le type de remise (montant ou pourcentage)
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [venteUnitType, setVenteUnitType] = useState('bottle'); // 'bottle' ou 'dose'
  const [selectedGerantId, setSelectedGerantId] = useState(''); // Filtre par serveur/gérant
  const [boutiqueServers, setBoutiqueServers] = useState([]); // Liste de l'équipe pour le filtre
  const [barcode, setBarcode] = useState('');
  const [autoCodeGenerated, setAutoCodeGenerated] = useState(false); // État pour la disparition du bouton
  const [hasSimilarCode, setHasSimilarCode] = useState(false); // État pour la ressemblance "héritage"
  const [numeroTable, setNumeroTable] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(''); // Client sélectionné
  const [montantPaye, setMontantPaye] = useState(''); // Montant payé par le client
  const [modePaiement, setModePaiement] = useState('Cash'); // Mode de paiement (Cash, Orange Money, Dette, etc.)
  const [transactionRef, setTransactionRef] = useState(''); // Référence transactionnelle pour paiements électroniques
  const [echeanceDette, setEcheanceDette] = useState(''); // Échéance pour la dette
  const [brouillons, setBrouillons] = useState([]); // État pour les ventes en brouillon
  const [showMobilePanier, setShowMobilePanier] = useState(false); // État pour le panier mobile
  const [offlineCount, setOfflineCount] = useState(0); // État pour le badge hors-ligne
  const [offlineSales, setOfflineSales] = useState([]); // État pour la liste des ventes hors ligne
  const [showOfflineSalesModal, setShowOfflineSalesModal] = useState(false); // État pour la modale des ventes hors ligne
  const [ecoMode, setEcoMode] = useState(() => localStorage.getItem('ecoMode') === 'true');
  const [pendingCount, setPendingCount] = useState(0); // Compteur de commandes en attente
  const [canPrintReceipt, setCanPrintReceipt] = useState(true); // État pour la visibilité du bouton imprimer

  // États pour l'export CSV mensuel
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDate, setExportDate] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  const [isSubmitting, setIsSubmitting] = useState(false); // Pour le feedback sur le bouton de vente
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Nouveau : pour les mises à jour sans Spinner global
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);

  // États pour la modale d'impression du ticket
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState(null);

  // États pour la création rapide de client
  const [showClientModal, setShowClientModal] = useState(false);

  // Référence pour le champ de scan (pour garder le focus)
  const barcodeInputRef = useRef(null);

  // États pour la modale d'aperçu d'image
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  // État pour le scanner caméra
  const [showScanner, setShowScanner] = useState(false);

  // État pour le filtre des ventes annulées
  const [showCancelledOnly, setShowCancelledOnly] = useState(false);
  const [filterPaymentMode, setFilterPaymentMode] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [boutiqueConfig, setBoutiqueConfig] = useState(null); // Stocker le taux et l'état des pourboires
  const itemsPerPage = 15;

  // Utilisation du hook personnalisé pour la logique de vente
  const { getEffectivePrice } = useVenteLogic();

  // Calcul du total des pourboires pour le serveur (Session en cours)
  const totalPourboires = useMemo(() => {
    return historique.filter(v => !v.isCancelled).reduce((sum, v) => sum + (v.pourboire || 0), 0);
  }, [historique]);

  // Statistiques rapides pour l'onglet Historique (Vue Moderne)
  const historyStats = useMemo(() => {
    const validSales = historique.filter(v => !v.isCancelled);
    return {
      revenue: validSales.reduce((acc, v) => acc + (v.totalGroupPrice || 0), 0),
      count: validSales.length,
      avg: validSales.length > 0 ? (validSales.reduce((acc, v) => acc + (v.totalGroupPrice || 0), 0) / validSales.length) : 0
    };
  }, [historique]);

  // Liste dynamique des catégories disponibles pour les filtres de vente
  const availableCategories = useMemo(() => {
    if (!Array.isArray(articles)) return []; // Sécurité anti-crash
    const existingArticleCategories = articles
      .map(a => a.categorie || 'Divers')
      .filter(Boolean); // Filtrer les catégories vides ou nulles
    const uniqueCategories = [...new Set(existingArticleCategories)];
    // Convertir au format { key, label } attendu par SaleTab
    return uniqueCategories.map(cat => ({ key: cat, label: cat }));
  }, [articles]);

  // FIX: Calcul mémorisé des articles filtrés (utilisé par SaleTab)
  // On s'assure que articles est bien un tableau avant de filtrer
  const filteredArticles = useMemo(() => {
    if (!Array.isArray(articles)) return [];
    return articles.filter((article) => {
      // Filtrage par promo si l'interrupteur est activé
      const matchPromo = !showPromoOnly || (article.promoActive && (article.promo > 0 || article.remise > 0));
      return matchPromo;
    });
  }, [articles, showPromoOnly]);

  const activeTab = searchParams.get('tab') || initialTab;

  // ✅ FONCTION CORRIGÉE POUR EXTRAIRE LES DONNÉES PEU IMPORTE L'INTERCEPTEUR
  const fetchStaticData = useCallback(async () => {
    try {
      // 1. Statut Caisse
      let caisseRes = null;
      try {
        caisseRes = await caisseAPI.getStatut();
      } catch (error) {
        caisseRes = null;
      }
      // Gestion de la réponse selon si l'intercepteur a extrait .data ou non
      const caisseData = caisseRes?.data || caisseRes;
      if (caisseData?.session?._id) {
        setCurrentCaisseId(caisseData.session._id);
      }

      const articlesParams = ['Gérant', 'Serveur'].includes(userRole) ? { boutique: localStorage.getItem('boutiqueId') } : {};

      // 2. Appels API
      const [articlesRes, boutiqueRes, teamRes, clientsRes] = await Promise.all([
        articleAPI.getAll(articlesParams),
        ['Gérant', 'Serveur'].includes(userRole)
          ? boutiqueAPI.getDetailsForServeur(localStorage.getItem('boutiqueId'))
          : Promise.resolve({ data: null }),
        userRole === 'Gérant'
          ? authAPI.getUsers()
          : Promise.resolve({ data: [] }),
        userRole !== 'Admin'
          ? clientAPI.getAll({ boutiqueId: localStorage.getItem('boutiqueId') })
          : Promise.resolve({ data: [] })
      ]);

      // 3. Extraction robuste des ARTICLES
      let rawArticles = [];
      if (Array.isArray(articlesRes)) {
        rawArticles = articlesRes; // Si l'intercepteur a déjà renvoyé le tableau
      } else if (Array.isArray(articlesRes?.data)) {
        rawArticles = articlesRes.data;
      } else if (Array.isArray(articlesRes?.data?.data)) {
        rawArticles = articlesRes.data.data;
      } else if (Array.isArray(articlesRes?.articles)) {
        rawArticles = articlesRes.articles;
      }
      
      setArticles(rawArticles);

      // 4. Extraction robuste de la BOUTIQUE
      const boutiqueData = boutiqueRes?.data || boutiqueRes;
      if (boutiqueData && (boutiqueData._id || boutiqueData.nom)) {
        setBoutiqueConfig(boutiqueData);
      } else if (rawArticles.length > 0 && ['Gérant', 'Serveur'].includes(userRole)) {
        if (typeof rawArticles[0].boutique === 'object') {
          setBoutiqueConfig(rawArticles[0].boutique);
        }
      }

      // 5. Extraction robuste de l'ÉQUIPE
      if (userRole === 'Gérant' && teamRes) {
        let teamList = [];
        if (Array.isArray(teamRes)) teamList = teamRes;
        else if (Array.isArray(teamRes?.data)) teamList = teamRes.data;
        else if (Array.isArray(teamRes?.data?.data)) teamList = teamRes.data.data;
        setBoutiqueServers(teamList);
      }

      // 6. Extraction robuste des CLIENTS
      if (userRole !== 'Admin') {
        let clientList = [];
        if (Array.isArray(clientsRes)) clientList = clientsRes;
        else if (Array.isArray(clientsRes?.data)) clientList = clientsRes.data;
        else if (Array.isArray(clientsRes?.data?.data)) clientList = clientsRes.data.data;
        setClients(clientList);
      }
    } catch (err) {
      console.error("Erreur chargement articles/clients:", err);
    }
  }, [userRole]);

  // Nouvelle fonction pour rafraîchir uniquement les clients
  const fetchClientsData = useCallback(async () => {
    if (userRole === 'Admin') return; // L'admin n'a pas de liste de clients locale
    try {
      const clientsRes = await clientAPI.getAll({ boutiqueId: localStorage.getItem('boutiqueId') });
      let clientList = [];
      if (Array.isArray(clientsRes)) clientList = clientsRes;
      else if (Array.isArray(clientsRes?.data)) clientList = clientsRes.data;
      else if (Array.isArray(clientsRes?.data?.data)) clientList = clientsRes.data.data;
      setClients(clientList);
    } catch (err) {
      console.error("Erreur lors du rafraîchissement des clients:", err);
    }
  }, [userRole]);

  // Fonction pour ajouter rapidement un article par son nom (Entrée, Vestiaire)
  // eslint-disable-next-line no-unused-vars
  const ajouterArticleParNom = (nomRecherche) => {
    const article = articles.find(a => a.nom.toLowerCase().includes(nomRecherche.toLowerCase()));
    if (article) {
      setSelectedArticle(article._id);
      setQuantite(1);
      setTimeout(() => ajouterAuPanier(), 50);
    } else {
      toast.warn(`L'article "${nomRecherche}" n'est pas configuré dans votre stock.`);
    }
  };

  // fetchHistoryData ne chargera plus que l'historique (Données fréquentes et légères)
  const fetchHistoryData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);

      // Paramètres de filtrage : Si c'est un gérant, on filtre par son ID
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        showCancelledOnly: showCancelledOnly,
        // Filtrage dynamique : soi-même, un serveur spécifique, ou toute la boutique
        gerantId: userRole === 'Serveur' || userRole === 'Gérant' ? localStorage.getItem('userId') : (selectedGerantId || undefined),
        // Logique de filtrage intelligente par statut
        statut: searchParams.get('filter') === 'pending' ? (showCancelledOnly ? 'annulee' : ['commande', 'en_preparation']) : undefined,
        excludeStatut: (userRole === 'Serveur' && searchParams.get('filter') === 'finalized') ? 'commande' : undefined,
        groupBy: searchParams.get('filter') === 'pending' ? 'table' : 'order' // Pass grouping preference to backend
      };

      // Si on est gérant, on s'assure de voir les ventes de la boutique, pas seulement les siennes
      if (userRole === 'Gérant') {
        params.boutique = localStorage.getItem('boutiqueId');
      }

      // Filtres supplémentaires (paiement, client)
      if (filterPaymentMode) {
        params.modePaiement = filterPaymentMode;
      }
      if (filterClient) {
        params.clientId = filterClient;
      }

      const historiqueRes = await venteAPI.getHistorique(params);
      
      // Extraction robuste de l'historique
      let ventesData = [];
      let totalPagesData = 0;

      if (Array.isArray(historiqueRes)) {
        ventesData = historiqueRes;
      } else if (Array.isArray(historiqueRes?.data)) {
        ventesData = historiqueRes.data;
      } else if (Array.isArray(historiqueRes?.ventes)) {
        ventesData = historiqueRes.ventes;
        totalPagesData = historiqueRes.totalPages;
      } else if (Array.isArray(historiqueRes?.data?.ventes)) {
        ventesData = historiqueRes.data.ventes;
        totalPagesData = historiqueRes.data.totalPages;
      }

      setHistorique(ventesData);

      // Mettre à jour le compteur de notifications
      const count = ventesData.filter(g => g.statut === 'commande').length;
      setPendingCount(count);

      setTotalPages(totalPagesData || 0);
    } catch (err) {
      /* Erreur gérée globalement */
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [currentPage, showCancelledOnly, userRole, searchParams, selectedGerantId, filterPaymentMode, filterClient]);

  // Charger les données statiques (Articles) une seule fois au montage
  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);

  useEffect(() => {
    fetchHistoryData();
  }, [fetchHistoryData]);

  // Réinitialiser le badge de notification quand on regarde les commandes en attente
  useEffect(() => {
    if (searchParams.get('filter') === 'pending') {
      // On ne réinitialise pas forcément ici, le fetchHistoryData le fera via le statut
    }
  }, [searchParams]);

  // Gestion du mode Offline
  const loadOfflineSales = useCallback(async () => {
    if (userRole === 'Admin') return;
    const currentUserId = localStorage.getItem('userId');
    const allSales = await getOfflineVentes();
    const mySales = allSales.filter(sale => sale.venteData.gerantId === currentUserId);
    setOfflineSales(mySales);
    setOfflineCount(mySales.length);
  }, [userRole]);

  const handleManualSync = async () => {
    if (userRole === 'Admin') return;

    if (!navigator.onLine) {
      toast.error("Le serveur est injoignable. Vérifiez votre connexion Wi-Fi ou l'IP du PC.");
      return;
    }
    setLoading(true); // Activer le spinner global pendant la synchronisation
    try {
      const userId = localStorage.getItem('userId');
      const result = await syncVentes(userId);
      if (result.success > 0 || result.failure > 0) {
        const msg = result.failure > 0
          ? `${result.success} synchronisée(s), ${result.failure} échec(s).`
          : `${result.success} vente(s) synchronisée(s) avec succès !`;

        setSuccessMessage(msg);
        playSuccessSound();
        fetchHistoryData(); // Rafraîchir l'historique après synchronisation
        loadOfflineSales(); // Mettre à jour la liste des ventes hors ligne
      } else {
        setSuccessMessage("Aucune vente hors ligne à synchroniser.");
      }
    } catch (err) {
      /* Erreur gérée globalement */
    } finally {
      setLoading(false);
      setShowOfflineSalesModal(false); // Fermer la modale après la tentative de sync
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handleClearOfflineSales = () => {
    if (window.confirm("⚠️ Attention : Voulez-vous vraiment supprimer vos ventes hors ligne ? Cette action est irréversible.")) {
      const currentUserId = localStorage.getItem('userId');
      const allSalesStr = localStorage.getItem('offline_ventes');
      if (allSalesStr) {
        const allSales = JSON.parse(allSalesStr);
        const remainingSales = allSales.filter(sale => sale.venteData.gerantId !== currentUserId);
        localStorage.setItem('offline_ventes', JSON.stringify(remainingSales));
        setOfflineSales([]);
        setOfflineCount(0);
        toast.success("Vos ventes hors ligne ont été supprimées.");
      }
    }
  };

  useEffect(() => {
    if (userRole === 'Admin') return;

    const updateOfflineCount = async () => {
      const userId = localStorage.getItem('userId');
      const count = await getOfflineVentesCount(userId);
      setOfflineCount(count);
      if (count > 0) loadOfflineSales(); // Charger la liste si des ventes existent
    };

    updateOfflineCount();

    const handleOnlineStatus = async () => {
      if (navigator.onLine) {
        const userId = localStorage.getItem('userId');
        const result = await syncVentes(userId);
        if (result.success > 0) {
          setSuccessMessage(`${result.success} vente(s) synchronisée(s) automatiquement.`);
          playSuccessSound();
          fetchHistoryData();
        }
        loadOfflineSales(); // Mettre à jour la liste des ventes hors ligne
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    return () => window.removeEventListener('online', handleOnlineStatus);
  }, [fetchHistoryData, loadOfflineSales, userRole]);

  const ajouterAuPanier = () => {
    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    if (parseInt(quantite) <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }

    // Sécurité : Forcer un entier pour éviter les décimales non gérées
    if (!Number.isInteger(parseFloat(quantite))) {
      toast.error("La quantité doit être un nombre entier.");
      return;
    }

    const isDose = article.isDoseEnabled && venteUnitType === 'dose';
    const remiseValue = itemRemiseInput !== '' ? parseFloat(itemRemiseInput) : null;
    const prixUnitaire = isDose ? (article.prixDose || 0) : getEffectivePrice(article, remiseValue, itemRemiseType);

    if (remiseValue !== null) {
      if (itemRemiseType === 'pourcentage' && (remiseValue < 0 || remiseValue > 100)) {
        toast.error("La remise en pourcentage doit être entre 0 et 100%.");
        return;
      }
      if (itemRemiseType === 'montant' && remiseValue > article.prixVente) {
        toast.error(`La remise (${remiseValue.toLocaleString()} GNF) ne peut pas être supérieure au prix de l'article (${article.prixVente.toLocaleString()} GNF).`);
        return;
      }
    }

    // Validation du stock disponible
    const qtyToAdd = parseInt(quantite);
    const existeDeja = panier.find(item => item.article._id === selectedArticle && item.venteUnitType === venteUnitType);

    // On simplifie la validation stock en frontend (le backend fera le calcul précis)
    if (!isDose && qtyToAdd > article.quantite) {
      toast.error(`Stock insuffisant pour "${article.nom}".`);
      return;
    }


    if (existeDeja) {
      setPanier(panier.map(item =>
        item.article._id === selectedArticle && item.venteUnitType === venteUnitType
          ? {
            ...item,
            quantite: item.quantite + parseInt(quantite),
            remiseTemp: remiseValue,
            remiseType: itemRemiseType, // Stocker le type de remise
            prixUnitaire: prixUnitaire,
            prixTotal: prixUnitaire * (item.quantite + parseInt(quantite))
          }
          : item
      ));
    } else {
      setPanier([
        ...panier,
        {
          article,
          quantite: parseInt(quantite),
          remiseTemp: remiseValue, // en GNF
          remiseType: itemRemiseType, // Stocker le type de remise
          venteUnitType: venteUnitType, // 'bottle' ou 'dose'
          prixUnitaire: prixUnitaire,
          prixTotal: prixUnitaire * parseInt(quantite)
        }
      ]);
    }
    setSelectedArticle('');
    setQuantite(1); // Reset quantity
    setVenteUnitType('bottle'); // Reset unit type
    setItemRemiseInput(''); // Reset item discount input
    setItemRemiseType('montant'); // Reset item discount type
    // Refocus sur le champ scanner pour enchaîner (Mode Douchette Bluetooth)
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  const retirerDuPanier = (id) => {
    setPanier(panier.filter(item => item.article._id !== id));
    // Refocus sur le champ scanner après suppression (Mode Douchette Bluetooth)
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  const calculerTotal = () => {
    return panier.reduce((total, item) => total + item.prixTotal, 0);
  };

  // ...
  const effectuerVente = async () => {
    // CORRECTION CRITIQUE : La validation du paiement de dette doit être la TOUTE première vérification.
    // Si le panier est vide, mais qu'un client et un montant sont saisis, c'est un paiement de dette.
    if (panier.length === 0 && (!selectedClientId || montantPaye === '' || parseFloat(montantPaye) <= 0)) {
      toast.error("Le panier est vide. Pour payer une dette, sélectionnez un client et entrez un montant.");
      return;
    }

    const totalVente = calculerTotal();
    const montantPayeFinal = montantPaye === '' || montantPaye === null ? totalVente : parseFloat(montantPaye);

    // Si ce n'est pas un paiement de dette (c-à-d que le panier n'est pas vide), on applique les validations standards.
    // CORRECTION DÉFINITIVE : On ajoute la condition "panier.length > 0" pour ne pas bloquer les paiements de dette.
    if (panier.length > 0 && montantPayeFinal > totalVente) {
      toast.error("Le montant payé ne peut pas être supérieur au total de la vente.");
      return;
    }

    if (montantPayeFinal < 0) {
      toast.error("Le montant payé ne peut pas être négatif.");
      return;
    }

    // Déclaration de isServeur en dehors des blocs conditionnels pour une portée globale
    const isServeur = userRole === 'Serveur';

    // Vérifier si une remise a été appliquée dans le panier
    const hasRemise = panier.some(item => item.remiseTemp && item.remiseTemp > 0);
    // On ne peut créer une dette que si un client est sélectionné
    if (montantPayeFinal < totalVente && !selectedClientId && totalVente > 0) { // Ajout de totalVente > 0 pour éviter le blocage si panier vide
      toast.error("Veuillez sélectionner un client pour enregistrer une dette.");
      return;
    }
    // NOUVELLE VALIDATION: si une dette est créée, l'échéance est obligatoire
    if (montantPayeFinal < totalVente && !echeanceDette) {
      toast.error("Veuillez spécifier une date d'échéance pour la dette.");
      return;
    }
    // Validation : Date d'échéance ne doit pas être dans le passé
    if (montantPayeFinal < totalVente && echeanceDette) {
      const dateEcheance = new Date(echeanceDette);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateEcheance < today) {
        toast.error("La date d'échéance ne peut pas être dans le passé.");
        return;
      }
    }
    // Validation du numéro de table pour le rôle Serveur
    if (userRole === 'Serveur' && (!numeroTable || !numeroTable.trim())) {
      toast.error("Veuillez saisir un numéro de table ou un emplacement pour cette commande.");
      return;
    }
    setIsSubmitting(true);
    const venteData = {
      panier: panier.map(item => ({
        article: item.article._id,
        quantite: item.quantite,
        remiseTemp: item.remiseTemp || 0, // Passer la remise temporaire
        remiseType: item.remiseType || 'montant', // Passer le type de remise
        venteUnitType: item.venteUnitType || 'bottle',
        prixTotal: item.prixTotal // Nécessaire pour l'affichage correct du total hors ligne
      })),
      clientId: selectedClientId || null, // Envoyer l'ID du client
      montantPaye: montantPayeFinal, // Envoyer le montant réellement payé
      modePaiement: modePaiement, // Envoyer le mode de paiement sélectionné
      echeanceDette: (montantPayeFinal < totalVente) ? (echeanceDette || null) : null, // Envoyer la date d'échéance seulement si dette
      hasRemise: hasRemise, // Indiquer si une remise a été appliquée
      transactionRef: transactionRef, // Envoyer la référence de transaction
      numeroTable: numeroTable, // Envoyer le numéro de table pour le serveur
      ouvertureCaisseId: currentCaisseId, // Lier la vente à la caisse du gérant
      gerantId: localStorage.getItem('userId') // Identifier l'auteur pour le filtrage hors ligne
    };

    try {
      if (!navigator.onLine) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Connexion instable. Vente sauvegardée localement (Offline).');
        loadOfflineSales(); // Mettre à jour la liste des ventes hors ligne
      } else {
        await venteAPI.create(venteData);
      }

      const clientObj = clients.find(c => c._id === selectedClientId);
      let receiptData;

      if (panier.length === 0 && clientObj) {
        // CAS 1 : Reçu de paiement de dette simple
        const oldBalance = (clientObj.dette || 0) + parseFloat(montantPayeFinal);
        receiptData = {
          isDebtPayment: true, // Flag pour le rendu conditionnel du reçu
          shopName: boutiqueConfig?.nom,
          address: boutiqueConfig?.adresse,
          phone: boutiqueConfig?.telephone,
          transactionId: `DEBT-${Date.now()}`,
          cashierName: localStorage.getItem('userName') || userRole,
          clientName: clientObj.nom,
          date: new Date(),
          modePaiement: modePaiement,
          transactionRef: transactionRef,
          amountPaid: montantPayeFinal,
          oldBalance: oldBalance,
          newBalance: clientObj.dette,
        };
      } else {
        // CAS 2 : Reçu de vente standard
        const subTotal = panier.reduce((acc, item) => acc + (item.article.prixVente * item.quantite), 0);
        const totalAfterItemDiscounts = panier.reduce((acc, item) => acc + item.prixTotal, 0);
        const itemLevelDiscount = subTotal - totalAfterItemDiscounts;
        const finalTotalNet = calculerTotal();
        const boutiqueInfo = panier.length > 0 ? panier[0].article.boutique : boutiqueConfig;

        let totalPourboire = 0;
        if (isServeur && boutiqueInfo && boutiqueInfo.tipsEnabled !== false) {
          const tipRate = (boutiqueInfo.tipPercentage !== undefined ? boutiqueInfo.tipPercentage : 5) / 100;
          totalPourboire = Math.round(totalVente * tipRate);
        }

        receiptData = {
          isDebtPayment: false,
          shopName: boutiqueInfo?.nom,
          address: boutiqueInfo?.adresse,
          phone: boutiqueInfo?.telephone,
          transactionId: `VTE-${Date.now()}`,
          cashierName: localStorage.getItem('userName') || userRole,
          clientName: clientObj ? clientObj.nom : 'Client de passage',
          date: new Date(),
          items: panier,
          modePaiement: modePaiement,
          subTotal, itemLevelDiscount, pourboire: totalPourboire, totalNet: finalTotalNet, amountPaid: montantPayeFinal, change: montantPayeFinal - totalVente, echeanceDette, transactionRef
        };
      }

      // On propose la modale à tout le monde pour le feedback de succès
      // Mais le bouton imprimer ne sera là que si c'est encaissé (Gérant/Admin)
      setCanPrintReceipt(!isServeur);
      setCurrentReceiptData(receiptData);
      setShowReceiptModal(true);

      setSuccessMessage(isServeur ? 'Commande envoyée au bar avec succès !' : 'Vente effectuée avec succès !');

      setPanier([]);
      setSelectedClientId(''); // Réinitialiser le client
      setNumeroTable(''); // Réinitialiser le numéro de table
      setMontantPaye(''); // Réinitialiser le montant payé
      setModePaiement('Cash'); // Réinitialiser le mode de paiement
      setTransactionRef(''); // Réinitialiser la référence de transaction
      setEcheanceDette(''); // Réinitialiser l'échéance

      // On rafraîchit l'historique (Léger)
      // Mettre à jour les quantités d'articles localement pour éviter un re-fetch complet
      setArticles(prevArticles => {
        const updatedArticles = [...prevArticles];
        panier.forEach(soldItem => {
          const index = updatedArticles.findIndex(art => art._id === soldItem.article._id);
          if (index !== -1) {
            const decr = soldItem.venteUnitType === 'dose'
              ? (soldItem.quantite / (soldItem.article.dosesPerBottle || 10))
              : soldItem.quantite;
            updatedArticles[index] = { ...updatedArticles[index], quantite: updatedArticles[index].quantite - decr };
          }
        });
        return updatedArticles;
      });

      // CORRECTION FINALE : Rafraîchir les données après la mise à jour de l'état local
      // pour garantir la cohérence.
      fetchHistoryData();
      if (selectedClientId) {
        fetchClientsData();
      }
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      // Si l'erreur est réseau (pas de réponse du serveur)
      if (!err.response) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Erreur réseau. Vente sécurisée en mode Offline.');
        loadOfflineSales(); // Mettre à jour la liste des ventes hors ligne
        setPanier([]);
      } else {
        /* Erreur gérée globalement (ex: Caisse fermée) */
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Gestion des Brouillons (Ventes en attente) ---
  const mettreEnBrouillon = () => {
    if (panier.length === 0) {
      toast.error("Le panier est vide, impossible de mettre en brouillon.");
      return;
    }

    const clientObj = clients.find(c => c._id === selectedClientId);
    const newDraft = {
      id: Date.now(),
      date: new Date(),
      panier: [...panier],
      selectedClientId,
      clientName: clientObj ? clientObj.nom : 'Client de passage',
      montantPaye,
      echeanceDette,
      total: calculerTotal()
    };

    setBrouillons([newDraft, ...brouillons]);

    // Réinitialiser la vente actuelle pour passer à une autre personne
    setPanier([]);
    setSelectedClientId('');
    setMontantPaye('');
    setEcheanceDette('');
    setSuccessMessage("Vente mise en brouillon ! Vous pouvez maintenant servir un nouveau client.");
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const chargerBrouillon = (draft) => {
    // Si le panier actuel n'est pas vide, on demande confirmation
    if (panier.length > 0 && !window.confirm("Le panier actuel sera remplacé par ce brouillon. Continuer ?")) {
      return;
    }
    setPanier(draft.panier);
    setSelectedClientId(draft.selectedClientId);
    setMontantPaye(draft.montantPaye);
    setEcheanceDette(draft.echeanceDette);

    // Retirer du brouillon car il redevient la vente active
    setBrouillons(brouillons.filter(b => b.id !== draft.id));
  };

  const handleFinalizeOrder = async (id, nextStatus, isGroup = false, modePaiement = 'Cash', itemIds = []) => {
    try {
      setIsUpdatingStatus(true);
      if (isGroup) {
        await venteAPI.updateGroupStatus(id, { status: nextStatus, modePaiement, itemIds });

        // Préparation du ticket de caisse pour le groupe si la vente est finalisée
        if (nextStatus === 'finalisee') {
          const group = historique.find(g => g.orderGroupId === id);
          if (group) {
            const subTotal = group.items.reduce((acc, item) => acc + ((item.article?.prixVente || (item.prixTotal / item.quantite)) * item.quantite), 0);

            const receiptData = {
              shopName: group.boutique?.nom || "Ma Boutique",
              address: group.boutique?.adresse || "",
              phone: group.boutique?.telephone || "",
              transactionId: `GRP-${id.toString().slice(-6).toUpperCase()}`,
              cashierName: localStorage.getItem('userName') || userRole,
              serverName: group.gerant?.nom || 'N/A', // Ajouter le nom du serveur
              clientName: group.client?.nom || 'Client de passage',
              date: new Date(),
              items: group.items.map(item => ({
                article: item.article,
                quantite: item.quantite,
                prixUnitaire: item.prixTotal / item.quantite,
                prixTotal: item.prixTotal
              })),
              modePaiement: group.items[0]?.modePaiement || 'Cash',
              subTotal: subTotal,
              itemLevelDiscount: subTotal - group.totalGroupPrice,
              totalNet: group.totalGroupPrice,
              amountPaid: group.totalGroupPrice,
              change: 0
            };
            setCanPrintReceipt(true); // C'est une finalisation (encaissement), on permet l'impression
            setCurrentReceiptData(receiptData);
            setShowReceiptModal(true);
          }
        }

        const msg = nextStatus === 'en_preparation'
          ? "Commande marquée comme PRÊTE. Le serveur a été notifié."
          : nextStatus === 'annulee' ? "Commande supprimée et annulée avec succès."
            : "Table encaissée avec succès.";
        setSuccessMessage(msg);
      } else {
        await venteAPI.updateStatus(id, { status: nextStatus });
        setSuccessMessage(`Commande mise à jour.`);
      }
      // Rafraîchissement "silencieux" (sans faire apparaître le Spinner global)
      await fetchHistoryData(true);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      /* Erreur gérée globalement */
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleClientCreationSuccess = (createdClient, isEdit) => {
    if (isEdit) return; // Ne devrait pas arriver depuis cette vue

    // Mettre à jour la liste et sélectionner le nouveau client
    setClients(prevClients => [...prevClients, createdClient]);
    setSelectedClientId(createdClient.customerId);

    setSuccessMessage(`Client ${createdClient.vcFirstName} ${createdClient.vcLastName} créé avec succès !`);
    setShowClientModal(false);

    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const isCancellationAllowed = (vente) => {
    if (!vente) return false;
    if (userRole === 'Admin') {
      return true; // Admin can always cancel
    }
    if (userRole === 'Gérant') {
      const now = new Date();
      const saleDate = new Date(vente?.createdAt || 0);
      const diffInHours = (now - saleDate) / (1000 * 60 * 60);
      return diffInHours <= 2;
    }
    return false;
  };

  const confirmCancel = async () => {
    try {
      await venteAPI.cancel(saleToCancel._id);
      setSuccessMessage("Vente annulée avec succès. Le stock a été restauré.");
      fetchHistoryData();
    } catch (err) {
      // Erreur gérée par l'intercepteur Axios
    } finally {
      setShowCancelModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handlePrintReceipt = () => {
    if (currentReceiptData) {
      generateReceiptPDF(currentReceiptData);
    }
    handleCloseReceiptModal();
  };

  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  // Logique de traitement du code-barres (extraite pour être utilisée par le scanner et l'input)
  const processBarcode = (code) => {
    if (!code) return;

    const article = articles.find(a => a.code && a.code.toLowerCase() === code.toLowerCase());
    if (!article) {
      toast.error(`Aucun article trouvé avec le code "${code}".`);
      return;
    }

    if (article.quantite <= 0) {
      toast.error(`Stock épuisé pour l'article "${article.nom}".`); return;
    }

    setPanier(prevPanier => {
      const existeDeja = prevPanier.find(item => item.article._id === article._id);

      if (existeDeja) {
        // Vérifier si on peut ajouter une unité de plus
        if (article.quantite <= existeDeja.quantite) {
          toast.error(`Stock insuffisant pour ajouter plus de "${article.nom}".`);
          setBarcode(''); // Vider le champ même en cas d'erreur
          return prevPanier; // Ne pas modifier le panier
        }
        // Correction : Maintenir la remise existante lors du scan
        const currentRemise = existeDeja.remiseTemp || 0;
        const currentRemiseType = existeDeja.remiseType || 'montant'; // Récupérer le type de remise existant
        const newUnitPrice = getEffectivePrice(article, currentRemise, currentRemiseType); // Passer le type de remise
        return prevPanier.map(item =>
          item.article._id === article._id
            ? { ...item, quantite: item.quantite + 1, prixUnitaire: newUnitPrice, prixTotal: newUnitPrice * (item.quantite + 1) }
            : item
        );
      } else {
        return [
          ...prevPanier,
          {
            article,
            remiseType: 'montant', // Par défaut, pas de remise temporaire sur un nouvel article scanné
            quantite: 1,
            prixTotal: getEffectivePrice(article) * 1
          }
        ];
      }
    });

    playBeep();
    setBarcode('');

    // Garder le focus sur le champ de scan pour enchaîner les articles
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  // Logique pour la génération automatique "Héritage"
  const handleGenerateHeritageCode = useCallback(() => {
    const prefix = boutiqueConfig?.codeBoutique || 'ART';
    const newCode = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    setBarcode(newCode);
    setAutoCodeGenerated(true);

    // Vérification de ressemblance (Héritage) :
    // On vérifie si un article existant possède déjà un code commençant par le préfixe de la boutique
    const similarityFound = articles.some(a => a.code && a.code.startsWith(prefix));
    setHasSimilarCode(similarityFound);

    toast.info(`Code automatique généré : ${newCode}`);
  }, [articles, boutiqueConfig]);

  const handleBarcodeScan = (e) => {
    e.preventDefault();
    processBarcode(barcode);
  };

  // Gestion du scanner caméra
  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
      );

      let lastScannedCode = null;
      let lastScannedTime = 0;

      scanner.render((decodedText) => {
        const now = Date.now();
        // Empêcher les scans multiples immédiats du même code (délai de 1.5s)
        if (decodedText === lastScannedCode && now - lastScannedTime < 1500) {
          return;
        }
        lastScannedCode = decodedText;
        lastScannedTime = now;

        setBarcode(decodedText); // Affiche le code scanné dans le champ
        processBarcode(decodedText); // Traite le code
      }, (error) => {
        // console.warn(error); // Ignorer les erreurs de scan en continu
      });

      return () => {
        scanner.clear().catch(error => console.error("Failed to clear html5-qrcode scanner. ", error));
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]); // On ne met pas 'articles' ou 'panier' ici pour éviter de recréer le scanner à chaque ajout

  const handleImageClick = (img) => {
    setPreviewImage(img);
    setShowImageModal(true);
  };

  // Logique d'exportation CSV mensuelle des transactions
  const handleExportCSV = async () => {
    try {
      setLoading(true);
      // Bornes du mois sélectionné
      const startDate = new Date(exportDate.year, exportDate.month - 1, 1).toISOString();
      const endDate = new Date(exportDate.year, exportDate.month, 0, 23, 59, 59).toISOString();

      const res = await venteAPI.getHistorique({ startDate, endDate, limit: 0 });
      let data = [];
      if (Array.isArray(res)) data = res;
      else if (Array.isArray(res?.data)) data = res.data;
      else if (Array.isArray(res?.ventes)) data = res.ventes;
      else if (Array.isArray(res?.data?.ventes)) data = res.data.ventes;

      if (data.length === 0) {
        toast.error(`Aucune transaction trouvée pour ${exportDate.month}/${exportDate.year}.`);
        setShowExportModal(false);
        return;
      }

      // Construction du contenu CSV
      const headers = ["Date", "Heure", "Boutique", "Gerant", "Client", "Article", "Ref", "Quantite", "PU (GNF)", "Remise", "Total (GNF)", "Annulee"];
      const rows = data.map(v => [
        new Date(v.createdAt).toLocaleDateString('fr-FR'),
        new Date(v.createdAt).toLocaleTimeString('fr-FR'),
        v.boutique?.nom || 'N/A',
        v.gerant?.nom || 'N/A',
        v.client?.nom || 'Passage',
        v.article?.nom || 'N/A',
        v.article?.code || '-',
        v.quantite,
        v.prixTotal / v.quantite,
        `${v.remiseAppliquee}${v.remiseType === 'pourcentage' ? '%' : ' GNF'}`,
        v.prixTotal,
        v.isCancelled ? "OUI" : "NON"
      ]);

      const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `rapport_mensuel_ventes_${exportDate.month}_${exportDate.year}.csv`);
      link.click();
      setShowExportModal(false);
    } catch (err) { /* Erreur gérée par l'intercepteur Axios */
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      {!isApiReachable && (
        <Alert variant="danger" className="rounded-4 shadow-sm animate__animated animate__shakeX">
          <iconify-icon icon="solar:shield-warning-bold" className="me-2 align-middle"></iconify-icon>
          <strong>Serveur Injoignable :</strong> L'application ne peut pas contacter le PC (IP: <code>{process.env.REACT_APP_API_URL}</code>).
          Vérifiez que le PC et le téléphone sont sur le même Wi-Fi.
        </Alert>
      )}
      {/* Style pour colorer l'icône du calendrier natif en bleu primaire */}
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            filter: invert(33%) sepia(78%) saturate(2646%) hue-rotate(203deg) brightness(102%) contrast(103%); //
        }

        /* Animation pour le panier */
        @keyframes pulse-cart {
            0% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(0, 0, 0, 0.2);
            }
            50% {
                transform: scale(1.02);
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
            }
            100% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(0, 0, 0, 0.2);
            }
        }

        .cart-pulse {
            animation: pulse-cart 0.5s ease-in-out;
        }
      `}</style>
      <div className="d-flex justify-content-between align-items-center mb-3 mb-md-4 gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <h3 className="fw-bold mb-0 text-body d-none d-md-block">{activeTab === 'sale' ? 'Prendre Commande' : 'Mes Commandes'}</h3>
          {userRole === 'Serveur' && (
            <Badge bg="success" pill className="py-2 px-2 px-md-3 shadow-sm d-flex align-items-center">
              <iconify-icon icon="solar:hand-stars-bold" className="me-1"></iconify-icon>
              <span className="d-none d-sm-inline me-1">Mes Pourboires:</span> {totalPourboires.toLocaleString()} <span className="d-none d-md-inline ms-1">GNF</span>
            </Badge>
          )}
        </div>

        {/* Sélecteur d'onglets interne (Inspiration Odoo) */}
        {(userRole === 'Admin' || userRole === 'SuperAdmin') && (
          <Nav variant="pills" className="bg-light p-1 rounded-pill shadow-sm d-flex order-3 order-md-2 w-100 w-md-auto justify-content-center mt-2 mt-md-0">
            <Nav.Item>
              <Nav.Link
                active={activeTab === 'sale'}
                onClick={() => setSearchParams({ tab: 'sale' })}
                className="rounded-pill px-3 py-1 fw-bold small border-0"
              >
                <iconify-icon icon="solar:cart-plus-bold" className="me-1 align-middle"></iconify-icon>
                Vente
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                active={activeTab === 'history' && searchParams.get('filter') !== 'pending'}
                onClick={() => setSearchParams({ tab: 'history' })}
                className="rounded-pill px-3 py-1 fw-bold small border-0"
              >
                <iconify-icon icon="solar:history-bold" className="me-1 align-middle"></iconify-icon>
                Historique
              </Nav.Link>
            </Nav.Item>
          </Nav>
        )}

        {userRole !== 'Admin' && (
          <div className="ms-md-auto order-first order-md-last">
            <NotificationPopover />
          </div>
        )}

        {offlineCount > 0 && userRole !== 'Admin' && (
          <Button
            variant="warning"
            size="sm"
            className="ms-2 fs-6 align-middle shadow-sm animate__animated animate__bounceIn rounded-pill d-flex align-items-center"
            onClick={() => setShowOfflineSalesModal(true)}
          >
            <iconify-icon icon="solar:cloud-upload-bold-duotone" className="me-1 align-middle"></iconify-icon>
            {offlineCount}
            <span className="d-none d-sm-inline ms-1 small">hors-ligne</span>
          </Button>
        )}

        {/* Bouton pour afficher le calendrier de vente */}

        {/* Icône du panier pour mobile dans le header */}
        {activeTab === 'sale' && (userRole === 'Gérant' || userRole === 'Serveur') && (
          <Button
            variant="primary"
            className="d-md-none rounded-circle p-0 d-flex align-items-center justify-content-center shadow-lg cart-pulse"
            style={{
              width: '60px',
              height: '60px',
              position: 'fixed',
              bottom: '25px',
              right: '20px',
              zIndex: 1040,
              border: '2px solid white'
            }}
            onClick={() => setShowMobilePanier(true)}
          >
            <iconify-icon icon="solar:cart-large-bold" style={{ fontSize: '28px' }}></iconify-icon>
            {panier.length > 0 && (
              <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.85rem', padding: '0.5em 0.7em' }}>
                {panier.reduce((acc, item) => acc + item.quantite, 0)}
              </Badge>
            )}
          </Button>
        )}

        {/* Bouton Export CSV Mensuel pour Admin */}
        {userRole === 'Admin' && (
          <Button variant="outline-success" className="rounded-pill px-4 shadow-sm d-flex align-items-center" onClick={() => setShowExportModal(true)}>
            <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
            Export Mensuel
          </Button>
        )}
      </div>
      {/* Les erreurs sont maintenant gérées par les toasts globaux */}

      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      {searchParams.get('filter') === 'pending' && (
        <Alert variant="info" className="d-flex flex-column flex-md-row justify-content-between align-items-md-center shadow-sm rounded-4 border-0 mb-4 animate__animated animate__fadeIn gap-3">
          <span className="small"><iconify-icon icon="solar:info-circle-bold" className="me-2 align-middle fs-5"></iconify-icon> Mode gestion : Affichage des <strong>commandes serveurs en attente</strong> uniquement.</span>
          <Button variant="link" size="sm" className="text-decoration-none fw-bold" onClick={() => setSearchParams({ tab: 'history' })}>Voir tout l'historique</Button>
        </Alert>
      )}

      {userRole === 'Admin' ? (
        <>
          <AdminHistoryTab
            historique={historique}
            totalPages={totalPages}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            isCancellationAllowed={isCancellationAllowed}
            handleImageClick={handleImageClick}
            setSaleToCancel={setSaleToCancel}
            setShowCancelModal={setShowCancelModal}
          />
        </>
      ) : (
        activeTab === 'history' ? (
          <>
            {/* Header d'Historique Moderne pour Gérant */}
            {userRole === 'Gérant' && (
              <div className="mb-4 animate__animated animate__fadeIn">
                <Row className="g-3 align-items-end">
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-bold text-muted text-uppercase">Filtrer par membre d'équipe</Form.Label>
                      <div className="d-flex gap-2">
                        <Form.Select
                          value={selectedGerantId}
                          onChange={(e) => setSelectedGerantId(e.target.value)}
                          className="rounded-pill shadow-sm border-0 bg-white"
                        >
                          <option value="">Toute la boutique (Vue globale)</option>
                          <option value={localStorage.getItem('userId')}>Moi-même (Gérant)</option>
                          {boutiqueServers.map(member => (
                            <option key={member._id} value={member._id}>Serveur : {member.nom}</option>
                          ))}
                        </Form.Select>
                        {selectedGerantId && (
                          <Button variant="light" className="rounded-circle shadow-sm" onClick={() => setSelectedGerantId('')}>
                            <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
                          </Button>
                        )}
                      </div>
                    </Form.Group>
                  </Col>
                  <Col lg={4} md={12}>
                    <Row className="g-2">
                      <Col xs={6}>
                        <Form.Group>
                          <Form.Label className="small fw-bold text-muted text-uppercase">Du</Form.Label>
                          <Form.Control type="date" value={searchParams.get('startDate') || ''} onChange={(e) => setSearchParams(prev => { const p = new URLSearchParams(prev); if (e.target.value) p.set('startDate', e.target.value); else p.delete('startDate'); p.set('tab', 'history'); return p; })} className="rounded-pill shadow-sm border-0 bg-white" />
                        </Form.Group>
                      </Col>
                      <Col xs={6}>
                        <Form.Group>
                          <Form.Label className="small fw-bold text-muted text-uppercase">Au</Form.Label>
                          <Form.Control type="date" value={searchParams.get('endDate') || ''} onChange={(e) => setSearchParams(prev => { const p = new URLSearchParams(prev); if (e.target.value) p.set('endDate', e.target.value); else p.delete('endDate'); p.set('tab', 'history'); return p; })} className="rounded-pill shadow-sm border-0 bg-white" />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Col>
                  <Col lg={4} md={12}>
                    <Row className="g-2 text-center h-100">
                      <Col xs={6}>
                        <Card className="border-0 shadow-sm rounded-4 bg-primary-subtle text-primary h-100 d-flex justify-content-center">
                          <Card.Body className="py-2 px-1 d-flex flex-column justify-content-center">
                            <div className="small fw-bold">Revenu</div>
                            <div className="fw-bold">{historyStats.revenue.toLocaleString()} <span className="small">GNF</span></div>
                          </Card.Body>
                        </Card>
                      </Col>
                      <Col xs={6}>
                        <Card className="border-0 shadow-sm rounded-4 bg-success-subtle text-success h-100 d-flex justify-content-center">
                          <Card.Body className="py-2 px-1 d-flex flex-column justify-content-center">
                            <div className="small fw-bold">Ventes</div>
                            <div className="fw-bold">{historyStats.count}</div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </div>
            )}
            <HistoryTab
              historique={historique}
              showCancelledOnly={showCancelledOnly}
              setShowCancelledOnly={setShowCancelledOnly}
              filterPaymentMode={filterPaymentMode}
              setFilterPaymentMode={setFilterPaymentMode}
              filterClient={filterClient}
              setFilterClient={setFilterClient}
              currentPage={currentPage}
              totalPages={totalPages}
              setCurrentPage={setCurrentPage}
              isCancellationAllowed={isCancellationAllowed}
              handleImageClick={handleImageClick}
              setSaleToCancel={setSaleToCancel}
              setShowCancelModal={setShowCancelModal}
              handleFinalizeOrder={handleFinalizeOrder}
              isUpdatingStatus={isUpdatingStatus}
              userRole={userRole}
              isPendingView={searchParams.get('filter') === 'pending'}
              ecoMode={ecoMode} // <-- AJOUTER CETTE LIGNE
            />
          </>
        ) : (
          <SaleTab
            panier={panier}
            userRole={userRole}
            setPanier={setPanier}
            clients={clients}
            articles={articles}
            filteredArticles={filteredArticles}
            selectedClientId={selectedClientId}
            availableCategories={availableCategories}
            setSelectedClientId={setSelectedClientId}
            setShowClientModal={setShowClientModal}
            barcodeInputRef={barcodeInputRef}
            barcode={barcode}
            setBarcode={setBarcode}
            // Nouveaux props pour la gestion du bouton héritage
            autoCodeGenerated={autoCodeGenerated}
            hasSimilarCode={hasSimilarCode}
            handleGenerateHeritageCode={handleGenerateHeritageCode}
            handleBarcodeScan={handleBarcodeScan}
            selectedArticle={selectedArticle}
            setSelectedArticle={setSelectedArticle}
            quantite={quantite}
            setQuantite={setQuantite}
            numeroTable={numeroTable}
            setNumeroTable={setNumeroTable}
            itemRemiseInput={itemRemiseInput}
            setItemRemiseInput={setItemRemiseInput}
            itemRemiseType={itemRemiseType} // Nouveau prop
            setItemRemiseType={setItemRemiseType} // Nouveau prop
            ajouterAuPanier={ajouterAuPanier}
            venteUnitType={venteUnitType}
            setVenteUnitType={setVenteUnitType}
            getEffectivePrice={getEffectivePrice}
            handleImageClick={handleImageClick}
            retirerDuPanier={retirerDuPanier}
            montantPaye={montantPaye}
            setMontantPaye={setMontantPaye}
            modePaiement={modePaiement}
            transactionRef={transactionRef} // Nouveau prop
            setTransactionRef={setTransactionRef} // Nouveau prop
            setModePaiement={setModePaiement}
            echeanceDette={echeanceDette}
            setEcheanceDette={setEcheanceDette}
            calculerTotal={calculerTotal}
            effectuerVente={effectuerVente}
            historique={historique}
            isSubmitting={isSubmitting}
            brouillons={brouillons}
            mettreEnBrouillon={mettreEnBrouillon}
            chargerBrouillon={chargerBrouillon}
            setBrouillons={setBrouillons}
            showMobilePanier={showMobilePanier}
            setShowMobilePanier={setShowMobilePanier}
            boutiqueConfig={boutiqueConfig} // Passer la config à l'onglet de vente
            ecoMode={ecoMode}
          />
        )
      )}

      {/* Modale de confirmation d'annulation */}
      <CancelSaleModal
        show={showCancelModal}
        onHide={() => setShowCancelModal(false)}
        onConfirm={confirmCancel}
      />

      {/* Modale d'aperçu d'image */}
      <ImagePreviewModal
        show={showImageModal}
        onHide={() => setShowImageModal(false)}
        image={previewImage}
      />

      {/* Modale Scanner Caméra */}
      <ScannerModal
        show={showScanner}
        onHide={() => setShowScanner(false)}
      />

      {/* Modale Impression Ticket (Imprimer ou Ignorer) */}
      <ReceiptModal
        show={showReceiptModal}
        onHide={handleCloseReceiptModal}
        onPrint={handlePrintReceipt}
        canPrint={canPrintReceipt}
      />

      {/* Modale Création Rapide Client */}
      <ClientModal
        show={showClientModal}
        onHide={() => setShowClientModal(false)}
        clientToEdit={null} // Toujours en mode création
        onSuccess={handleClientCreationSuccess}
      />

      {/* Modale de sélection pour l'Export CSV */}
      <Modal show={showExportModal} onHide={() => setShowExportModal(false)} centered size="sm">
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold h5">Rapport Mensuel</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Row className="g-2">
            <Col xs={7}>
              <Form.Label className="small fw-bold text-muted">Mois</Form.Label>
              <Form.Select size="sm" className="rounded-3" value={exportDate.month} onChange={(e) => setExportDate({ ...exportDate, month: parseInt(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString('fr-FR', { month: 'long' })}</option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={5}>
              <Form.Label className="small fw-bold text-muted">Année</Form.Label>
              <Form.Select size="sm" className="rounded-3" value={exportDate.year} onChange={(e) => setExportDate({ ...exportDate, year: parseInt(e.target.value) })}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>
          </Row>
          <div className="mt-3 p-2 bg-light rounded x-small text-muted">
            Ce rapport contient l'historique complet des transactions structurées pour le mois sélectionné.
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="success" className="w-100 rounded-pill fw-bold shadow-sm" onClick={handleExportCSV}>
            Générer CSV
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale des ventes hors ligne */}
      <Modal show={showOfflineSalesModal} onHide={() => setShowOfflineSalesModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold h5">Ventes Hors Ligne ({offlineSales.length})</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {offlineSales.length === 0 ? (
            <Alert variant="info" className="text-center">
              <iconify-icon icon="solar:cloud-check-bold-duotone" className="me-2 align-middle fs-4"></iconify-icon>
              Aucune vente hors ligne en attente de synchronisation.
            </Alert>
          ) : (
            <>
              <Alert variant="warning">
                <iconify-icon icon="solar:info-circle-bold" className="me-2 align-middle fs-5"></iconify-icon>
                Ces ventes seront synchronisées automatiquement dès que la connexion sera rétablie. Vous pouvez aussi forcer la synchronisation.
              </Alert>
              <Table responsive striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Total</th>
                    <th>Articles</th>
                  </tr>
                </thead>
                <tbody>
                  {offlineSales.map((sale, index) => (
                    <tr key={index}>
                      <td>{new Date(sale.timestamp).toLocaleString()}</td>
                      <td>{sale.venteData.clientName || 'Client de passage'}</td>
                      <td className="fw-bold text-primary">
                        {sale.venteData.panier.reduce((acc, item) => acc + (item.prixTotal || 0), 0).toLocaleString()} GNF
                      </td>
                      <td>
                        <ul className="list-unstyled mb-0">
                          {sale.venteData.panier.map((item, itemIndex) => {
                            // Trouver l'article dans la liste locale pour afficher le nom
                            const artId = typeof item.article === 'object' ? item.article._id : item.article;
                            const artInfo = articles.find(a => a._id === artId);

                            // Calcul de secours pour les anciennes ventes sans prixTotal stocké
                            const displayPrice = item.prixTotal || (artInfo ? (
                              (item.venteUnitType === 'dose' && artInfo.isDoseEnabled ? (artInfo.prixDose || 0) : getEffectivePrice(artInfo, item.remiseTemp, item.remiseType)) * item.quantite
                            ) : 0);

                            return (
                              <li key={itemIndex} className="small d-flex justify-content-between">
                                <span>{artInfo?.nom || 'Article ID: ' + artId} <Badge bg="light" text="dark">x{item.quantite}</Badge></span>
                                <span className="text-muted ms-2">({displayPrice.toLocaleString()} GNF)</span>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="me-auto">
            {offlineSales.length > 0 && (
              <Button variant="outline-danger" size="sm" onClick={handleClearOfflineSales} className="rounded-pill px-3">
                <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                Vider le cache
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={() => setShowOfflineSalesModal(false)}>Fermer</Button>
          {offlineSales.length > 0 && userRole !== 'Admin' && (
            <Button variant="primary" onClick={handleManualSync} disabled={loading}>
              {loading ? <Spinner as="span" size="sm" animation="border" /> : "Synchroniser maintenant"}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default VentesView;