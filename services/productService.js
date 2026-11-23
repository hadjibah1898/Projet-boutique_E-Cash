/**
 * @file productService.js
 * @description Service métier pour les produits, transferts et approvisionnements.
 */

const StockTransferDAL = require('../dal/stockTransferDAL');
const ProductDAL = require('../dal/productDAL');
const SupplierDAL = require('../dal/supplierDAL');

// ==========================================
// 1. GESTION DES TRANSFERTS (Centrale -> Boutique)
// ==========================================
exports.transfererStock = async ({ sourceStoreId, targetStoreId, items, user, vcCarrierName }) => {
    const { StockMovementDAL } = require('../dal/stockMovementDAL');

    if (!user) throw new Error("Utilisateur non authentifié (req.user manquant).");
    if (!sourceStoreId || !targetStoreId) throw new Error("sourceStoreId et targetStoreId sont obligatoires.");
    if (!items || items.length === 0) throw new Error("Au moins un article est requis pour le transfert.");

    try {
        const details = items.map(item => {
            const pId = item.articleId || item.productId || item._id;
            if (!pId) throw new Error(`ID produit manquant pour le transfert de : ${item.nom || 'Inconnu'}`);
            return {
                productId: Number(pId),
                stockLotId: item.stockLotId || null,
                dcRequestedQuantity: Number(item.quantite || item.quantity || 1)
            };
        });

        const transfer = await StockTransferDAL.create({
            sourceStoreId: Number(sourceStoreId),
            destinationStoreId: Number(targetStoreId),
            createdByUserId: user.userId || user.id,
            vcCarrierName,
            details,
        });

        if (!transfer || !transfer.stockTransferId) {
            throw new Error("Erreur lors de la création du transfert : l'ID du transfert est introuvable.");
        }

        const transferDetails = await StockTransferDAL.getDetails(transfer.stockTransferId);
        if (!transferDetails || transferDetails.length === 0) {
            throw new Error("Erreur : Impossible de récupérer les détails du transfert.");
        }

        const shippedQtyMapped = transferDetails.map(d => ({
            stockTransferDetailId: d.stockTransferDetailId,
            qty: Number(d.dcRequestedQuantity)
        }));
        await StockTransferDAL.updateQuantities(transfer.stockTransferId, { shippedQty: shippedQtyMapped });

        await StockTransferDAL.setStatus(transfer.stockTransferId, 'SHIPPED', {
            approvedByUserId: user.userId || user.id
        });

        for (const item of items) {
            const pId = item.articleId || item.productId || item._id;
            await StockMovementDAL.record({
                storeId: Number(sourceStoreId),
                productId: Number(pId),
                typeCode: 'TRANSFER_OUT',
                dcQuantity: Number(item.quantite || item.quantity || 1),
                operatedByUserId: user.userId || user.id,
                vcReferenceType: 'STORE',
                referenceId: Number(targetStoreId),
                vcComment: `Transfert vers boutique #${targetStoreId} | Transporteur: ${vcCarrierName || 'Non spécifié'}`.substring(0, 150)
            });
        }

        return {
            success: true,
            message: "Transfert créé et expédié avec succès.",
            stockTransferId: transfer.stockTransferId,
            vcTransferNumber: transfer.vcTransferNumber
        };
    } catch (error) {
        console.error("❌ Erreur transfert:", error.message);
        throw error;
    }
};

