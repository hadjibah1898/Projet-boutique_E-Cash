/**
 * @file dashboardController.js
 * @description Statistiques globales du tableau de bord.
 * @module Controllers/Dashboard
 */

const DashboardDAL = require('../dal/dashboardDAL');
const StoreDAL = require('../dal/storeDAL'); // ✅ Requis pour vérifier l'accès aux boutiques
const asyncHandler = require('../middleware/asyncHandler');

/**
 * GET /api/dashboard/stats
 * Statistiques pour l'Admin (limitées à son entreprise), le SuperAdmin (global) et le Gérant (sa boutique).
 */
exports.getStats = asyncHandler(async (req, res) => {
  const roleCode = String(req.user.roleCode || '').toUpperCase();
  const isSuperAdmin = roleCode === 'SUPER_ADMIN';
  const isManager = roleCode === 'MANAGER';
  const isAdmin = roleCode === 'ADMIN';

  // SuperAdmin n'a pas de companyId spécifique
  const companyId = isSuperAdmin ? null : (req.user.companyId ? Number(req.user.companyId) : null);
  
  // Récupération du storeId demandé par l'utilisateur (query string)
  let storeId = req.query.storeId 
    ? Number(req.query.storeId) 
    : (req.query.boutique ? Number(req.query.boutique) : null);

  // 🛡️ SÉCURITÉ 1 : Un non Super Admin doit obligatoirement avoir une entreprise
  if (!isSuperAdmin && (!companyId || isNaN(companyId))) {
    return res.status(403).json({ success: false, message: 'Aucune entreprise associée à votre compte.' });
  }

  // 🛡️ SÉCURITÉ 2 : Un Gérant ne voit QUE sa propre boutique
  if (isManager) {
    storeId = req.user.storeId ? Number(req.user.storeId) : null;
    if (!storeId) {
      return res.status(403).json({ success: false, message: 'Aucune boutique associée à votre compte.' });
    }
  }

  // 🛡️ SÉCURITÉ 3 : Un Admin qui demande une boutique doit s'assurer qu'elle lui appartient
  if (isAdmin && storeId) {
    const store = await StoreDAL.findById(storeId, companyId);
    if (!store) {
      return res.status(403).json({ 
        success: false, 
        message: "Accès refusé : cette boutique n'appartient pas à votre entreprise." 
      });
    }
  }

  // ✅ On laisse remonter les erreurs SQL (le middleware d'erreur les gérera proprement)
  const stats = await DashboardDAL.getStats(companyId, storeId, req.query.range);
  
  res.json({ success: true, data: stats });
});

/**
 * GET /api/dashboard/superadmin
 * Compteurs globaux + liste des entreprises (réservé au SUPER_ADMIN).
 */
exports.getSuperAdminStats = asyncHandler(async (req, res) => {
  // 🛡️ SÉCURITÉ : On vérifie le rôle ici aussi (au cas où la route ne le ferait pas)
  if (String(req.user.roleCode).toUpperCase() !== 'SUPER_ADMIN') {
    return res.status(403).json({ 
      success: false, 
      message: 'Accès réservé au Super Administrateur.' 
    });
  }

  const stats = await DashboardDAL.getStats(null, null, req.query.range);
  res.json({ success: true, data: stats });
});