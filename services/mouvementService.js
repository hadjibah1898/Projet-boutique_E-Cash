const { StockMovementDAL } = require('../dal/stockMovementDAL');
const StockTransferDAL = require('../dal/stockTransferDAL');
const { poolPromise, sql } = require('../config/db');

exports.listerMouvements = async (filter = {}, user = null) => {
    let storeId = filter.boutique;
    
    // Si le filtre est vide, on le passe à null
    if (!storeId || storeId === 'null' || storeId === 'undefined' || storeId === '') {
        storeId = null;
    }

    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.roleCode);
    // ✅ SÉCURITÉ : On récupère l'ID de l'entreprise depuis l'utilisateur
    const companyId = user && user.companyId ? Number(user.companyId) : null;

    // 🛡️ SÉCURITÉ : Si on n'a pas d'entreprise, on renvoie une liste vide
    if (!companyId) {
        return { data: [], totalCount: 0, totalPages: 1, currentPage: 1 };
    }

    // 🟢 On force le storeId de l'utilisateur QUE s'il n'est pas Admin
    if (!storeId && !isAdmin && user && user.storeId) {
        storeId = user.storeId;
    }

    // =====================================================================
    // 🟢 CAS 1 : SUIVI DES TRANSFERTS (EN TRANSIT OU HISTORIQUE)
    // =====================================================================
    if (filter.statutTransfert === 'EXPEDIE' || filter.statutTransfert === 'RECU' || filter.type === 'Transfert') {
        const targetStatus = filter.statutTransfert === 'EXPEDIE' ? 4 : (filter.statutTransfert === 'RECU' ? 5 : null);
        
        const transfers = await StockTransferDAL.getByStore(storeId, companyId, { limit: 100 });

        let filteredTransfers = transfers;
        if (targetStatus) {
            filteredTransfers = transfers.filter(t => t.transferStatusId === targetStatus);
        }

        const formattedData = await Promise.all(filteredTransfers.map(async (t) => {
            const details = await StockTransferDAL.getDetails(t.stockTransferId);

            return {
                _id: t.stockTransferId,
                createdAt: t.dtShippedAt || t.dtReceivedAt || t.dtCreatedAt || new Date().toISOString(),
                type: 'TRANSFER_OUT', 
                isPending: targetStatus === 4,
                isCancelled: t.IsCancelled === true || t.IsCancelled === 1,
                boutiqueSource: { nom: t.SourceStoreName || 'Dépôt Principal' },
                boutiqueDestination: { nom: t.DestinationStoreName || 'Boutique' },
                operateur: { nom: 'Système' }, 
                nomTransporteur: t.vcCarrierName || 'Non spécifié',
                articles: (details || []).map(d => ({
                    articleId: d.productId,
                    nomArticle: d.vcProductName || 'Produit inconnu',
                    quantite: d.dcShippedQuantity || 0,
                    prixAchatUnitaire: d.mUnitPurchasePrice || 0
                })),
                details: `Bon de transfert #${t.vcTransferNumber}`
            };
        }));

        return { data: formattedData, totalCount: formattedData.length, totalPages: 1, currentPage: 1 };
    }

    // =====================================================================
    // 🟢 CAS 2 : MOUVEMENTS CLASSIQUES (Approvisionnements, Ventes, Pertes)
    // =====================================================================
    if (!storeId && !isAdmin) {
        throw new Error("Une boutique doit être spécifiée pour lister les mouvements.");
    }

    const mouvements = await StockMovementDAL.getByStore(storeId, companyId, {
        productId: filter.articleId || null,
        typeCode: filter.type || null,
        limit: filter.limit ? parseInt(filter.limit) : 100
    });

    // ✅ CORRECTION DE L'ERREUR "undefined (reading 'map')"
    const safeMouvements = Array.isArray(mouvements) ? mouvements : [];

    const typeMap = {
        1: 'PURCHASE_RECEIPT', 2: 'SALE', 3: 'TRANSFER_OUT', 4: 'TRANSFER_IN',
        5: 'ADJUSTMENT_IN', 6: 'ADJUSTMENT_OUT', 7: 'SALE_CANCEL', 8: 'RETURN_TO_SUPPLIER'
    };

    const formattedData = safeMouvements.map(m => {
        // ✅ CORRECTION 1 : On utilise les alias exacts de la procédure SQL (typeCode)
        let typeCode = m.typeCode || m.vcCode || m.type;
        if (!typeCode && m.stockMovementTypeId) {
            typeCode = typeMap[m.stockMovementTypeId] || 'UNKNOWN';
        }

        const isTransferOut = typeCode === 'TRANSFER_OUT';
        const isTransferIn = typeCode === 'TRANSFER_IN';
        const isPurchase = typeCode === 'PURCHASE_RECEIPT';
        const isSale = typeCode === 'SALE';
        const isAdjustment = typeCode === 'ADJUSTMENT_OUT' || typeCode === 'ADJUSTMENT_IN';

        // 🟢 LOGIQUE UX : Origine et Destination
        let origineNom = m.storeName || `Boutique #${m.storeId}`;
        let destinationNom = 'N/A';

        if (isPurchase) {
            origineNom = 'Fournisseur';
            destinationNom = m.storeName || `Boutique #${m.storeId}`;
        } else if (isSale) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = 'Client (Vente)';
        } else if (isAdjustment) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = 'Poubelle / Perte';
        } else if (isTransferOut) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = 'Transfert sortant';
        } else if (isTransferIn) {
            origineNom = 'Transfert entrant';
            destinationNom = m.storeName || `Boutique #${m.storeId}`;
        }

        return {
            _id: m.stockMovementId, 
            createdAt: m.date || new Date().toISOString(), 
            type: typeCode, 
            // ✅ CORRECTION 2 : On utilise typeLabel
            typeLabel: m.typeLabel || 'Mouvement de stock', 
            isPending: false, 
            isCancelled: false,
            
            boutiqueSource: { nom: origineNom },
            boutiqueDestination: { nom: destinationNom },
            // ✅ CORRECTION 3 : On utilise userName
            operateur: { nom: m.userName || 'Système' },
            
            articles: [{
                articleId: m.productId, 
                // ✅ CORRECTION 4 : On utilise productName
                nomArticle: m.productName || 'Produit inconnu',
                // ✅ CORRECTION 5 : On utilise quantity
                quantite: Math.abs(m.quantity) || 0, 
                prixAchatUnitaire: 0
            }],
            details: m.commentaire || ''
        };
    });

    return { data: formattedData, totalCount: formattedData.length, totalPages: 1, currentPage: 1 };
};

// ... (le reste de ton fichier)