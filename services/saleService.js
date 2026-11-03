/**
 * @file saleService.js
 * @description Service de traitement des ventes — adaptation de l'ancien venteService
 * (Mongoose) au contexte SQL Server / script GestionsBoutiques.
 *
 * Correspondances :
 *  - Panier multi-articles -> tblSale + tblSaleDetail + tblSalePayment
 *  - OuvertureCaisse       -> tblCashSession (OPEN), cashSessionId injecté par
 *                             middleware/cashSessionGuard.js (checkCaisseOuverte)
 *  - Article (boutique)    -> tblProduct + tblStoreProduct (catalogue boutique)
 *  - Mouvement             -> tblStockMovement (StockMovementDAL, type SALE)
 *  - DebtMovement          -> tblThirdPartyAccountMovement (type CUSTOMER_DEBT)
 *  - Alerte stock          -> tblNotification (LOW_STOCK / OUT_OF_STOCK)
 *  - Audit                 -> tblAuditLog (services/auditLogService)

 * @module Services/Sale
 */

const SaleDAL = require('../dal/saleDAL');
const StoreDAL = require('../dal/storeDAL');
const ProductDAL = require('../dal/productDAL');
const ThirdPartyAccountDAL = require('../dal/thirdPartyAccountDAL');
const { notifyLowStock } = require('./notificationService');
const { logAction } = require('./auditLogService');

/**
 * Prépare et valide les lignes du panier contre le catalogue de la boutique
 * (sécurité multi-tenant : on ne vend que le catalogue de SA boutique).
 * @private
 */
async function _prepareDetails(storeId, details, statusCode) {
  const catalog = await ProductDAL.getSaleCatalog(storeId);
  const catalogMap = new Map(catalog.map((row) => [Number(row.productId), row]));

  const preparedDetails = [];
  const stockWarnings = [];
  let mGrossAmount = 0;
  let mDiscountAmount = 0;

  for (const line of details) {
    const productId = Number(line.productId);
    const dcQuantity = Number(line.dcQuantity);

    if (!productId) throw new Error('Chaque ligne doit référencer un productId.');
    if (!dcQuantity || dcQuantity <= 0) throw new Error('Chaque ligne exige une quantité > 0.');

    const catalogRow = catalogMap.get(productId);
    if (!catalogRow) {
      throw new Error(`Accès refusé : le produit ${productId} ne fait pas partie du catalogue de cette boutique.`);
    }

    const mUnitSalePrice = (line.mUnitSalePrice !== undefined && line.mUnitSalePrice !== null)
      ? Number(line.mUnitSalePrice)
      : Number(catalogRow.mCurrentSalePrice);

    // Sécurité anti-vente à perte
    if (line.mUnitPurchasePrice !== undefined && line.mUnitPurchasePrice !== null
      && mUnitSalePrice < Number(line.mUnitPurchasePrice)) {
      throw new Error(`Prix de vente (${mUnitSalePrice}) inférieur au prix d'achat (${line.mUnitPurchasePrice}) pour « ${catalogRow.vcProductName} ».`);
    }

    // Contrôle de disponibilité (le DAL revérifie sous transaction)
    if (statusCode !== 'DRAFT' && Number(catalogRow.dcAvailableQuantity) < dcQuantity) {
      throw new Error(`Stock insuffisant pour « ${catalogRow.vcProductName} » (disponible : ${catalogRow.dcAvailableQuantity}, demandé : ${dcQuantity}).`);
    }

    const lineDiscount = Number(line.mDiscountAmount || 0);
    mGrossAmount += dcQuantity * mUnitSalePrice;
    mDiscountAmount += lineDiscount;

    preparedDetails.push({
      productId,
      stockLotId: line.stockLotId || null,
      dcQuantity,
      mUnitSalePrice,
      mUnitPurchasePrice: line.mUnitPurchasePrice ?? null,
      mDiscountAmount: lineDiscount
    });

    // Projection d'alerte stock après vente
    const projected = Number(catalogRow.dcAvailableQuantity) - dcQuantity;
    const threshold = Number(catalogRow.alertThreshold || 0);
    if (statusCode !== 'DRAFT' && projected <= threshold) {
      stockWarnings.push({
        storeId, productId,
        productName: catalogRow.vcProductName,
        dcAvailableQuantity: projected,
        threshold
      });
    }
  }

  return { preparedDetails, stockWarnings, mGrossAmount, mDiscountAmount };
}

