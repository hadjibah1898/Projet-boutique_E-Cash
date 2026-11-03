/**
 * @file stockRoutes.js
 * @description Routes stock : transferts, ajustements, inventaires, promotions, mouvements.
 * @module Routes/Stock
 */

const router = require('express').Router();
const ctrl = require('../controllers/stockController');

// 🟢 IMPORTATION DU BON CONTRÔLEUR POUR LES MOUVEMENTS
const mouvementController = require('../controllers/mouvementController');

const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess } = require('../middleware/storeAccess');

router.use(protect);

// ✅ 1. ROUTE RACINE : Gestion des mouvements pour la page Mouvements
// Appelée par GET /api/mouvements?statutTransfert=...
// 🟢 CORRECTION ICI : On utilise mouvementController.getAllMouvements
router.get('/', mouvementController.getAllMouvements);

// 2. Catalogue (lecture unifiée via le service)
router.get('/products', ctrl.listProducts);

// 3. Transferts : création/expédition (ADMIN, MANAGER), réception (MANAGER, CASHIER)
router.post('/transfers', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createTransfer);
router.post('/transfers/:stockTransferId/ship', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.shipTransfer);
router.post('/transfers/:stockTransferId/receive', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.receiveTransfer);
router.post('/transfers/:stockTransferId/cancel', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.cancelTransfer);
router.get('/transfers/:stockTransferId', ctrl.getTransfer);
router.get('/transfers/store/:storeId', requireStoreAccess, ctrl.getTransfersByStore);

// 4. Ajustements : demande (MANAGER, CASHIER), décision (ADMIN, MANAGER)
router.post('/adjustments', requireRole('ADMIN', 'MANAGER', 'CASHIER'), ctrl.requestAdjustment);
router.post('/adjustments/:stockAdjustmentId/decide', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.decideAdjustment);
router.get('/adjustments/:stockAdjustmentId', ctrl.getAdjustment);
router.get('/adjustments/store/:storeId', requireStoreAccess, ctrl.getAdjustmentsByStore);

// 5. Inventaires : ouverture/comptage (ADMIN, MANAGER), validation (ADMIN, MANAGER)
router.post('/inventories', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.openInventory);
router.post('/inventories/:inventoryId/count', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.countInventory);
router.post('/inventories/:inventoryId/validate', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.validateInventory);
router.get('/inventories/:inventoryId', ctrl.getInventory);

// 6. Promotions
router.post('/promotions', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createPromotion);
router.post('/promotions/expiry', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.applyExpiryPromo);
router.post('/promotions/disable-expired', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.disableExpiredPromotions);
router.get('/promotions/store/:storeId', requireStoreAccess, ctrl.getActivePromotions);

// 7. Journal des mouvements par ID de boutique (existant)
router.get('/movements/:storeId', requireStoreAccess, ctrl.getMovements);

module.exports = router;