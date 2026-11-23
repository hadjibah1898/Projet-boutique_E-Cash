
/**
 * @file storeController.js
 * @description Gestion des boutiques (tblStore) et de leurs utilisateurs (tblUserStore).
 * @module Controllers/Store
 */

const StoreDAL = require('../dal/storeDAL');
const UserStoreDAL = require('../dal/userStoreDAL');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Récupère l'entreprise de l'utilisateur connecté.
 */
const getCompanyId = (req) => {
  const companyId = Number(req.user?.companyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    const error = new Error(
      'Entreprise introuvable dans votre session. Veuillez vous reconnecter.'
    );
    error.statusCode = 403;
    throw error;
  }

  return companyId;
};

// =====================================================
// CRÉER UNE BOUTIQUE
// =====================================================
exports.create = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);

  const store = await StoreDAL.create({
    ...req.body,
    companyId,
    createdByUserId: req.user.userId
  });

  res.status(201).json({
    success: true,
    data: store
  });
});

// =====================================================
// LISTE DES BOUTIQUES DE L'ENTREPRISE
// ACTIVES ET DÉSACTIVÉES
// =====================================================
exports.getByCompany = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);

  // false = récupérer les boutiques actives et désactivées
  const stores = await StoreDAL.getByCompanyId(companyId, false);

  res.json({
    success: true,
    data: stores
  });
});

// =====================================================
// DÉTAILS D'UNE BOUTIQUE
// =====================================================
exports.getOne = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);

  const store = await StoreDAL.findById(
    req.params.storeId,
    companyId
  );

  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Boutique introuvable.'
    });
  }

  res.json({
    success: true,
    data: store
  });
});

// =====================================================
// MODIFIER UNE BOUTIQUE
// =====================================================
exports.update = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);

  const store = await StoreDAL.update(
    req.params.storeId,
    req.body,
    companyId
  );

  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Boutique introuvable.'
    });
  }

  res.json({
    success: true,
    data: store
  });
});

// =====================================================
// DÉSACTIVER UNE BOUTIQUE
// AUCUNE DONNÉE N'EST SUPPRIMÉE
// =====================================================
exports.deactivate = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);
  const storeId = req.params.storeId;

  const store = await StoreDAL.update(
    storeId,
    { btEnabled: 0 },
    companyId
  );

  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Boutique introuvable.'
    });
  }

  res.json({
    success: true,
    message: 'Boutique désactivée avec succès. Toutes ses données sont conservées.',
    data: store
  });
});

// =====================================================
// RÉACTIVER UNE BOUTIQUE
// AUCUNE DONNÉE N'EST SUPPRIMÉE
// =====================================================
exports.activate = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);
  const storeId = req.params.storeId;

  const store = await StoreDAL.update(
    storeId,
    { btEnabled: 1 },
    companyId
  );

  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Boutique introuvable.'
    });
  }

  res.json({
    success: true,
    message: 'Boutique réactivée avec succès.',
    data: store
  });
});

// =====================================================
// COMPATIBILITÉ : ANCIENNE ROUTE DELETE
// DÉSACTIVATION LOGIQUE UNIQUEMENT
// =====================================================
exports.remove = asyncHandler(async (req, res) => {
  const companyId = getCompanyId(req);

  const store = await StoreDAL.update(
    req.params.storeId,
    { btEnabled: 0 },
    companyId
  );

  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Boutique introuvable.'
    });
  }

  res.json({
    success: true,
    message: 'Boutique désactivée. Toutes ses données sont conservées.',
    data: store
  });
});

// =====================================================
// LISTER LES UTILISATEURS D'UNE BOUTIQUE
// =====================================================
exports.listUsers = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await UserStoreDAL.listUsers(req.params.storeId)
  });
});

// =====================================================
// AFFECTER UN UTILISATEUR À UNE BOUTIQUE
// =====================================================
exports.assignUser = asyncHandler(async (req, res) => {
  const data = await UserStoreDAL.assign({
    storeId: req.params.storeId,
    userId: req.body.userId,
    roleCode: req.body.roleCode,
    assignedByUserId: req.user.userId
  });

  res.status(201).json({
    success: true,
    data
  });
});