/**
 * Crée une vente complète : contrôles métier, dette client, alertes stock, audit.
 * @param {Object} params - { user, storeId, cashSessionId, customerId, details,
 *                             payments, statusCode, dueDate, req }
 * @returns {Promise<Object>}
 */
async function createSale(params) {
  const {
    user, storeId, cashSessionId, customerId = null, details = [],
    payments = [], statusCode = 'VALIDATED', dueDate = null, req = null
  } = params;

  const auditUser = { userId: user.userId, companyId: user.companyId, storeId };

  try {
    if (!storeId) throw new Error('storeId est obligatoire.');
    if (!cashSessionId) throw new Error('Aucune session de caisse ouverte pour cette vente.');
    if (!details.length) throw new Error('Le panier est vide : aucun article à vendre.');

    // 1. Boutique -> entreprise
    const store = await StoreDAL.findById(storeId);
    if (!store) throw new Error('Boutique introuvable.');
    if (!store.btEnabled) throw new Error('Boutique désactivée.');
    const companyId = store.companyId;

    // 2. Lignes validées contre le catalogue de la boutique
    const { preparedDetails, stockWarnings, mGrossAmount, mDiscountAmount } =
      await _prepareDetails(storeId, details, statusCode);

    // 3. Contrôles paiement / crédit (CK_Sale_Amounts)
    const mNetAmount = mGrossAmount - mDiscountAmount;
    const mPaidAmount = payments.reduce((sum, p) => sum + Number(p.mAmount || 0), 0);
    const mDebtAmount = mNetAmount - mPaidAmount;

    if (mPaidAmount > mNetAmount) throw new Error('Le montant encaissé dépasse le net à payer.');
    if (mDebtAmount > 0 && !customerId) throw new Error('Vente à crédit : un client (customerId) est obligatoire.');
    if (mDebtAmount > 0 && !dueDate) throw new Error('Vente à crédit : une échéance (dueDate) est obligatoire.');

    // 4. Création transactionnelle (entête + lignes + paiements + mouvements SALE)
    const sale = await SaleDAL.create({
      companyId, storeId, cashSessionId, customerId,
      sellerUserId: user.userId,
      details: preparedDetails,
      payments,
      statusCode
    });

    // 5. Dette client -> compte tiers + mouvement CUSTOMER_DEBT
    if (mDebtAmount > 0) {
      const account = await ThirdPartyAccountDAL.getOrCreate({ companyId, customerId });
      await ThirdPartyAccountDAL.recordMovement({
        thirdPartyAccountId: account.thirdPartyAccountId,
        typeCode: 'CUSTOMER_DEBT',
        mAmount: mDebtAmount,
        saleId: sale.saleId,
        storeId,
        operatedByUserId: user.userId,
        note: `Vente ${sale.vcSaleNumber} à crédit — échéance ${new Date(dueDate).toISOString().slice(0, 10)}`
      });
    }

    // 6. Alertes stock (fire-and-forget)
    for (const warning of stockWarnings) {
      notifyLowStock(warning).catch((err) => console.error('[SaleService] Alerte stock :', err.message));
    }

    // 7. Audit succès
    await logAction({
      req, user: auditUser,
      action: 'CREATE_SALE', entity: 'tblSale', entityId: sale.saleId,
      status: 'SUCCESS',
      details: {
        vcSaleNumber: sale.vcSaleNumber,
        nbArticles: preparedDetails.length,
        mGrossAmount, mDiscountAmount, mNetAmount,
        mPaidAmount, mDebtAmount,
        customerId: customerId || 'COMPTANT',
        statusCode
      }
    });

    return { ...sale, mGrossAmount, mDiscountAmount, mNetAmount, mPaidAmount, mDebtAmount };
  } catch (error) {
    // Audit échec
    await logAction({
      req, user: auditUser,
      action: 'CREATE_SALE', entity: 'tblSale', entityId: null,
      status: 'FAILURE', errorMessage: error.message,
      details: { nbArticles: details?.length || 0, customerId, storeId }
    });
    throw error;
  }
}

