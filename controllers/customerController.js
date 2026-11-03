/**
 * @file customerController.js
 * @description Gestion des clients (tblCustomer).
 * @module Controllers/Customer
 */

const CustomerDAL = require('../dal/customerDAL');
const asyncHandler = require('../middleware/asyncHandler');

function resolveCompanyId(req) {
  const companyId = req.user.roleCode === 'SUPER_ADMIN'
    ? (req.body.companyId || req.query.companyId || req.params.companyId)
    : req.user.companyId;
  return Number(companyId) || null;
}

// ✅ NOUVELLE FONCTION : Récupère tous les clients de l'entreprise
exports.getAll = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }
  
  const customers = await CustomerDAL.getByCompanyId(companyId);
  res.json({ success: true, data: customers });
});

exports.create = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });

  // ✅ CORRECTION : Génération automatique du code client si absent
  let vcCustomerCode = req.body.vcCustomerCode;
  if (!vcCustomerCode || vcCustomerCode.trim() === '') {
    const timestamp = Date.now().toString().slice(-6); // Ex: 876543
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // Ex: 012
    vcCustomerCode = `CLI-${timestamp}${random}`; // Ex: CLI-876543012
  }

  const customerData = {
    ...req.body,
    vcCustomerCode, // On injecte le code généré
    companyId,
    createdByUserId: req.user.userId
  };

  const newCustomer = await CustomerDAL.create(customerData);
  res.status(201).json({ success: true, data: newCustomer });
});

exports.getByCompany = asyncHandler(async (req, res) => {
  const requestedCompanyId = Number(req.params.companyId);
  if (req.user.roleCode !== 'SUPER_ADMIN' && requestedCompanyId !== Number(req.user.companyId)) {
    return res.status(403).json({ success: false, message: 'Accès refusé à cette entreprise.' });
  }
  res.json({ success: true, data: await CustomerDAL.getByCompanyId(requestedCompanyId) });
});

/** Recherche clients (?companyId=&q=...) — écran caisse. */
exports.search = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const requestedCompanyId = Number(req.query.companyId);
  const companyId = req.user.roleCode === 'SUPER_ADMIN'
    ? requestedCompanyId
    : Number(req.user.companyId);
  if (!companyId || !q || !q.trim()) {
    return res.status(400).json({ success: false, message: 'companyId et q sont obligatoires.' });
  }
  if (req.user.roleCode !== 'SUPER_ADMIN' && requestedCompanyId && requestedCompanyId !== companyId) {
    return res.status(403).json({ success: false, message: 'Accès refusé à cette entreprise.' });
  }
  res.json({ success: true, data: await CustomerDAL.search(companyId, q.trim()) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  const customer = await CustomerDAL.findById(req.params.customerId, companyId);
  if (!customer) return res.status(404).json({ success: false, message: 'Client introuvable.' });
  res.json({ success: true, data: customer });
});

exports.update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  const customer = await CustomerDAL.update(req.params.customerId, companyId, req.body);
  if (!customer) return res.status(404).json({ success: false, message: 'Client introuvable.' });
  res.json({ success: true, data: customer });
});

exports.remove = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  if (!companyId) return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  const ok = await CustomerDAL.softDelete(req.params.customerId, companyId);
  if (!ok) return res.status(404).json({ success: false, message: 'Client introuvable.' });
  res.json({ success: true, message: 'Client désactivé.' });
});

// ==========================================
// ✅ NOUVELLES FONCTIONS : DETTES CLIENTS
// ==========================================

/**
 * ✅ Récupère les clients qui ont une dette (solde > 0).
 */
exports.getDebts = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }

  const debts = await CustomerDAL.getDebts(companyId);
  res.json({ success: true, data: debts });
});

/**
 * ✅ Récupère l'historique des dettes (mouvements de compte tiers).
 */
exports.getDebtHistory = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  
  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }

  const history = await CustomerDAL.getDebtHistory(companyId);
  res.json({ success: true, data: history });
});

/**
 * ✅ Évolution de la dette par date et boutique (pour le Dashboard).
 */
exports.getDebtEvolution = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }

  const evolution = await CustomerDAL.getDebtEvolution(companyId);
  res.json({ success: true, data: evolution });
});

/**
 * ✅ NOUVELLE FONCTION : Enregistre un paiement de dette.
 */
exports.payDette = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { montant, modePaiement, transactionRef } = req.body;
  const companyId = resolveCompanyId(req);
  const userId = req.user.userId;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }

  if (!montant || montant <= 0) {
    return res.status(400).json({ success: false, message: 'Le montant doit être supérieur à 0.' });
  }

  try {
    // Appel de la méthode du DAL qu'on a créée juste avant
    const result = await CustomerDAL.payDebt(
      customerId, 
      companyId, 
      Number(montant), 
      modePaiement, 
      transactionRef, 
      userId
    );
    
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Erreur payDette:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});