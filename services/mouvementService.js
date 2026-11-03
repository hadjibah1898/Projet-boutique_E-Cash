const { StockMovementDAL } = require('../dal/stockMovementDAL');
const { poolPromise, sql } = require('../config/db');

exports.listerMouvements = async (filter = {}, user = null) => {
    let storeId = filter.boutique;
    
    // Si le filtre est vide, on le passe à null
    if (!storeId || storeId === 'null' || storeId === 'undefined' || storeId === '') {
        storeId = null;
    }

    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.roleCode);

    // 🟢 CORRECTION ICI : On ne force le storeId de l'utilisateur QUE s'il n'est pas Admin
    if (!storeId && !isAdmin && user && user.storeId) {
        storeId = user.storeId;
    }

    // =====================================================================
    // 🟢 CAS 1 : SUIVI DES TRANSFERTS (EN TRANSIT OU HISTORIQUE)
    // =====================================================================
    if (filter.statutTransfert === 'EXPEDIE' || filter.statutTransfert === 'RECU' || filter.type === 'Transfert') {
        const pool = await poolPromise;
        const targetStatus = filter.statutTransfert === 'EXPEDIE' ? 4 : (filter.statutTransfert === 'RECU' ? 5 : null);
        
        let query = `
            SELECT 
                t.stockTransferId,
                t.vcTransferNumber,
                t.dtShippedAt,
                t.dtReceivedAt,
                t.vcCarrierName,
                src.vcStoreName AS sourceName,
                dest.vcStoreName AS destName,
                u.vcFirstName + ' ' + u.vcLastName AS operateurName 
            FROM tblStockTransfer t
            INNER JOIN tblStore src ON src.storeId = t.sourceStoreId
            INNER JOIN tblStore dest ON dest.storeId = t.destinationStoreId
            LEFT JOIN tblUser u ON u.userId = t.createdByUserId 
            WHERE 1=1
        `;

        if (targetStatus) query += ` AND t.transferStatusId = ${targetStatus}`;
        
        if (!isAdmin && storeId) {
            query += ` AND t.destinationStoreId = ${Number(storeId)}`;
        } else if (filter.boutiqueDestination) {
            query += ` AND t.destinationStoreId = ${Number(filter.boutiqueDestination)}`;
        }

        query += ` ORDER BY t.dtShippedAt DESC`;

        const result = await pool.request().query(query);

        const formattedData = await Promise.all(result.recordset.map(async (t) => {
            const detailsQuery = `
                SELECT 
                    d.productId AS articleId,
                    p.vcProductName AS nomArticle,
                    d.dcShippedQuantity AS quantite,
                    p.dcDefaultAlertThreshold AS prixAchatUnitaire
                FROM tblStockTransferDetail d
                INNER JOIN tblProduct p ON p.productId = d.productId
                WHERE d.stockTransferId = ${t.stockTransferId}
            `;
            const detailsRes = await pool.request().query(detailsQuery);
            
            return {
                _id: t.stockTransferId,
                createdAt: t.dtShippedAt || t.dtReceivedAt || new Date().toISOString(),
                type: 'TRANSFER_OUT', 
                isPending: targetStatus === 4,
                isCancelled: false,
                boutiqueSource: { nom: t.sourceName || 'Dépôt Principal' },
                boutiqueDestination: { nom: t.destName || 'Boutique' },
                operateur: { nom: t.operateurName || 'Système' },
                nomTransporteur: t.vcCarrierName || 'Non spécifié',
                articles: detailsRes.recordset,
                details: `Bon de transfert #${t.vcTransferNumber}`
            };
        }));

        return { data: formattedData, totalCount: formattedData.length, totalPages: 1, currentPage: 1 };
    }

    // =====================================================================
    // 🟢 CAS 2 : MOUVEMENTS CLASSIQUES (Approvisionnements, Ventes, Pertes)
    // =====================================================================
    // Si ce n'est pas un Admin et qu'il n'a pas de storeId, on bloque
    if (!storeId && !isAdmin) {
        throw new Error("Une boutique doit être spécifiée pour lister les mouvements.");
    }

    // 🟢 ICI, storeId peut être NULL si c'est un Admin. La procédure SQL renverra tout.
  // Dans le CAS 2 de mouvementService.js :
    const mouvements = await StockMovementDAL.getByStore(storeId, {
        productId: filter.articleId || null,
        typeCode: filter.type || null, // 🟢 On passe le filtre type ici
        limit: filter.limit ? parseInt(filter.limit) : 100
    });

    const typeMap = {
        1: 'PURCHASE_RECEIPT', 2: 'SALE', 3: 'TRANSFER_OUT', 4: 'TRANSFER_IN',
        5: 'ADJUSTMENT_IN', 6: 'ADJUSTMENT_OUT', 7: 'SALE_CANCEL', 8: 'RETURN_TO_SUPPLIER'
    };

    const formattedData = mouvements.map(m => {
        let typeCode = m.vcCode || m.type;
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
            origineNom = m.fournisseurNom ? `Fournisseur: ${m.fournisseurNom}` : `Fournisseur #${m.referenceId || 'Inconnu'}`;
            destinationNom = m.storeName || `Boutique #${m.storeId}`;
        } else if (isSale) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = 'Client';
        } else if (isAdjustment) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = 'Poubelle / Perte';
        } else if (isTransferOut) {
            origineNom = m.storeName || `Boutique #${m.storeId}`;
            destinationNom = m.destinationStoreName || `Boutique #${m.referenceId}`;
        } else if (isTransferIn) {
            origineNom = m.destinationStoreName || `Boutique #${m.referenceId}`;
            destinationNom = m.storeName || `Boutique #${m.storeId}`;
        }

        return {
            _id: m.stockMovementId, 
            createdAt: m.dtMovementAt || new Date().toISOString(), 
            type: typeCode, 
            typeLabel: m.vcStockMovementType || 'Mouvement de stock', 
            isPending: isTransferOut, 
            isCancelled: m.isCancelled === true || m.isCancelled === 1,
            
            boutiqueSource: { nom: origineNom },
            boutiqueDestination: { nom: destinationNom },
            operateur: { nom: m.operatedByName || 'Système' },
            
            articles: [{
                articleId: m.productId || m.articleId, 
                nomArticle: m.vcProductName || 'Produit inconnu',
                quantite: Math.abs(m.dcQuantity) || 0, 
                prixAchatUnitaire: m.mUnitPurchasePrice || 0
            }],
            details: m.vcComment || ''
        };
    });

    return { data: formattedData, totalCount: formattedData.length, totalPages: 1, currentPage: 1 };
};

// ... (le reste de ton fichier)