// ==========================================
// 2. GESTION DES APPROVISIONNEMENTS (Fournisseur -> Boutique)
// ==========================================
exports.enregistrerApprovisionnement = async (payload) => {
    const { StockMovementDAL } = require('../dal/stockMovementDAL');

    const { storeId, fournisseurId, items, user, vcCarrierName } = payload;

    if (!user) throw new Error("Utilisateur non authentifié (req.user manquant).");
    if (!storeId) throw new Error("storeId est obligatoire pour l'approvisionnement.");
    if (!items || items.length === 0) throw new Error("Aucun article à approvisionner.");

    const userId = user.userId || user.id;
    const companyId = user.companyId;

    try {
        for (const item of items) {
            let pId = item.articleId || item.productId || item._id;

            const prixAchat = Number(item.mPurchasePrice || item.prixAchat || 0);
            const prixVente = Number(item.mSalePrice || item.prixVente || 0);
            const quantite = Number(item.quantite || item.quantity || 1);

            if (!pId) {
                const nouveauProduit = await ProductDAL.create({
                    companyId: companyId,
                    vcProductCode: item.code || `ART-${Date.now()}`,
                    vcProductName: item.nom || item.nomArticle || 'Nouveau produit',
                    vcDescription: item.description || '',
                    vcBarcode: item.codeBarre || item.vcBarcode || null,
                    vcImageUrl: item.image || item.vcImageUrl || null,
                    createdByUserId: userId,
                    dcDefaultAlertThreshold: item.seuilAlerte || 10
                });

                if (!nouveauProduit || !nouveauProduit.productId) {
                    throw new Error(`Échec de création du produit.`);
                }
                pId = nouveauProduit.productId;
            }

            const produitDansBoutique = await ProductDAL.getStoreProductForSale(Number(storeId), Number(pId));

            if (produitDansBoutique) {
                await ProductDAL.updateStorePrice({
                    storeId: Number(storeId),
                    productId: Number(pId),
                    mCurrentSalePrice: prixVente,
                    // mPurchasePrice retiré car n'existe pas dans tblStoreProduct
                    alertThreshold: item.seuilAlerte || 10,
                    createdByUserId: userId
                });
            } else {
                await ProductDAL.addStoreProduct({
                    storeId: Number(storeId),
                    productId: Number(pId),
                    mCurrentSalePrice: prixVente,
                    // mPurchasePrice retiré car n'existe pas dans tblStoreProduct
                    alertThreshold: item.seuilAlerte || 10,
                    createdByUserId: userId
                });
            }

            await ProductDAL.createStockLot({
                storeId: Number(storeId),
                productId: Number(pId),
                vcLotNumber: `LOT-${Date.now()}-${pId}`,
                dcInitialQuantity: quantite,
                mUnitPurchasePrice: prixAchat,
                dtExpirationAt: item.datePeremption || item.dtExpirationAt || null
            });

            await StockMovementDAL.record({
                storeId: Number(storeId),
                productId: Number(pId),
                typeCode: 'PURCHASE_RECEIPT',
                dcQuantity: quantite,
                operatedByUserId: userId,
                vcReferenceType: 'SUPPLIER',
                referenceId: Number(fournisseurId),
                vcComment: `Approvisionnement | Transporteur: ${vcCarrierName || 'Non spécifié'}`.substring(0, 150)
            });

            try {
                const supplierProducts = await SupplierDAL.getProducts(Number(fournisseurId));
                const dejaLie = supplierProducts.some(p => Number(p.productId) === Number(pId));

                if (!dejaLie) {
                    await SupplierDAL.addProduct({
                        supplierId: Number(fournisseurId),
                        productId: Number(pId),
                        vcSupplierReference: item.code || null,
                        mReferencePurchasePrice: prixAchat,
                        deliveryLeadTimeDays: 0,
                        IsPreferred: 1
                    });
                }
            } catch (err) {
                console.log("Info: Le lien fournisseur-produit existait déjà, on continue.");
            }
        }
        return { success: true, message: "Approvisionnement enregistré et stock mis à jour." };
    } catch (error) {
        console.error("❌ Erreur approvisionnement:", error.message);
        throw error;
    }
};

// ==========================================
// 3. AUTRES FONCTIONS DE BASE
// ==========================================
exports.createProduct = async (data) => await ProductDAL.create(data);
exports.updateProduct = async (productId, data) => await ProductDAL.update(productId, data);
exports.deleteProduct = async (productId) => await ProductDAL.softDelete(productId);

// ==========================================
// 4. EXPÉDITION / RÉCEPTION / ANNULATION DE TRANSFERT
// ==========================================
exports.expedierTransfert = async (stockTransferId, user, req) => {
    const { StockMovementDAL } = require('../dal/stockMovementDAL');
    if (!stockTransferId) throw new Error("stockTransferId est obligatoire.");
    if (!user) throw new Error("Utilisateur non authentifié.");

    const header = await StockTransferDAL.getHeader(stockTransferId);
    if (!header) throw new Error("Transfert introuvable.");

    const details = await StockTransferDAL.getDetails(stockTransferId);
    const shippedQty = details.map(d => ({
        stockTransferDetailId: d.stockTransferDetailId,
        qty: Number(d.dcRequestedQuantity)
    }));
    await StockTransferDAL.updateQuantities(stockTransferId, { shippedQty });

    await StockTransferDAL.setStatus(stockTransferId, 'SHIPPED', {
        approvedByUserId: user.userId || user.id
    });

    return { success: true, message: "Transfert expédié avec succès.", stockTransferId };
};

