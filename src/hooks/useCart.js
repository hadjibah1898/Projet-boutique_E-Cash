import { useState, useCallback, useRef, useEffect } from 'react';
import { useVenteLogic } from './useVenteLogic';
import { saveVenteOffline, syncVentes, getOfflineVentesCount } from '../utils/offlineSync';
import { playSuccessSound, playBeep } from '../utils/audioUtils';
import { venteAPI } from '../services/api';

export const useCart = (
  articles,
  clients, // Clients list from VentesView
  userRole,
  boutiqueConfig,
  setError, // From VentesView
  setShowErrorModal, // From VentesView
  setSuccessMessage, // From VentesView
  onClientCreatedSuccess, // Callback from VentesView to update clients list
  fetchData, // From VentesView
  historique // Needed for receipt generation in handleFinalizeOrder
) => {
  const [panier, setPanier] = useState([]);
  const [itemRemiseInput, setItemRemiseInput] = useState('');
  const [itemRemiseType, setItemRemiseType] = useState('montant');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [barcode, setBarcode] = useState('');
  const [numeroTable, setNumeroTable] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [montantPaye, setMontantPaye] = useState('');
  const [modePaiement, setModePaiement] = useState('Cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [echeanceDette, setEcheanceDette] = useState('');
  const [brouillons, setBrouillons] = useState([]);
  const [showMobilePanier, setShowMobilePanier] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false); // Managed internally
  const [showReceiptModal, setShowReceiptModal] = useState(false); // Managed internally
  const [currentReceiptData, setCurrentReceiptData] = useState(null); // Managed internally (for receipt modal)
  const [showClientModal, setShowClientModal] = useState(false); // Managed internally

  const barcodeInputRef = useRef(null);
  const { getEffectivePrice } = useVenteLogic();

  // Offline sync logic
  useEffect(() => {
    const updateOfflineCount = async () => {
      const count = await getOfflineVentesCount();
      setOfflineCount(count);
    };

    updateOfflineCount();

    const handleOnlineStatus = async () => {
      if (navigator.onLine) {
        const result = await syncVentes();
        if (result.success > 0) {
          setSuccessMessage(`${result.success} vente(s) synchronisée(s) automatiquement.`);
          playSuccessSound();
          fetchData();
        }
        updateOfflineCount();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    return () => window.removeEventListener('online', handleOnlineStatus);
  }, [fetchData, setSuccessMessage]);

  const calculerTotal = useCallback(() => {
    return panier.reduce((total, item) => total + item.prixTotal, 0);
  }, [panier]);

  const ajouterAuPanier = useCallback(() => {
    if (parseInt(quantite) <= 0) {
      setError("La quantité doit être supérieure à 0");
      setShowErrorModal(true);
      return;
    }
    
    if (!Number.isInteger(parseFloat(quantite))) {
        setError("La quantité doit être un nombre entier.");
        setShowErrorModal(true);
        return;
    }

    const remiseValue = itemRemiseInput !== '' ? parseFloat(itemRemiseInput) : null;

    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    if (remiseValue !== null && (isNaN(remiseValue) || remiseValue < 0)) {
      setError("La remise doit être un nombre positif (supérieur ou égal à 0).");
      setShowErrorModal(true);
      return;
    }

    if (remiseValue !== null) {
        if (itemRemiseType === 'pourcentage' && (remiseValue < 0 || remiseValue > 100)) {
            setError("La remise en pourcentage doit être entre 0 et 100%.");
            setShowErrorModal(true);
            return;
        }
        if (itemRemiseType === 'montant' && remiseValue > article.prixVente) {
            setError(`La remise (${remiseValue.toLocaleString()} GNF) ne peut pas être supérieure au prix de l'article (${article.prixVente.toLocaleString()} GNF).`);
            setShowErrorModal(true);
            return;
        }
    }
    setError('');
    
    const qtyToAdd = parseInt(quantite);
    const itemInPanier = panier.find(item => item.article._id === selectedArticle);
    const totalQtyRequested = (itemInPanier ? itemInPanier.quantite : 0) + qtyToAdd;

    if (totalQtyRequested > article.quantite) {
        setError(`Stock insuffisant pour "${article.nom}". (Disponible: ${article.quantite}${itemInPanier ? `, déjà dans le panier: ${itemInPanier.quantite}` : ''})`);
        setShowErrorModal(true);
        return;
    }

    const prixUnitaire = getEffectivePrice(article, remiseValue, itemRemiseType);

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle
          ? { 
              ...item, 
              quantite: item.quantite + parseInt(quantite),
              remiseTemp: remiseValue,
              remiseType: itemRemiseType,
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
          remiseTemp: remiseValue,
          remiseType: itemRemiseType,
          prixUnitaire: prixUnitaire,
          prixTotal: prixUnitaire * parseInt(quantite)
        }
      ]);
    }
    setSelectedArticle('');
    setQuantite(1);
    setItemRemiseInput('');
    setItemRemiseType('montant');
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  }, [quantite, itemRemiseInput, itemRemiseType, selectedArticle, articles, panier, setError, setShowErrorModal, getEffectivePrice]);

  const retirerDuPanier = useCallback((id) => {
    setPanier(panier.filter(item => item.article._id !== id));
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  }, [panier]);

  const effectuerVente = useCallback(async () => {
    if (panier.length === 0) {
      setError('Le panier est vide');
      setShowErrorModal(true);
      return;
    }

    const totalVente = calculerTotal();
    const montantPayeFinal = montantPaye === '' || montantPaye === null ? totalVente : parseFloat(montantPaye);

    if (montantPayeFinal > totalVente) {
        setError("Le montant payé ne peut pas être supérieur au total de la vente.");
        setShowErrorModal(true);
        return;
    }
    
    if (montantPayeFinal < 0) {
        setError("Le montant payé ne peut pas être négatif.");
        setShowErrorModal(true);
        return;
    }

    const hasRemise = panier.some(item => item.remiseTemp && item.remiseTemp > 0);
    
    if (montantPayeFinal < totalVente && !selectedClientId && totalVente > 0) {
        setError("Veuillez sélectionner un client pour enregistrer une dette.");
        setShowErrorModal(true);
        return;
    }

    if (montantPayeFinal < totalVente && !echeanceDette) {
        setError("Veuillez spécifier une date d'échéance pour la dette.");
        setShowErrorModal(true);
        return;
    }

    if (montantPayeFinal < totalVente && echeanceDette) {
        const dateEcheance = new Date(echeanceDette);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateEcheance < today) {
            setError("La date d'échéance ne peut pas être dans le passé.");
            setShowErrorModal(true);
            return;
        }
    }

    if (userRole === 'Serveur' && (!numeroTable || !numeroTable.trim())) {
        setError("Veuillez saisir un numéro de table ou un emplacement pour cette commande.");
        setShowErrorModal(true);
        return;
    }

    setIsSubmitting(true);
    const venteData = {
      panier: panier.map(item => ({
        article: item.article._id,
        quantite: item.quantite,
        remiseTemp: item.remiseTemp || 0,
        remiseType: item.remiseType || 'montant',
      })),
      clientId: selectedClientId || null,
      montantPaye: montantPayeFinal,
      modePaiement: modePaiement,
      echeanceDette: (montantPayeFinal < totalVente) ? (echeanceDette || null) : null,
      hasRemise: hasRemise,
      transactionRef: transactionRef,
      numeroTable: numeroTable
    };

    try {
      if (!navigator.onLine) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Connexion instable. Vente sauvegardée localement (Offline).');
      } else {
        await venteAPI.create(venteData);
      }

      const subTotal = panier.reduce((acc, item) => acc + (item.article.prixVente * item.quantite), 0);
      const totalAfterItemDiscounts = panier.reduce((acc, item) => acc + item.prixTotal, 0);
      const itemLevelDiscount = subTotal - totalAfterItemDiscounts;
      const finalTotalNet = calculerTotal();

      const isServeur = userRole === 'Serveur';
      const boutiqueInfo = panier.length > 0 ? panier[0].article.boutique : null;
      const clientObj = clients.find(c => c._id === selectedClientId);
      
      const receiptData = {
          shopName: boutiqueInfo?.nom,
          address: boutiqueInfo?.adresse,
          phone: boutiqueInfo?.telephone,
          transactionId: `VTE-${Date.now()}`,
          cashierName: localStorage.getItem('userName') || userRole,
          clientName: clientObj ? clientObj.nom : 'Client de passage',
          date: new Date(),
          items: panier,
          modePaiement: modePaiement,
          subTotal: subTotal,
          itemLevelDiscount: itemLevelDiscount,
          totalNet: finalTotalNet,
          amountPaid: montantPayeFinal,
          change: montantPayeFinal - totalVente,
          echeanceDette: echeanceDette,
          transactionRef: transactionRef
      };

      if (!isServeur) {
          setCurrentReceiptData(receiptData);
          setShowReceiptModal(true);
      }
      
      setSuccessMessage(isServeur ? 'Commande envoyée au bar avec succès !' : 'Vente effectuée avec succès !');

      setPanier([]);
      setSelectedClientId('');
      setNumeroTable('');
      setMontantPaye('');
      setModePaiement('Cash');
      setTransactionRef('');
      setEcheanceDette('');
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      if (!err.response) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Erreur réseau. Vente sécurisée en mode Offline.');
        setPanier([]);
      } else {
        setError(err.response?.data?.message || 'Erreur lors de la vente');
        setShowErrorModal(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [panier, montantPaye, selectedClientId, echeanceDette, userRole, numeroTable, modePaiement, transactionRef, clients, calculerTotal, setError, setShowErrorModal, setSuccessMessage, fetchData]);

  return {
    panier, setPanier,
    itemRemiseInput, setItemRemiseInput,
    itemRemiseType, setItemRemiseType,
    selectedArticle, setSelectedArticle,
    quantite, setQuantite,
    barcode, setBarcode,
    numeroTable, setNumeroTable,
    selectedClientId, setSelectedClientId,
    montantPaye, setMontantPaye,
    modePaiement, setModePaiement,
    transactionRef, setTransactionRef,
    echeanceDette, setEcheanceDette,
    brouillons, setBrouillons,
    showMobilePanier, setShowMobilePanier,
    offlineCount,
    isSubmitting,
    showReceiptModal, setShowReceiptModal,
    currentReceiptData, setCurrentReceiptData,
    showClientModal, setShowClientModal,
    barcodeInputRef,
    calculerTotal,
    ajouterAuPanier,
    retirerDuPanier,
    effectuerVente
  };
};