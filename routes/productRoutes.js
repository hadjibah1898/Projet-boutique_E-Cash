
/**
 * @file productRoutes.js
 * @description Routes produits, catégories, lots et stock.
 * @module Routes/Product
 */

const router = require('express').Router();

const ctrl = require('../controllers/productController');

const {
  protect,
  requireRole
} = require('../middleware/authMiddleware');

const {
  requireStoreAccess
} = require('../middleware/storeAccess');

// Toutes les routes nécessitent une authentification
router.use(protect);

// ==========================================
// 1. LISTE DES ARTICLES
// ==========================================

router.get('/', ctrl.getAllArticles);

// ==========================================
// 2. AJUSTEMENTS
// ==========================================

router.get('/adjustments', ctrl.getAdjustments);

router.post(
  '/adjustments',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'),
  ctrl.createAdjustment
);

router.put(
  '/adjustments/:id/validate',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.validateAdjustment
);

// ==========================================
// 3. APPROVISIONNEMENTS
// ==========================================

router.post(
  '/restock',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.restockArticle
);

router.post(
  '/approvisionner',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.approvisionner
);

// ==========================================
// 4. STOCKS
// ==========================================

router.get(
  '/stock/:storeId',
  requireStoreAccess,
  ctrl.getStoreStock
);

router.get(
  '/stock/:storeId/low',
  requireStoreAccess,
  ctrl.getLowStock
);

// ==========================================
// 5. RECHERCHE
// ==========================================

router.get('/search', ctrl.search);

router.get(
  '/barcode/:barcode',
  ctrl.findByBarcode
);

// ==========================================
// 6. CATEGORIES ET ENTREPRISES
// ==========================================

router.get(
  '/company/:companyId/categories',
  ctrl.listCategories
);

router.get(
  '/company/:companyId',
  ctrl.getByCompany
);

router.post(
  '/categories',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.createCategory
);

// ==========================================
// 7. PRODUITS PAR BOUTIQUE
// ==========================================

router.post(
  '/store-products',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.addStoreProduct
);

router.get(
  '/:productId/store-products',
  ctrl.getStoreProducts
);

// ==========================================
// 8. LOTS ET DATES DE PEREMPTION
// ==========================================

// Récupérer les lots d'un article dans une boutique
router.get(
  '/:productId/lots',
  ctrl.getProductLots
);

// Modifier la date de péremption d'un lot précis
router.put(
  '/:productId/lots/:stockLotId/expiration',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.updateLotExpiration
);

// ==========================================
// 9. CRUD PRODUITS
// ==========================================

router.post(
  '/',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.createProduct
);

router.put(
  '/:productId',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  ctrl.updateProduct
);

router.delete(
  '/:productId',
  requireRole('SUPER_ADMIN', 'ADMIN'),
  ctrl.deleteProduct
);

// Cette route dynamique doit rester à la fin
router.get('/:productId', ctrl.getOne);

module.exports = router;
