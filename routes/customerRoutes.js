
/**
 * @file customerRoutes.js
 * @description Routes clients et encaissement des dettes.
 * @module Routes/Customer
 *
 * RÈGLES D'ENCAISSEMENT :
 *
 * ADMIN :
 * - Peut encaisser une dette sans session ouverte.
 *
 * MANAGER :
 * - Doit avoir sa propre session de caisse OPEN.
 * - Encaisse uniquement dans sa boutique.
 *
 * CASHIER :
 * - Doit avoir sa propre session de caisse OPEN.
 * - Encaisse uniquement dans sa boutique.
 *
 * SUPER_ADMIN :
 * - Ne peut pas encaisser une dette.
 *
 * ZÉRO SQL INLINE.
 */

const router = require('express').Router();

const ctrl = require('../controllers/customerController');

const {
  protect,
  requireRole
} = require('../middleware/authMiddleware');

const {
  checkDebtCollection
} = require('../middleware/cashSessionGuard');

// ============================================
// AUTHENTIFICATION OBLIGATOIRE
// ============================================

router.use(protect);

// ============================================
// ROUTES FIXES
// ============================================

// Récupérer tous les clients
router.get('/', ctrl.getAll);

// Gestion des dettes
router.get('/debts', ctrl.getDebts);

router.get('/debt-history', ctrl.getDebtHistory);

router.get('/debt-evolution', ctrl.getDebtEvolution);

// Recherche des clients
router.get('/search', ctrl.search);

// ============================================
// ROUTES PAR ENTREPRISE
// ============================================

router.get(
  '/company/:companyId',
  ctrl.getByCompany
);

// ============================================
// ENCAISSEMENT DES DETTES
// ============================================

/**
 * POST /api/clients/:customerId/pay-dette
 *
 * Étapes :
 *
 * 1. protect :
 *    Vérifie le JWT.
 *
 * 2. requireRole :
 *    Autorise ADMIN, MANAGER et CASHIER.
 *
 * 3. checkDebtCollection :
 *    ADMIN : session facultative.
 *    MANAGER : session OPEN obligatoire.
 *    CASHIER : session OPEN obligatoire.
 *
 * 4. ctrl.payDette :
 *    Exécute le remboursement.
 */
router.post(
  '/:customerId/pay-dette',

  requireRole(
    'ADMIN',
    'MANAGER',
    'CASHIER'
  ),

  checkDebtCollection,

  ctrl.payDette
);

// ============================================
// ROUTES STANDARD PAR IDENTIFIANT
// ============================================

// Détails d'un client
router.get(
  '/:customerId',
  ctrl.getOne
);

// ============================================
// CRÉATION D'UN CLIENT
// ============================================

router.post(
  '/',
  requireRole(
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'CASHIER'
  ),
  ctrl.create
);

// ============================================
// MODIFICATION D'UN CLIENT
// ============================================

router.put(
  '/:customerId',
  requireRole(
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER'
  ),
  ctrl.update
);

// ============================================
// SUPPRESSION LOGIQUE D'UN CLIENT
// ============================================

router.delete(
  '/:customerId',
  requireRole(
    'SUPER_ADMIN',
    'ADMIN'
  ),
  ctrl.remove
);

module.exports = router;