// ✅ CORRECTION FINALE : Création du lot de stock dans la destination pour le prix d'achat
exports.confirmerReceptionTransfert = async (stockTransferId, user, itemsRecus, req) => {
    const { StockMovementDAL } = require('../dal/stockMovementDAL');
    if (!stockTransferId) throw new Error("stockTransferId est obligatoire.");
    if (!user) throw new Error("Utilisateur non authentifié.");

    const header = await StockTransferDAL.getHeader(stockTransferId);
    if (!header) throw new Error("Transfert introuvable.");

    // ---- Mise à jour des quantités reçues ----
    if (itemsRecus && itemsRecus.length > 0) {
        const details = await StockTransferDAL.getDetails(stockTransferId);
        const receivedQty = details.map(d => {
            const found = itemsRecus.find(r => r.nomArticle === d.vcProductName || r.articleId === d.productId);
            return {
                stockTransferDetailId: d.stockTransferDetailId,
                qty: found ? Number(found.quantiteRecue || found.qty || d.dcRequestedQuantity) : Number(d.dcRequestedQuantity)
            };
        });
        await StockTransferDAL.updateQuantities(stockTransferId, { receivedQty });
    } else {
        const details = await StockTransferDAL.getDetails(stockTransferId);
        const receivedQty = details.map(d => ({
            stockTransferDetailId: d.stockTransferDetailId,
            qty: Number(d.dcRequestedQuantity)
        }));
        await StockTransferDAL.updateQuantities(stockTransferId, { receivedQty });
    }

    await StockTransferDAL.setStatus(stockTransferId, 'RECEIVED', {
        approvedByUserId: user.userId || user.id
    });

    // ---- Propagation du prix d'achat vers la boutique destination ----
    if (header.destinationStoreId) {
        const details = await StockTransferDAL.getDetails(stockTransferId);
        const companyId = user.companyId ? Number(user.companyId) : null;

        const sourceCatalog = await ProductDAL.getArticlesWithDetails(
            Number(header.sourceStoreId),
            companyId
        );

        for (const d of details) {
            const qteRecue = Number(d.dcReceivedQuantity || d.dcRequestedQuantity);

            await StockMovementDAL.record({
                storeId: Number(header.destinationStoreId),
                productId: Number(d.productId),
                typeCode: 'TRANSFER_IN',
                dcQuantity: qteRecue,
                operatedByUserId: user.userId || user.id,
                vcReferenceType: 'STORE',
                referenceId: Number(header.sourceStoreId),
                vcComment: `Réception transfert depuis boutique #${header.sourceStoreId}`.substring(0, 150)
            });

            // Récupération du prix d'achat depuis la source
            const articleSource = sourceCatalog.find(
                a => Number(a.productId) === Number(d.productId)
            );

            const sourceStoreProduct = await ProductDAL.getStoreProductForSale(
                Number(header.sourceStoreId),
                Number(d.productId)
            );

            const prixAchatSource = Number(
                (articleSource && (
                    articleSource.mPurchasePrice ??
                    articleSource.prixAchat ??
                    articleSource.mUnitPurchasePrice
                )) ?? 0
            );

            const prixVente = Number(
                (sourceStoreProduct && sourceStoreProduct.mCurrentSalePrice) ?? 0
            );

            const produitDest = await ProductDAL.getStoreProductForSale(
                Number(header.destinationStoreId),
                Number(d.productId)
            );

            if (!produitDest) {
                // Le produit n'existe pas encore à la destination → création
                await ProductDAL.addStoreProduct({
                    storeId: Number(header.destinationStoreId),
                    productId: Number(d.productId),
                    mCurrentSalePrice: prixVente,
                    alertThreshold: 10,
                    createdByUserId: user.userId || user.id
                });
            } else {
                // Mise à jour du prix de vente dans la destination
                await ProductDAL.updateStorePrice({
                    storeId: Number(header.destinationStoreId),
                    productId: Number(d.productId),
                    mCurrentSalePrice: prixVente,
                    alertThreshold: 10,
                    createdByUserId: user.userId || user.id
                });
            }

            // 🟢 LA GRANDE CORRECTION EST ICI : Création du LOT de stock avec le prix d'achat
            if (qteRecue > 0) {
                await ProductDAL.createStockLot({
                    storeId: Number(header.destinationStoreId),
                    productId: Number(d.productId),
                    vcLotNumber: `LOT-TRF-${stockTransferId}-${d.productId}`,
                    dcInitialQuantity: qteRecue,
                    mUnitPurchasePrice: prixAchatSource, // Le prix d'achat est stocké ici !
                    dtExpirationAt: null 
                });
            }

            // Historique des prix
            await ProductDAL.addPriceHistory({
                storeId: Number(header.destinationStoreId),
                productId: Number(d.productId),
                mPurchasePrice: prixAchatSource,
                mSalePrice: prixVente,
                createdByUserId: user.userId || user.id
            });
        }
    }

    return { success: true, message: "Transfert reçu avec succès.", stockTransferId };
};

exports.annulerTransfert = async (stockTransferId, user, vcCancellationReason, req) => {
    if (!stockTransferId) throw new Error("stockTransferId est obligatoire.");
    if (!user) throw new Error("Utilisateur non authentifié.");

    const header = await StockTransferDAL.getHeader(stockTransferId);
    if (!header) throw new Error("Transfert introuvable.");

    await StockTransferDAL.setStatus(stockTransferId, 'CANCELLED', {
        approvedByUserId: user.userId || user.id,
        vcCancellationReason
    });

    return { success: true, message: "Transfert annulé avec succès.", stockTransferId };
};