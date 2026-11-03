/**
 * @file supplierController.js
 * @description Gestion des fournisseurs (tblSupplier + tblSupplierProduct).
 * @module Controllers/Supplier
 */

const SupplierDAL = require('../dal/supplierDAL');
const productService = require('../services/productService'); // ✅ Requis pour l'approvisionnement
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Récupère les fournisseurs de l'entreprise de l'utilisateur connecté.
 */
exports.getAllForCurrentUser = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;
  
  if (!companyId) {
    return res.status(403).json({ success: false, message: "Aucune entreprise associée à votre compte." });
  }

  const data = await SupplierDAL.getByCompanyId(companyId);
  res.json({ success: true, data });
});

/**
 * Crée un fournisseur en utilisant le companyId du token.
 */
exports.create = asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  if (!companyId) {
    return res.status(403).json({ 
      success: false, 
      message: "Aucune entreprise n'est associée à votre compte. Impossible de créer un fournisseur." 
    });
  }

  const supplierData = {
    ...req.body,
    companyId: companyId,
    createdByUserId: req.user.userId
  };

  const data = await SupplierDAL.create(supplierData);
  
  res.status(201).json({ 
    success: true, 
    message: "Fournisseur créé avec succès.",
    data 
  });
});

exports.getByCompany = asyncHandler(async (req, res) => {
  const data = await SupplierDAL.getByCompanyId(req.params.companyId);
  res.json({ success: true, data });
});

exports.getOne = asyncHandler(async (req, res) => {
  const supplier = await SupplierDAL.findById(req.params.supplierId);
  if (!supplier) return res.status(404).json({ success: false, message: 'Fournisseur introuvable.' });
  res.json({ success: true, data: supplier });
});

exports.update = asyncHandler(async (req, res) => {
  const supplier = await SupplierDAL.update(req.params.supplierId, req.body);
  if (!supplier) return res.status(404).json({ success: false, message: 'Fournisseur introuvable.' });
  res.json({ success: true, data: supplier });
});

exports.remove = asyncHandler(async (req, res) => {
  const ok = await SupplierDAL.softDelete(req.params.supplierId);
  if (!ok) return res.status(404).json({ success: false, message: 'Fournisseur introuvable.' });
  res.json({ success: true, message: 'Fournisseur désactivé.' });
});

exports.addProduct = asyncHandler(async (req, res) => {
  const data = await SupplierDAL.addProduct({ ...req.body, supplierId: req.params.supplierId });
  res.status(201).json({ success: true, data });
});

exports.getProducts = asyncHandler(async (req, res) => {
  const data = await SupplierDAL.getProducts(req.params.supplierId);
  res.json({ success: true, data });
});

/**
 * ✅ Approvisionnement (ajout de stock via fournisseur).
 */
exports.approvisionner = asyncHandler(async (req, res) => {
  const { fournisseurId, items, imageJustificatif } = req.body;
  
  // 🟢 SÉCURISATION : Si l'utilisateur n'a pas de storeId (ex: Admin), on force le Dépôt Principal (ID 10)
  const storeId = req.user.storeId || req.body.storeId || 10; 

  if (!fournisseurId) {
    return res.status(400).json({ success: false, message: 'Veuillez sélectionner un fournisseur.' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Veuillez ajouter au moins un article.' });
  }
  if (!storeId) {
    return res.status(400).json({ success: false, message: "Impossible de déterminer la boutique de destination." });
  }

  // Appel du service métier (qui gère la création du produit et l'ajout de stock)
  const result = await productService.enregistrerApprovisionnement({
    storeId: Number(storeId),
    fournisseurId: Number(fournisseurId),
    items,
    imageJustificatif,
    user: req.user
  });

  res.status(201).json({ success: true, data: result });
});