/**
 * Finalise une vente brouillon (commande -> encaissement) + dette éventuelle.
 * @param {Object} params - { saleId, payments, user, dueDate, req }
 */
async function finalizeSale(params) {
  const { saleId, payments = [], user, dueDate = null, req = null } = params;

  const header = await SaleDAL.getHeader(saleId);
  if (!header) throw new Error('Vente introuvable.');
  if (header.IsCancelled) throw new Error('Vente annulée : finalisation impossible.');

  const result = await SaleDAL.finalize(saleId, payments, user.userId);

  if (result.mDebtAmount > 0) {
    if (!header.customerId) throw new Error('Vente à crédit : un client est obligatoire.');
    const account = await ThirdPartyAccountDAL.getOrCreate({ companyId: header.companyId, customerId: header.customerId });
    await ThirdPartyAccountDAL.recordMovement({
      thirdPartyAccountId: account.thirdPartyAccountId,
      typeCode: 'CUSTOMER_DEBT',
      mAmount: result.mDebtAmount,
      saleId,
      storeId: header.storeId,
      operatedByUserId: user.userId,
      note: `Finalisation vente ${header.vcSaleNumber}${dueDate ? ` — échéance ${new Date(dueDate).toISOString().slice(0, 10)}` : ''}`
    });
  }

  await logAction({
    req,
    user: { userId: user.userId, companyId: header.companyId, storeId: header.storeId },
    action: 'FINALIZE_SALE', entity: 'tblSale', entityId: saleId,
    status: 'SUCCESS',
    details: { mPaidAmount: result.mPaidAmount, mDebtAmount: result.mDebtAmount }
  });

  return result;
}

/**
 * Annule les ventes brouillon (DRAFT) d'une session de caisse — équivalent SQL de
 * `annulerCommandesNonEncaissees`, appelé lors de la clôture de la caisse.
 * @param {number} cashSessionId
 * @param {number} userId
 * @returns {Promise<Object>} { cancelled, saleIds }
 */
async function annulerVentesBrouillon(cashSessionId, userId) {
  const drafts = await SaleDAL.getDraftsBySession(cashSessionId);
  const saleIds = [];

  for (const draft of drafts) {
    try {
      await SaleDAL.cancel(draft.saleId, userId, 'Clôture de caisse : commande non encaissée');
      saleIds.push(draft.saleId);
    } catch (err) {
      console.error(`[SaleService] Annulation du brouillon ${draft.saleId} impossible :`, err.message);
    }
  }

  return { cancelled: saleIds.length, saleIds };
}

/**
 * ✅ NOUVELLE FONCTION : Récupère l'historique des ventes (Zéro SQL).
 * Utilisée par l'écran "Historique des ventes" et le Dashboard.
 */
async function getHistorique(params) {
  const { storeId, limit = 100 } = params;
  if (!storeId) throw new Error('storeId est obligatoire pour lister les ventes.');

  // Appel au DAL qui exécute sp_GetSalesByStore
  const sales = await SaleDAL.getByStore(storeId, { limit });

  return {
    ventes: sales,
    totalCount: sales.length,
    totalPages: 1,
    currentPage: 1
  };
}

module.exports = { 
  createSale, 
  finalizeSale, 
  annulerVentesBrouillon,
  getHistorique // ✅ Ajouté aux exports
};