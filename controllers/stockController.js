/**
 * @file stockController.js
 * @description Transferts et ajustements — routes -> controller -> productService -> DAL.
 * @module Controllers/Stock
 */

const StockTransferDAL = require('../dal/stockTransferDAL');
const StockAdjustmentDAL = require('../dal/stockAdjustmentDAL');
const InventoryDAL = require('../dal/inventoryDAL');
const PromotionDAL = require('../dal/promotionDAL');
const { StockMovementDAL } = require('../dal/stockMovementDAL');
const productService = require('../services/productService');
const asyncHandler = require('../middleware/asyncHandler');

// ==========================================
// 1. CATALOGUE & TRANSFERTS
// ==========================================

exports.listProducts = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await productService.listerProduits(req.query, req.user)) });
});

exports.createTransfer = asyncHandler(async (req, res) => {
  const data = await productService.transfererStock({
    sourceStoreId: req.body.sourceStoreId,
    targetStoreId: req.body.targetStoreId || req.body.destinationStoreId,
    items: req.body.items || req.body.details || [],
    user: req.user, 
    vcCarrierName: req.body.vcCarrierName || null, 
    req,
  });
  res.status(201).json({ success: true, data });
});

exports.shipTransfer = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await productService.expedierTransfert(Number(req.params.stockTransferId), req.user, req) });
});

exports.receiveTransfer = asyncHandler(async (req, res) => {
  const data = await productService.confirmerReceptionTransfert(
    Number(req.params.stockTransferId), req.user, req.body.itemsRecus || req.body.receivedQty || null, req);
  res.json({ success: true, data });
});

exports.cancelTransfer = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await productService.annulerTransfert(Number(req.params.stockTransferId), req.user, req.body.vcCancellationReason || null, req),
  });
});

exports.getTransfer = asyncHandler(async (req, res) => {
  const header = await StockTransferDAL.getHeader(Number(req.params.stockTransferId));
  if (!header) return res.status(404).json({ success: false, message: 'Transfert introuvable.' });
  res.json({ success: true, data: { ...header, details: await StockTransferDAL.getDetails(Number(req.params.stockTransferId)) } });
});

exports.getTransfersByStore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await StockTransferDAL.getByStore(Number(req.params.storeId), req.query) });
});

// ==========================================
// 2. AJUSTEMENTS
// ==========================================

exports.requestAdjustment = asyncHandler(async (req, res) => {
  const data = await productService.demanderAjustement({
    storeId: Number(req.body.storeId),
    productId: req.body.productId,
    delta: req.body.delta ?? req.body.dcAdjustmentQuantity,
    reasonCode: req.body.reasonCode,
    vcJustification: req.body.vcJustification,
    user: req.user, 
    req,
  });
  res.status(201).json({ success: true, data });
});

exports.decideAdjustment = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await productService.validerAjustement(
      Number(req.params.stockAdjustmentId), req.body.decision, req.body.comment || null, req.user, req),
  });
});

exports.getAdjustment = asyncHandler(async (req, res) => {
  const header = await StockAdjustmentDAL.getHeader(Number(req.params.stockAdjustmentId));
  if (!header) return res.status(404).json({ success: false, message: 'Ajustement introuvable.' });
  res.json({ success: true, data: { ...header, details: await StockAdjustmentDAL.getDetails(Number(req.params.stockAdjustmentId)) } });
});

exports.getAdjustmentsByStore = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await StockAdjustmentDAL.getByStore(Number(req.params.storeId), req.query) });
});

// ==========================================
// 3. INVENTAIRES
// ==========================================

exports.openInventory = asyncHandler(async (req, res) => {
  const data = await productService.ouvrirInventaire({
    storeId: Number(req.body.storeId), 
    user: req.user, 
    productIds: req.body.productIds || null, 
    req,
  });
  res.status(201).json({ success: true, data });
});

exports.countInventory = asyncHandler(async (req, res) => {
  await InventoryDAL.updateCounts(Number(req.params.inventoryId), req.body.counts || []);
  res.json({ success: true, data: await InventoryDAL.setStatus(Number(req.params.inventoryId), 'COUNTED') });
});

exports.validateInventory = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await productService.validerInventaire(Number(req.params.inventoryId), req.user, req) });
});

exports.getInventory = asyncHandler(async (req, res) => {
  const header = await InventoryDAL.getHeader(Number(req.params.inventoryId));
  if (!header) return res.status(404).json({ success: false, message: 'Inventaire introuvable.' });
  res.json({ success: true, data: { ...header, details: await InventoryDAL.getDetails(Number(req.params.inventoryId)) } });
});

// ==========================================
// 4. PROMOTIONS & MOUVEMENTS
// ==========================================

exports.createPromotion = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await productService.creerPromotion(req.body, req.user, req) });
});

exports.applyExpiryPromo = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await productService.appliquerPromoPeremption({ ...req.body, user: req.user, req }) });
});

exports.disableExpiredPromotions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { disabled: await productService.desactiverPromotionsExpirees() } });
});

exports.getActivePromotions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await PromotionDAL.getActiveForStore(Number(req.params.storeId)) });
});

exports.getMovements = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await StockMovementDAL.getByStore(Number(req.params.storeId), req.query) });
});

// ==========================================
// 5. NOUVELLE FONCTION : MOUVEMENTS (ROUTE RACINE)
// ==========================================

/**
 * ✅ Récupère la liste des mouvements/transferts pour le frontend.
 * Le storeId est lu depuis req.query.boutiqueSource (envoyé par le frontend).
 */
exports.getAllMovements = asyncHandler(async (req, res) => {
  const storeId = req.query.boutiqueSource || req.query.boutique || req.user.storeId;
  
  if (!storeId) {
    return res.status(400).json({ success: false, message: 'storeId (boutique) est obligatoire.' });
  }

  try {
    // On utilise la méthode existante de votre DAL
    const transfers = await StockTransferDAL.getByStore(parseInt(storeId, 10), req.query);

    res.json({ success: true, data: transfers });
  } catch (error) {
    console.error("Erreur getAllMovements:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});