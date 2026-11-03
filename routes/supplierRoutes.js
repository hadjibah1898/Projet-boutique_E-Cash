/**
 * @file supplierRoutes.js
 * @description Routes fournisseurs.
 * @module Routes/Supplier
 */

const router = require('express').Router();
const ctrl = require('../controllers/supplierController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.use(protect);

// ✅ 1. ROUTE RACINE (Doit être la première !)
// Gère GET /api/fournisseurs (liste pour l'utilisateur connecté)
router.get('/', ctrl.getAllForCurrentUser);

// ✅ 2. ROUTE APPROVISIONNEMENT (Doit être AVANT /:supplierId)
// Gère POST /api/fournisseurs/approvisionner
router.post('/approvisionner', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.approvisionner);

// ✅ 3. Routes spécifiques
router.get('/company/:companyId', ctrl.getByCompany);
router.get('/:supplierId', ctrl.getOne);
router.get('/:supplierId/products', ctrl.getProducts);

// ✅ 4. Routes de modification
router.post('/', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.create);
router.post('/:supplierId/products', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.addProduct);
router.put('/:supplierId', requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'), ctrl.update);
router.delete('/:supplierId', requireRole('SUPER_ADMIN', 'ADMIN'), ctrl.remove);

module.exports = router;