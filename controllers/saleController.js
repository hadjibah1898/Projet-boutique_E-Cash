/**
 * @file saleController.js
 * @description Ventes (tblSale + tblSaleDetail + tblSalePayment).
 * @module Controllers/Sale
 */

const SaleDAL = require('../dal/saleDAL');
const saleService = require('../services/saleService');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * ✅ Récupère l'historique des ventes.
 */
exports.getHistorique = asyncHandler(async (req, res) => {
  const storeId = Number(req.query.boutique || req.query.storeId || req.user.storeId);
  const limit = req.query.limit ? parseInt(req.query.limit) : 100;

  if (!storeId) {
    return res.status(400).json({ success: false, message: "storeId est obligatoire." });
  }

  const result = await saleService.getHistorique({ storeId, limit });
  res.status(200).json({ success: true, data: result });
});

/**
 * Crée une vente via le service métier.
 * ✅ CORRECTION : Traduction des modes de paiement React vers SQL.
 */
exports.create = asyncHandler(async (req, res) => {
  // 1. Extraction des données
  const rawDetails = req.body.details || req.body.panier || [];
  
  if (!rawDetails || rawDetails.length === 0) {
    return res.status(400).json({ success: false, message: "Le panier est vide : aucun article à vendre." });
  }

  // 2. Formatage des lignes de vente
  const details = rawDetails.map(item => {
    if (item.article && !item.productId) {
      const qty = parseInt(item.quantite) || 1;
      return {
        productId: parseInt(item.article),
        dcQuantity: qty,
        mUnitSalePrice: item.prixTotal ? (item.prixTotal / qty) : 0,
        mDiscountAmount: 0
      };
    }
    return item;
  });

  // 3. Formatage des paiements
  let payments = req.body.payments || [];
  
  // ✅ CORRECTION ICI : Si React n'envoie pas "payments", on le crée avec la bonne traduction SQL
  if (payments.length === 0 && req.body.montantPaye !== undefined) {
    
    // Traduction du mode de paiement React vers le code exact de la table tblRefPaymentMethod
    const modeReact = req.body.modePaiement || 'Cash';
    let codeSQL = 'CASH'; // Par défaut
    
    if (modeReact === 'Orange Money' || modeReact === 'ORANGE_MONEY') codeSQL = 'ORANGE_MONEY';
    else if (modeReact === 'MobiCash' || modeReact === 'MTN_MOMO') codeSQL = 'MTN_MOMO';
    else if (modeReact === 'PayCard' || modeReact === 'CARD') codeSQL = 'CARD';
    else if (modeReact === 'Virement' || modeReact === 'BANK_TRANSFER') codeSQL = 'BANK_TRANSFER';

    payments = [{
      paymentMethodCode: codeSQL, 
      paymentStatusCode: 'SUCCESS',
      mAmount: parseFloat(req.body.montantPaye),
      vcTransactionId: req.body.transactionRef || null // ✅ AJOUT : On enregistre la référence de transaction
    }];
  }

  // 4. Récupération de la session de caisse
  const cashSessionId = req.cashSessionId || req.body.cashSessionId || req.body.ouvertureCaisseId;

  // 5. Appel au service
  const sale = await saleService.createSale({
    user: req.user,
    storeId: Number(req.body.storeId || req.user.storeId),
    cashSessionId: cashSessionId,
    customerId: req.body.customerId || req.body.clientId || null,
    details: details,
    payments: payments,
    statusCode: req.body.statusCode || 'VALIDATED',
    dueDate: req.body.dueDate || req.body.echeanceDette || null,
    req
  });
  
  res.status(201).json({ success: true, data: sale });
});

exports.getByStore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await SaleDAL.getByStore(req.params.storeId) });
});

exports.getBySession = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await SaleDAL.getBySession(req.params.cashSessionId) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const header = await SaleDAL.getHeader(req.params.saleId);
  if (!header) return res.status(404).json({ success: false, message: 'Vente introuvable.' });
  const [details, payments] = await Promise.all([
    SaleDAL.getDetails(req.params.saleId),
    SaleDAL.getPayments(req.params.saleId)
  ]);
  res.json({ success: true, data: { ...header, details, payments } });
});

exports.addPayment = asyncHandler(async (req, res) => {
  const result = await SaleDAL.addPayment(req.params.saleId, req.body);
  res.status(201).json({ success: true, data: result });
});

exports.finalize = asyncHandler(async (req, res) => {
  const result = await saleService.finalizeSale({
    saleId: req.params.saleId,
    payments: req.body.payments || [],
    dueDate: req.body.dueDate || null,
    user: req.user,
    req
  });
  res.json({ success: true, data: result });
});

exports.cancel = asyncHandler(async (req, res) => {
  const isCashier = req.user.roleCode === 'CASHIER';
  if (isCashier) {
    const header = await SaleDAL.getHeader(req.params.saleId);
    if (!header) return res.status(404).json({ success: false, message: 'Vente introuvable.' });
    if (header.statusCode !== 'DRAFT') {
      return res.status(403).json({
        success: false,
        message: 'Un caissier ne peut annuler que ses ventes en brouillon (DRAFT).'
      });
    }
    if (header.sellerUserId !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Cette vente ne vous appartient pas.' });
    }
  }

  const result = await SaleDAL.cancel(req.params.saleId, req.user.userId, req.body.vcCancellationReason);
  res.json({ success: true, data: result });
});