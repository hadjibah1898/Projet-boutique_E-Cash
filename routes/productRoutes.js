/**
 * @file productRoutes.js
 * @description Routes produits, catégories, mise en boutique et stock.
 * @module Routes/Product
 */

const router = require('express').Router();
const ctrl = require('../controllers/productController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { requireStoreAccess } = require('../middleware/storeAccess');

// ✅ Sécurité : Toutes les routes ci-dessous nécessitent d'être connecté
router.use(protect);

// ✅ 1. ROUTE ARTICLES (Racine)
router.get('/', ctrl.getAllArticles);

// ✅ 2. ROUTES AJUSTEMENTS (Onglet Corrections)
router.get('/adjustments', ctrl.getAdjustments);

// 🟢 AJOUT DES DEUX ROUTES MANQUANTES ICI :
router.post('/adjustments', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), ctrl.createAdjustment);
router.put('/adjustments/:id/validate', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.validateAdjustment);

// ✅ 3. ROUTE RÉAPPROVISIONNEMENT (Restock depuis la Centrale)
router.post('/restock', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.restockArticle);

// ✅ 4. ROUTE APPROVISIONNEMENT (Depuis un Fournisseur)
router.post('/approvisionner', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.approvisionner);

// ✅ 5. ROUTES PRODUITS (CRUD)
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createProduct);
router.put('/:productId', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.updateProduct);
router.delete('/:productId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.deleteProduct);

// ✅ 6. AUTRES ROUTES EXISTANTES
router.get('/company/:companyId/categories', ctrl.listCategories);
router.post('/categories', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.createCategory);
router.get('/search', ctrl.search);
router.get('/company/:companyId', ctrl.getByCompany);
router.get('/barcode/:barcode', ctrl.findByBarcode);
router.get('/:productId', ctrl.getOne);
router.post('/store-products', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.addStoreProduct);
router.get('/:productId/store-products', ctrl.getStoreProducts);
router.get('/stock/:storeId', requireStoreAccess, ctrl.getStoreStock);
router.get('/stock/:storeId/low', requireStoreAccess, ctrl.getLowStock);

module.exports = router;