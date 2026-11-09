/**
 * @file CaissierPOS.js
 * @description Point de vente (POS) pour le Caissier : scan, panier, encaissement.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, Button, Form, Row, Col, Badge, Spinner, Alert, Modal, InputGroup, OverlayTrigger, Tooltip, Offcanvas } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { articleAPI, clientAPI, venteAPI, caisseAPI, boutiqueAPI } from '../services/api';
import { toast } from 'react-toastify';
import { playBeep, playSuccessSound } from '../utils/audioUtils';
import { useVenteLogic } from '../hooks/useVenteLogic';
import { saveVenteOffline, syncVentes, getOfflineVentesCount, getOfflineVentes } from '../utils/offlineSync';
import { Html5QrcodeScanner } from "html5-qrcode";
import { generateReceiptPDF } from '../utils/pdfUtils';
import ClientModal from './common/ClientModal';
import './CaissierPOS.css';

const CaissierPOS = () => {
    const navigate = useNavigate();
    const { getEffectivePrice } = useVenteLogic();
    
    // États principaux
    const [articles, setArticles] = useState([]);
    const [clients, setClients] = useState([]);
    const [panier, setPanier] = useState([]);
    const [loading, setLoading] = useState(true);
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [boutiqueConfig, setBoutiqueConfig] = useState(null);
    
    // États pour la recherche et filtres
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [categories, setCategories] = useState([]);
    
    // États pour le panier
    const [selectedArticle, setSelectedArticle] = useState('');
    const [quantite, setQuantite] = useState(1);
    const [remiseMontant, setRemiseMontant] = useState('');
    const [remisePourcentage, setRemisePourcentage] = useState('');
    const [itemRemiseType, setItemRemiseType] = useState('montant');
    
    // État pour afficher/masquer le panneau d'ajout rapide
    const [showAddPanel, setShowAddPanel] = useState(false);
    
    // États pour les fonctionnalités avancées
    const [numeroTable, setNumeroTable] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [montantPaye, setMontantPaye] = useState('');
    const [modePaiement, setModePaiement] = useState('Cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [echeanceDette, setEcheanceDette] = useState('');
    const [brouillons, setBrouillons] = useState([]);
    const [showMobilePanier, setShowMobilePanier] = useState(false);
    const [offlineCount, setOfflineCount] = useState(0);
    const [offlineSales, setOfflineSales] = useState([]);
    const [showOfflineSalesModal, setShowOfflineSalesModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showClientModal, setShowClientModal] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [currentReceiptData, setCurrentReceiptData] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showDraftsModal, setShowDraftsModal] = useState(false);
    const [showViderModal, setShowViderModal] = useState(false);
    const [showItemDiscountModal, setShowItemDiscountModal] = useState(false);
    const [discountModalItem, setDiscountModalItem] = useState(null);
    const [modalRemiseValue, setModalRemiseValue] = useState('');
    const [modalRemiseType, setModalRemiseType] = useState('montant');
    const [showNextItemDiscountModal, setShowNextItemDiscountModal] = useState(false);
    const [barcode, setBarcode] = useState('');
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    
    // Référence pour le scanner
    const barcodeInputRef = useRef(null);
    
    // Charger les données initiales
    useEffect(() => {
        loadInitialData();
    }, []);
    
    // Vérifier le statut de la caisse périodiquement
    useEffect(() => {
        if (caisseStatut) {
            const interval = setInterval(checkCaisseStatus, 30000); // Vérifier toutes les 30 secondes
            return () => clearInterval(interval);
        }
    }, [caisseStatut]);

    // Gestion du mode Offline
    useEffect(() => {
        const updateOfflineCount = async () => {
            const userId = localStorage.getItem('userId');
            const count = await getOfflineVentesCount(userId);
            setOfflineCount(count);
            if (count > 0) loadOfflineSales();
        };

        updateOfflineCount();

        const handleOnlineStatus = async () => {
            if (navigator.onLine) {
                const userId = localStorage.getItem('userId');
                const result = await syncVentes(userId);
                if (result.success > 0) {
                    setSuccessMessage(`${result.success} vente(s) synchronisée(s) automatiquement.`);
                    playSuccessSound();
                    setTimeout(() => setSuccessMessage(''), 3000);
                }
                loadOfflineSales();
            }
        };

        window.addEventListener('online', handleOnlineStatus);
        return () => window.removeEventListener('online', handleOnlineStatus);
    }, []);
    
    const loadInitialData = async () => {
        try {
            setLoading(true);
            const [articlesRes, clientsRes, caisseRes, boutiqueRes] = await Promise.all([
                articleAPI.getAll({ boutique: localStorage.getItem('boutiqueId') }),
                clientAPI.getAll({ boutiqueId: localStorage.getItem('boutiqueId') }),
                caisseAPI.getStatut().catch(() => null),
                boutiqueAPI.getDetailsForServeur(localStorage.getItem('boutiqueId')).catch(() => null)
            ]);
            
            const articlesData = Array.isArray(articlesRes.data) ? articlesRes.data : [];
            setArticles(articlesData);
            setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
            setCaisseStatut(caisseRes?.data || caisseRes || null);
            
            if (boutiqueRes?.data) {
                setBoutiqueConfig(boutiqueRes.data);
            } else if (articlesData.length > 0) {
                setBoutiqueConfig(articlesData[0].boutique);
            }
            
            // Extraire les catégories uniques
            const cats = [...new Set(articlesData.map(a => a.categorie).filter(Boolean))];
            setCategories(cats);
        } catch (err) {
            toast.error("Erreur lors du chargement des données");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    
    const checkCaisseStatus = async () => {
        try {
            const res = await caisseAPI.getStatut();
            setCaisseStatut(res.data || res || null);
        } catch (err) {
            // Si la caisse est fermée, on reste sur l'état précédent
        }
    };
    
    // Filtrer les articles
    const filteredArticles = useMemo(() => {
        return articles.filter(article => {
            const matchSearch = article.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (article.code && article.code.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchCategory = selectedCategory === 'all' || article.categorie === selectedCategory;
            return matchSearch && matchCategory && article.quantite > 0;
        });
    }, [articles, searchTerm, selectedCategory]);
    
    // Calculer le total du panier
    const cartTotal = useMemo(() => {
        return panier.reduce((total, item) => total + item.prixTotal, 0);
    }, [panier]);
    
    // Calculer le total des remises
    const totalRemise = useMemo(() => {
        return panier.reduce((total, item) => {
            const remise = item.remiseTemp || 0;
            return total + (item.remiseType === 'pourcentage' ? (item.prixUnitaire * item.quantite * remise / 100) : remise * item.quantite);
        }, 0);
    }, [panier]);
    
    // Ajouter au panier
    const ajouterAuPanier = () => {
        if (!selectedArticle) {
            toast.error("Veuillez sélectionner un article");
            return;
        }
        
        const article = articles.find(a => a._id === selectedArticle);
        if (!article) return;
        
        const qtyToAdd = parseInt(quantite);
        if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
            toast.error("La quantité doit être supérieure à 0");
            return;
        }
        
        if (qtyToAdd > article.quantite) {
            toast.error(`Stock insuffisant. Disponible: ${article.quantite}`);
            return;
        }
        
        const remiseValue = remiseMontant !== '' ? parseFloat(remiseMontant) : (remisePourcentage !== '' ? parseFloat(remisePourcentage) : 0);
        const remiseType = remisePourcentage !== '' ? 'pourcentage' : itemRemiseType;
        const prixUnitaire = getEffectivePrice(article, remiseValue, remiseType);
        const prixTotal = prixUnitaire * qtyToAdd;
        
        const existeDeja = panier.find(item => item.article._id === selectedArticle);
        
        if (existeDeja) {
            setPanier(panier.map(item =>
                item.article._id === selectedArticle
                    ? { ...item, quantite: item.quantite + qtyToAdd, remiseTemp: remiseValue, remiseType, prixUnitaire, prixTotal: prixUnitaire * (item.quantite + qtyToAdd) }
                    : item
            ));
        } else {
            setPanier([...panier, {
                article,
                quantite: qtyToAdd,
                remiseTemp: remiseValue,
                remiseType,
                prixUnitaire,
                prixTotal
            }]);
        }
        
        // Réinitialiser les champs
        setSelectedArticle('');
        setQuantite(1);
        setRemiseMontant('');
        setRemisePourcentage('');
        setItemRemiseType('montant');
        setShowAddPanel(false);
        
        playBeep();
    };
    
    // Retirer du panier
    const retirerDuPanier = (articleId) => {
        setPanier(panier.filter(item => item.article._id !== articleId));
    };
    
    // Modifier la quantité
    const modifierQuantite = (articleId, nouvelleQuantite) => {
        if (nouvelleQuantite <= 0) {
            retirerDuPanier(articleId);
            return;
        }
        
        const article = articles.find(a => a._id === articleId);
        if (article && nouvelleQuantite > article.quantite) {
            toast.error(`Stock insuffisant. Disponible: ${article.quantite}`);
            return;
        }
        
        setPanier(panier.map(item => {
            if (item.article._id === articleId) {
                const remiseValue = item.remiseTemp || 0;
                const remiseType = item.remiseType || 'montant';
                const prixUnitaire = getEffectivePrice(article, remiseValue, remiseType);
                return {
                    ...item,
                    quantite: nouvelleQuantite,
                    prixUnitaire,
                    prixTotal: prixUnitaire * nouvelleQuantite
                };
            }
            return item;
        }));
    };
    
    // Ouvrir la modale de paiement
    const ouvrirPaiement = () => {
        if (panier.length === 0) {
            toast.error("Le panier est vide");
            return;
        }
        
        if (!caisseStatut) {
            toast.error("La caisse est fermée. Veuillez ouvrir votre caisse d'abord.");
            return;
        }
        
        setMontantPaye(cartTotal.toString());
        setShowPaymentModal(true);
    };
    
    // Générer PDF pour une dette
    const generateDettePDF = (clientNom, montantDette, echeance, montantPayeVal, modePaiementVal) => {
        try {
            const { jsPDF } = require('jspdf');
            const doc = new jsPDF();
            
            doc.setFontSize(18);
            doc.text('FACTURE DE DETTE', 14, 15);
            doc.setFontSize(10);
            doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 14, 22);
            doc.text(`N° Facture: DETTE-${Date.now()}`, 14, 28);
            
            doc.setFontSize(12);
            doc.text('Informations Client', 14, 38);
            doc.setFontSize(10);
            doc.text(`Client: ${clientNom}`, 14, 45);
            doc.text(`Montant dû: ${montantDette.toLocaleString()} GNF`, 14, 51);
            doc.text(`Échéance: ${new Date(echeance).toLocaleDateString('fr-FR')}`, 14, 57);
            
            doc.setFontSize(12);
            doc.text('Détails', 14, 67);
            doc.setFontSize(10);
            doc.text(`Mode de paiement: ${modePaiementVal}`, 14, 74);
            doc.text(`Montant payé: ${montantPayeVal.toLocaleString()} GNF`, 14, 80);
            doc.text(`Reste à payer: ${montantDette.toLocaleString()} GNF`, 14, 86);
            
            doc.save(`dette-${clientNom}-${Date.now()}.pdf`);
            toast.success('PDF de la dette généré !');
        } catch (error) {
            console.error('Erreur génération PDF dette:', error);
        }
    };
    
    // Effectuer la vente
    const effectuerVente = async () => {
        if (panier.length === 0) return;
        
        const totalVente = cartTotal;
        const montantPayeFinal = montantPaye === '' || montantPaye === null ? totalVente : parseFloat(montantPaye);
        
        if (montantPayeFinal < 0) {
            toast.error("Le montant payé ne peut pas être négatif.");
            return;
        }
        
        // Vérifier si une remise a été appliquée
        const hasRemise = panier.some(item => item.remiseTemp && item.remiseTemp > 0);
        
        // Vérifier si c'est une dette
        if (montantPayeFinal < totalVente && !selectedClientId && totalVente > 0) {
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
        
        setIsSubmitting(true);
        
        const venteData = {
            panier: panier.map(item => ({
                article: item.article._id,
                quantite: item.quantite,
                remiseTemp: item.remiseTemp || 0,
                remiseType: item.remiseType || 'montant',
                prixTotal: item.prixTotal
            })),
            clientId: selectedClientId || null,
            montantPaye: montantPayeFinal,
            modePaiement: modePaiement,
            echeanceDette: (montantPayeFinal < totalVente) ? (echeanceDette || null) : null,
            hasRemise: hasRemise,
            transactionRef: transactionRef,
            numeroTable: numeroTable,
            ouvertureCaisseId: caisseStatut.session?._id || caisseStatut._id,
            gerantId: localStorage.getItem('userId')
        };
        
        try {
            let venteCreee;
            
            if (!navigator.onLine) {
                await saveVenteOffline(venteData);
                setSuccessMessage('Connexion instable. Vente sauvegardée localement (Offline).');
                loadOfflineSales();
            } else {
                venteCreee = await venteAPI.create(venteData);
            }
            
            const clientObj = clients.find(c => c._id === selectedClientId);
            const isDette = montantPayeFinal < totalVente;
            const detteCreee = isDette && clientObj ? {
                clientId: selectedClientId,
                montant: totalVente - montantPayeFinal,
                echeance: echeanceDette,
                venteId: venteCreee?._id || 'offline'
            } : null;
            
            let receiptData;
            
            if (clientObj) {
                receiptData = {
                    isDebtPayment: false,
                    shopName: boutiqueConfig?.nom,
                    address: boutiqueConfig?.adresse,
                    phone: boutiqueConfig?.telephone,
                    transactionId: `VTE-${Date.now()}`,
                    cashierName: localStorage.getItem('userName') || 'Caissier',
                    clientName: clientObj.nom,
                    date: new Date(),
                    items: panier,
                    modePaiement: modePaiement,
                    subTotal: panier.reduce((acc, item) => acc + (item.article.prixVente * item.quantite), 0),
                    itemLevelDiscount: 0,
                    pourboire: 0,
                    totalNet: totalVente,
                    amountPaid: montantPayeFinal,
                    change: montantPayeFinal - totalVente,
                    echeanceDette: echeanceDette,
                    transactionRef: transactionRef,
                    isDette: isDette,
                    detteCreee: detteCreee
                };
            }
            
            // Générer et télécharger le PDF automatiquement
            if (receiptData) {
                try {
                    await generateReceiptPDF(receiptData);
                    toast.success('Ticket généré automatiquement !');
                    
                    // Si c'est une dette, générer aussi le PDF de la dette
                    if (isDette && detteCreee && clientObj) {
                        setTimeout(() => {
                            generateDettePDF(
                                clientObj.nom,
                                detteCreee.montant,
                                detteCreee.echeance,
                                montantPayeFinal,
                                modePaiement
                            );
                        }, 500);
                    }
                } catch (pdfError) {
                    console.error('Erreur génération PDF:', pdfError);
                    // Ne pas bloquer la vente si le PDF échoue
                }
            }
            
            setSuccessMessage(isDette ? "Vente avec dette enregistrée !" : "Vente effectuée avec succès !");
            
            // Réinitialiser le panier
            setPanier([]);
            setSelectedClientId('');
            setNumeroTable('');
            setMontantPaye('');
            setModePaiement('Cash');
            setTransactionRef('');
            setEcheanceDette('');
            
            // Rafraîchir les données
            loadInitialData();
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            if (!err.response) {
                await saveVenteOffline(venteData);
                setSuccessMessage('Erreur réseau. Vente sécurisée en mode Offline.');
                loadOfflineSales();
                setPanier([]);
            } else {
                toast.error(err.response?.data?.message || "Erreur lors de la vente");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Fonctions pour les brouillons
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
            total: cartTotal
        };

        setBrouillons([newDraft, ...brouillons]);
        setPanier([]);
        setSelectedClientId('');
        setMontantPaye('');
        setEcheanceDette('');
        setSuccessMessage("Vente mise en brouillon !");
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const chargerBrouillon = (draft) => {
        if (panier.length > 0 && !window.confirm("Le panier actuel sera remplacé par ce brouillon. Continuer ?")) {
            return;
        }
        setPanier(draft.panier);
        setSelectedClientId(draft.selectedClientId);
        setMontantPaye(draft.montantPaye);
        setEcheanceDette(draft.echeanceDette);
        setBrouillons(brouillons.filter(b => b.id !== draft.id));
    };

    const loadOfflineSales = async () => {
        const currentUserId = localStorage.getItem('userId');
        const allSales = await getOfflineVentes();
        const mySales = allSales.filter(sale => sale.venteData.gerantId === currentUserId);
        setOfflineSales(mySales);
        setOfflineCount(mySales.length);
    };

    const handleManualSync = async () => {
        if (!navigator.onLine) {
            toast.error("Le serveur est injoignable. Vérifiez votre connexion.");
            return;
        }
        setLoading(true);
        try {
            const userId = localStorage.getItem('userId');
            const result = await syncVentes(userId);
            if (result.success > 0 || result.failure > 0) {
                const msg = result.failure > 0
                    ? `${result.success} synchronisée(s), ${result.failure} échec(s).`
                    : `${result.success} vente(s) synchronisée(s) avec succès !`;
                setSuccessMessage(msg);
                playSuccessSound();
                loadOfflineSales();
            }
        } catch (err) {
            toast.error("Erreur lors de la synchronisation");
        } finally {
            setLoading(false);
            setShowOfflineSalesModal(false);
            setTimeout(() => setSuccessMessage(''), 3000);
        }
    };
    
    // Traiter un scan de code-barres
    const processBarcode = (code) => {
        if (!code) return;
        
        const article = articles.find(a => a.code && a.code.toLowerCase() === code.toLowerCase());
        if (!article) {
            toast.error(`Article non trouvé: ${code}`);
            return;
        }
        
        if (article.quantite <= 0) {
            toast.error(`Stock épuisé: ${article.nom}`);
            return;
        }
        
        setPanier(prevPanier => {
            const existeDeja = prevPanier.find(item => item.article._id === article._id);
            
            if (existeDeja) {
                if (article.quantite <= existeDeja.quantite) {
                    toast.error(`Stock insuffisant pour ajouter plus de "${article.nom}".`);
                    return prevPanier;
                }
                const currentRemise = existeDeja.remiseTemp || 0;
                const currentRemiseType = existeDeja.remiseType || 'montant';
                const newUnitPrice = getEffectivePrice(article, currentRemise, currentRemiseType);
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
                        remiseType: 'montant',
                        quantite: 1,
                        prixTotal: getEffectivePrice(article) * 1
                    }
                ];
            }
        });
        
        playBeep();
    };

    // Gestion du scanner caméra
    useEffect(() => {
        if (showScanner) {
            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );

            let lastScannedCode = null;
            let lastScannedTime = 0;

            scanner.render((decodedText) => {
                const now = Date.now();
                if (decodedText === lastScannedCode && now - lastScannedTime < 1500) {
                    return;
                }
                lastScannedCode = decodedText;
                lastScannedTime = now;
                processBarcode(decodedText);
            }, (error) => {
                // Ignorer les erreurs de scan en continu
            });

            return () => {
                scanner.clear().catch(error => console.error("Failed to clear scanner", error));
            };
        }
    }, [showScanner, articles]);
    
    // Gestion du scanner
    const handleBarcodeScan = (e) => {
        e.preventDefault();
        processBarcode(barcode);
        setBarcode('');
    };
    
    // Gérer le succès de création/modification de client
    const handleClientSuccess = (client, isEdit) => {
        // Ajouter le nouveau client à la liste ou mettre à jour
        if (isEdit) {
            setClients(clients.map(c => c._id === client._id ? client : c));
        } else {
            setClients([...clients, client]);
        }
        // Fermer le modal
        setShowClientModal(false);
        // Afficher un message de succès
        toast.success(isEdit ? 'Client modifié avec succès !' : 'Client créé avec succès !');
    };
    
    // Raccourci clavier pour le scanner
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key === 'F2') {
                e.preventDefault();
                barcodeInputRef.current?.focus();
            }
            
            if (e.key === 'F9' && panier.length > 0) {
                e.preventDefault();
                ouvrirPaiement();
            }
            
            if (e.key === 'F12') {
                e.preventDefault();
                setShowViderModal(true);
            }
        };
        
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [panier]);
    
    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100">
                <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Chargement...</span>
                </Spinner>
            </div>
        );
    }
    
    if (!caisseStatut) {
        return (
            <div className="container-fluid p-4">
                <Alert variant="warning" className="text-center">
                    <iconify-icon icon="solar:lock-keyhole-bold" style={{ fontSize: '48px' }}></iconify-icon>
                    <h4 className="fw-bold mt-3">Caisse Fermée</h4>
                    <p className="text-muted">Vous devez ouvrir votre caisse pour effectuer des ventes.</p>
                    <Button 
                        variant="success" 
                        size="lg"
                        onClick={() => navigate('/caissier/caisse')}
                        className="mt-3"
                    >
                        <iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon>
                        Ouvrir ma Caisse
                    </Button>
                </Alert>
            </div>
        );
    }

    // Modale de confirmation pour vider le panier
    const renderViderModal = () => (
        <Modal show={showViderModal} onHide={() => setShowViderModal(false)} centered size="sm">
            <Modal.Header closeButton className="border-0">
                <Modal.Title className="fw-bold h5">Confirmation</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center py-4">
                <div className="mb-3" style={{ fontSize: '56px', color: '#dc3545' }}>
                    <iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon>
                </div>
                <h6 className="fw-bold mb-2">Vider le panier ?</h6>
                <p className="text-muted small mb-0">Cette action est irréversible et retirera tous les articles en cours.</p>
            </Modal.Body>
            <Modal.Footer className="justify-content-center border-0 gap-2 pb-4">
                <Button variant="light" onClick={() => setShowViderModal(false)} className="rounded-pill px-3 fw-bold btn-sm">Annuler</Button>
                <Button variant="danger" onClick={() => { setPanier([]); setShowViderModal(false); }} className="rounded-pill px-3 fw-bold shadow-sm btn-sm">Oui, vider</Button>
            </Modal.Footer>
        </Modal>
    );
    
    return (
        <div className="caissier-pos-container">
            {/* Header avec statistiques */}
            <Row className="mb-3 g-2">
                <Col md={3}>
                    <Card className="border-0 shadow-sm bg-primary-subtle">
                        <Card.Body className="p-2">
                            <small className="text-muted">Ventes aujourd'hui</small>
                            <h5 className="fw-bold mb-0 text-primary">{cartTotal.toLocaleString()} GNF</h5>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="border-0 shadow-sm bg-success-subtle">
                        <Card.Body className="p-2">
                            <small className="text-muted">Articles dans le panier</small>
                            <h5 className="fw-bold mb-0 text-success">{panier.reduce((sum, item) => sum + item.quantite, 0)}</h5>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="border-0 shadow-sm bg-info-subtle">
                        <Card.Body className="p-2">
                            <small className="text-muted">Remises accordées</small>
                            <h5 className="fw-bold mb-0 text-info">{totalRemise.toLocaleString()} GNF</h5>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="border-0 shadow-sm bg-warning-subtle">
                        <Card.Body className="p-2">
                            <small className="text-muted">Caisse</small>
                            <h5 className="fw-bold mb-0 text-warning">
                                <Badge bg="success" pill>Ouverte</Badge>
                            </h5>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            
            <Row className="g-3">
                {/* Colonne gauche : Grille de produits */}
                <Col lg={8}>
                    <Card className="border-0 shadow-sm">
                        <Card.Body className="p-3">
                            {/* Barre de recherche et filtres */}
                            <Row className="g-2 mb-3">
                                <Col md={8}>
                                    <InputGroup>
                                        <Form.Control
                                            type="text"
                                            placeholder="Rechercher un article ou scanner..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            ref={barcodeInputRef}
                                        />
                                        <Button variant="outline-secondary">
                                            <iconify-icon icon="solar:magnifer-bold"></iconify-icon>
                                        </Button>
                                    </InputGroup>
                                </Col>
                                <Col md={4}>
                                    <Form.Select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                    >
                                        <option value="all">Toutes catégories</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </Form.Select>
                                </Col>
                            </Row>
                            
                            {/* Grille de produits */}
                            <div style={{ height: 'calc(100vh - 350px)', overflowY: 'auto' }}>
                                <Row className="g-2">
                                    {filteredArticles.map(article => (
                                        <Col md={4} lg={3} key={article._id}>
                                            <Card 
                                                className={`h-100 border-2 cursor-pointer ${selectedArticle === article._id ? 'border-primary' : ''}`}
                                                onClick={() => {
                                                    setSelectedArticle(article._id);
                                                    setQuantite(1);
                                                    setShowAddPanel(true);
                                                }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <Card.Body className="p-2">
                                                    {article.image && (
                                                        <div className="text-center mb-2">
                                                            <img 
                                                                src={article.image} 
                                                                alt={article.nom}
                                                                style={{ maxHeight: '60px', maxWidth: '100%' }}
                                                            />
                                                        </div>
                                                    )}
                                                    <h6 className="fw-bold mb-1 text-truncate">{article.nom}</h6>
                                                    <div className="d-flex justify-content-between align-items-center">
                                                        <Badge bg="success" className="small">
                                                            {article.quantite} en stock
                                                        </Badge>
                                                        <span className="fw-bold text-primary">
                                                            {article.prixVente.toLocaleString()} GNF
                                                        </span>
                                                    </div>
                                                    {article.categorie && (
                                                        <small className="text-muted">{article.categorie}</small>
                                                    )}
                                                </Card.Body>
                                            </Card>
                                        </Col>
                                    ))}
                                </Row>
                                
                                {filteredArticles.length === 0 && (
                                    <Alert variant="info" className="text-center">
                                        Aucun article trouvé
                                    </Alert>
                                )}
                            </div>

                            {/* Panneau d'ajout rapide */}
                            {showAddPanel && selectedArticle && (
                                <Card className="mt-3 border-primary" style={{ borderWidth: '2px' }}>
                                    <Card.Body className="p-3">
                                        {(() => {
                                            const article = articles.find(a => a._id === selectedArticle);
                                            if (!article) return null;
                                            return (
                                                <>
                                                    <h6 className="fw-bold mb-3">Ajouter au panier</h6>
                                                    <Row className="g-2">
                                                        <Col md={4}>
                                                            <Form.Group>
                                                                <Form.Label>Article</Form.Label>
                                                                <Form.Control
                                                                    type="text"
                                                                    value={article.nom}
                                                                    readOnly
                                                                    disabled
                                                                />
                                                            </Form.Group>
                                                        </Col>
                                                        <Col md={2}>
                                                            <Form.Group>
                                                                <Form.Label>Quantité</Form.Label>
                                                                <Form.Control
                                                                    type="number"
                                                                    min="1"
                                                                    max={article.quantite}
                                                                    value={quantite}
                                                                    onChange={(e) => setQuantite(parseInt(e.target.value) || 1)}
                                                                />
                                                            </Form.Group>
                                                        </Col>
                                                        <Col md={3}>
                                                            <Form.Group>
                                                                <Form.Label>Remise (Montant)</Form.Label>
                                                                <InputGroup>
                                                                    <Form.Control
                                                                        type="number"
                                                                        min="0"
                                                                        value={remiseMontant}
                                                                        onChange={(e) => setRemiseMontant(e.target.value)}
                                                                        placeholder="0"
                                                                    />
                                                                    <InputGroup.Text>GNF</InputGroup.Text>
                                                                </InputGroup>
                                                            </Form.Group>
                                                        </Col>
                                                        <Col md={3}>
                                                            <Form.Group>
                                                                <Form.Label>Remise (%)</Form.Label>
                                                                <Form.Control
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    value={remisePourcentage}
                                                                    onChange={(e) => setRemisePourcentage(e.target.value)}
                                                                    placeholder="0"
                                                                />
                                                            </Form.Group>
                                                        </Col>
                                                    </Row>
                                                    <div className="d-grid gap-2 mt-3">
                                                        <Button 
                                                            variant="success" 
                                                            size="lg"
                                                            onClick={ajouterAuPanier}
                                                        >
                                                            <iconify-icon icon="solar:add-circle-bold" className="me-2"></iconify-icon>
                                                            Ajouter au Panier
                                                        </Button>
                                                        <Button 
                                                            variant="outline-secondary"
                                                            onClick={() => {
                                                                setShowAddPanel(false);
                                                                setSelectedArticle('');
                                                            }}
                                                        >
                                                            Annuler
                                                        </Button>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </Card.Body>
                                </Card>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
                
                {/* Colonne droite : Panier */}
                <Col lg={4}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Header className="bg-white py-3">
                            <h5 className="fw-bold mb-0">
                                <iconify-icon icon="solar:cart-bold" className="me-2"></iconify-icon>
                                Panier ({panier.length})
                            </h5>
                        </Card.Header>
                        <Card.Body className="d-flex flex-column">
                            {/* Liste des articles dans le panier */}
                            <div style={{ maxHeight: 'calc(100vh - 500px)', overflowY: 'auto' }} className="mb-3">
                                {panier.map(item => (
                                    <Card key={item.article._id} className="mb-2 border">
                                        <Card.Body className="p-2">
                                            <div className="d-flex justify-content-between align-items-start">
                                                <div className="flex-grow-1">
                                                    <h6 className="fw-bold mb-1">{item.article.nom}</h6>
                                                    <small className="text-muted">
                                                        {item.prixUnitaire.toLocaleString()} GNF x {item.quantite}
                                                    </small>
                                                    {item.remiseTemp > 0 && (
                                                        <Badge bg="danger" className="ms-1">
                                                            -{item.remiseType === 'pourcentage' ? `${item.remiseTemp}%` : `${item.remiseTemp.toLocaleString()} GNF`}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Button 
                                                    variant="link" 
                                                    size="sm" 
                                                    className="text-danger p-0"
                                                    onClick={() => retirerDuPanier(item.article._id)}
                                                >
                                                    <iconify-icon icon="solar:trash-bin-minimalistic-bold"></iconify-icon>
                                                </Button>
                                            </div>
                                            <div className="d-flex justify-content-between align-items-center mt-2">
                                                <InputGroup size="sm">
                                                    <Button 
                                                        variant="outline-secondary"
                                                        onClick={() => modifierQuantite(item.article._id, item.quantite - 1)}
                                                    >
                                                        -
                                                    </Button>
                                                    <Form.Control
                                                        type="number"
                                                        value={item.quantite}
                                                        onChange={(e) => modifierQuantite(item.article._id, parseInt(e.target.value))}
                                                        style={{ width: '60px', textAlign: 'center' }}
                                                    />
                                                    <Button 
                                                        variant="outline-secondary"
                                                        onClick={() => modifierQuantite(item.article._id, item.quantite + 1)}
                                                    >
                                                        +
                                                    </Button>
                                                </InputGroup>
                                                <span className="fw-bold text-primary">
                                                    {item.prixTotal.toLocaleString()} GNF
                                                </span>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                ))}
                                
                                {panier.length === 0 && (
                                    <Alert variant="light" className="text-center text-muted">
                                        <iconify-icon icon="solar:cart-bold" style={{ fontSize: '48px', opacity: 0.3 }}></iconify-icon>
                                        <p className="mt-2">Panier vide</p>
                                    </Alert>
                                )}
                            </div>
                            
                            {/* Résumé et actions */}
                            {panier.length > 0 && (
                                <div className="mt-auto">
                                    <div className="border-top pt-3 mb-3">
                                        <div className="d-flex justify-content-between mb-2">
                                            <span>Sous-total</span>
                                            <span className="fw-bold">{(cartTotal + totalRemise).toLocaleString()} GNF</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-2 text-danger">
                                            <span>Remises</span>
                                            <span>-{totalRemise.toLocaleString()} GNF</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-3 fs-5">
                                            <span className="fw-bold">Total</span>
                                            <span className="fw-bold text-primary">{cartTotal.toLocaleString()} GNF</span>
                                        </div>
                                        
                                        <Button 
                                            variant="success" 
                                            size="lg"
                                            className="w-100 mb-2"
                                            onClick={ouvrirPaiement}
                                        >
                                            <iconify-icon icon="solar:wallet-money-bold" className="me-2"></iconify-icon>
                                            Payer ({cartTotal.toLocaleString()} GNF)
                                        </Button>
                                        
                                        <Button 
                                            variant="outline-secondary" 
                                            size="sm"
                                            className="w-100"
                                            onClick={() => {
                                                if (window.confirm("Vider le panier ?")) {
                                                    setPanier([]);
                                                }
                                            }}
                                        >
                                            <iconify-icon icon="solar:trash-bin-minimalistic-bold" className="me-2"></iconify-icon>
                                            Vider le panier
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            
            {/* Modale de paiement */}
            <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <iconify-icon icon="solar:wallet-money-bold" className="me-2"></iconify-icon>
                        Paiement
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Row className="g-3">
                        <Col md={6}>
                            <Card className="bg-light">
                                <Card.Body>
                                    <h6 className="text-muted">Total à payer</h6>
                                    <h3 className="fw-bold text-primary">{cartTotal.toLocaleString()} GNF</h3>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Client (Optionnel)</Form.Label>
                                <InputGroup>
                                    <Form.Select
                                        value={selectedClientId}
                                        onChange={(e) => setSelectedClientId(e.target.value)}
                                    >
                                        <option value="">Client de passage</option>
                                        {clients.map(client => (
                                            <option key={client._id} value={client._id}>
                                                {client.nom} {client.dette > 0 && `(Dette: ${client.dette.toLocaleString()} GNF)`}
                                            </option>
                                        ))}
                                    </Form.Select>
                                    <Button variant="outline-primary" onClick={() => setShowClientModal(true)}>
                                        <iconify-icon icon="solar:add-circle-bold"></iconify-icon>
                                    </Button>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Montant reçu</Form.Label>
                                <InputGroup>
                                    <Form.Control
                                        type="number"
                                        value={montantPaye}
                                        onChange={(e) => setMontantPaye(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                    <InputGroup.Text>GNF</InputGroup.Text>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group>
                                <Form.Label>Mode de paiement</Form.Label>
                                <Form.Select
                                    value={modePaiement}
                                    onChange={(e) => setModePaiement(e.target.value)}
                                >
                                    <option value="Cash">Espèces</option>
                                    <option value="Orange Money">Orange Money</option>
                                    <option value="MobiCash">MobiCash</option>
                                    <option value="PayCard">PayCard</option>
                                    <option value="Virement">Virement</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        {parseFloat(montantPaye) < cartTotal && selectedClientId && (
                            <Col md={12}>
                                <Alert variant="warning">
                                    <strong>Paiement partiel - Dette</strong>
                                </Alert>
                                <Form.Group className="mt-2">
                                    <Form.Label>Date d'échéance *</Form.Label>
                                    <Form.Control
                                        type="date"
                                        value={echeanceDette}
                                        onChange={(e) => setEcheanceDette(e.target.value)}
                                        required={parseFloat(montantPaye) < cartTotal}
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                    <Form.Text className="text-muted">
                                        Date limite de remboursement
                                    </Form.Text>
                                </Form.Group>
                            </Col>
                        )}
                        {parseFloat(montantPaye) > cartTotal && (
                            <Col md={12}>
                                <Alert variant="info">
                                    <strong>Monnaie à rendre:</strong> {(parseFloat(montantPaye) - cartTotal).toLocaleString()} GNF
                                </Alert>
                            </Col>
                        )}
                    </Row>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
                        Annuler
                    </Button>
                    <Button 
                        variant="success" 
                        size="lg"
                        onClick={effectuerVente}
                        disabled={
                            isSubmitting || 
                            !montantPaye || 
                            (parseFloat(montantPaye) < cartTotal && (!selectedClientId || !echeanceDette))
                        }
                    >
                        {isSubmitting ? (
                            <>
                                <Spinner as="span" animation="border" size="sm" className="me-2" />
                                Traitement...
                            </>
                        ) : (
                            <>
                                <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                                Confirmer la vente
                            </>
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
            
            {/* Raccourcis clavier */}
            <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1000 }}>
                <Card className="border-0 shadow-sm" style={{ fontSize: '0.75rem' }}>
                    <Card.Body className="py-2 px-3">
                        <small className="text-muted">
                            <strong>Raccourcis:</strong><br/>
                            F2: Scanner | F9: Payer | F12: Vider panier
                        </small>
                    </Card.Body>
                </Card>
            </div>

            {/* Modale de confirmation pour vider le panier */}
            {renderViderModal()}
            
            {/* Modale de création/édition de client */}
            <ClientModal 
                show={showClientModal} 
                onHide={() => setShowClientModal(false)} 
                onSuccess={handleClientSuccess}
            />
        </div>
    );
};

export default CaissierPOS;