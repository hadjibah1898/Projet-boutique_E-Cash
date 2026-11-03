/**
 * @file dashboardController.js
 * @description Statistiques globales du tableau de bord.
 * @module Controllers/Dashboard
 */

const DashboardDAL = require('../dal/dashboardDAL');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * GET /api/dashboard/stats
 * Statistiques pour l'Admin (limitées à son entreprise), le SuperAdmin (global) et le Gérant (sa boutique).
 */
exports.getStats = asyncHandler(async (req, res) => {
  const roleCode = String(req.user.roleCode).toUpperCase();
  const isSuperAdmin = roleCode === 'SUPER_ADMIN';
  const isManager = roleCode === 'MANAGER';
  
  // SuperAdmin n'a pas de companyId spécifique, Admin et Manager ont le leur
  const companyId = isSuperAdmin ? null : req.user.companyId;
  
  // ✅ SÉCURITÉ : Si c'est un Gérant, on force l'ID de SA boutique. 
  // Sinon, on utilise ce que l'admin a passé en paramètre.
  let storeId = req.query.storeId || req.query.boutique || null;
  if (isManager) {
    storeId = req.user.storeId;
  }

  if (!isSuperAdmin && !companyId) {
    return res.status(403).json({ success: false, message: 'Aucune entreprise associée à votre compte.' });
  }

  try {
    // ⚠️ On suppose que tu as modifié DashboardDAL pour accepter le storeId (voir étape 2)
    // Si ta fonction actuelle s'appelle getSuperAdminStats, tu peux lui ajouter le 2ème paramètre
    const stats = await DashboardDAL.getSuperAdminStats(companyId, storeId, req.query.range);
    
    // ✅ On renvoie TOUT l'objet stats au frontend, au lieu de le tronquer
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (err) {
    console.error("Erreur stats dashboard:", err);
    // Fallback complet en cas d'erreur SQL pour ne pas faire planter React
    res.json({ 
      success: true, 
      data: { 
        dailySales: 0, dailyOrders: 0, totalCA: 0, totalRefunds: 0, totalBenefice: 0,
        salesProfit: { categories: [], series: [] },
        productSales: { labels: [], series: [] },
        performanceBoutiques: [],
        performanceGerants: [],
        stockBoutiques: [],
        totalArticlesFaibleStock: 0
      } 
    });
  }
});

/**
 * GET /api/dashboard/superadmin
 * Compteurs globaux + liste des entreprises (réservé au SUPER_ADMIN).
 */
exports.getSuperAdminStats = asyncHandler(async (req, res) => {
  const stats = await DashboardDAL.getSuperAdminStats(null, null);
  res.json({ success: true, data: stats });
});