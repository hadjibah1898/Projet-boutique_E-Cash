/**
 * @file productController.js
 * @description Contrôleur pour les produits, articles, ajustements et approvisionnements.
 */

const ProductDAL = require('../dal/productDAL');
const StockAdjustmentDAL = require('../dal/stockAdjustmentDAL');
const productService = require('../services/productService');
const asyncHandler = require('../middleware/asyncHandler');

// Fonction utilitaire privée pour formater un produit (évite la duplication de code)
const formatProduct = (item) => ({
  _id: item.productId || item.ProductId,
  nom: item.vcProductName || item.VcProductName || "Sans nom",
  code: item.vcProductCode || item.VcProductCode,
  codeBarre: item.vcBarcode || item.VcBarcode,
  prixVente: item.prixVente || item.mCurrentSalePrice || item.MCurrentSalePrice || 0,
  prixAchat: item.prixAchat || item.mPurchasePrice || item.mUnitPurchasePrice || 0,
  quantite: item.quantiteDisponible || item.dcAvailableQuantity || item.DcAvailableQuantity || 0,
  seuilAlerte: item.seuilAlerte || item.alertThreshold || item.AlertThreshold || 10,
  image: item.vcImageUrl || item.VcImageUrl || null,
  categorie: item.categorie || item.vcCategoryName || item.VcCategoryName || 'Divers',
  boutique: (item.boutiqueId || item.BoutiqueId) ? { _id: item.boutiqueId || item.BoutiqueId, nom: item.storeName || item.StoreName || "Boutique" } : null,
  fournisseur: (item.fournisseurNom || item.FournisseurNom) ? { nom: item.fournisseurNom || item.FournisseurNom } : null, // ✅ Uniformisé
  promo: item.mPromoRate || 0,
  promoActive: item.btPromoActive === 1 || item.btPromoActive === true,
  remise: item.mExceptionDiscount || 0,
  dateDebutPromo: item.dtPromoStart || null,
  dateFinPromo: item.dtPromoEnd || null,
  datePeremption: item.datePeremption || null,
});

// ==========================================
// 1. ARTICLES & APPROVISIONNEMENTS
// ==========================================

exports.getAllArticles = asyncHandler(async (req, res) => {
  const isAdmin = req.user && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.roleCode);
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;
  
  if (!companyId) {
      return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }
  
  let storeId = req.query.boutique;
  
  if (!isAdmin) {
      storeId = req.user.storeId;
  }

  if (!storeId && !isAdmin) {
    return res.json({ success: true, data: [], totalPages: 0, totalCount: 0 });
  }

  const catalog = await ProductDAL.getArticlesWithDetails(
    storeId ? parseInt(storeId, 10) : null,
    companyId
  );

  const formatted = catalog.map(formatProduct);

  let filtered = formatted;
  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    filtered = filtered.filter(a => 
      a.nom.toLowerCase().includes(search) || 
      (a.codeBarre && a.codeBarre.includes(search)) ||
      (a.code && a.code.toLowerCase().includes(search))
    );
  }

  const page = parseInt(req.query.page) || 1;
  const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 15; 
  const start = (page - 1) * limit;
  
  const paginated = limit === 0 ? filtered : filtered.slice(start, start + limit);
  const totalP = limit === 0 ? 1 : Math.ceil(filtered.length / limit) || 1;

  res.json({
    success: true,
    data: paginated,
    totalPages: totalP,
    totalCount: filtered.length
  });
});

exports.restockArticle = asyncHandler(async (req, res) => {
  const sourceId = req.body.sourceId || req.body.boutiqueSource;
  const targetId = req.body.targetId || req.body.boutiqueDestination;
  const { articles, vcCarrierName } = req.body;

  if (!sourceId || !targetId) return res.status(400).json({ success: false, message: 'Boutique source et destination requises.' });
  if (!articles || articles.length === 0) return res.status(400).json({ success: false, message: 'Aucun article à transférer.' });

  const result = await productService.transfererStock({
    sourceStoreId: Number(sourceId),
    targetStoreId: Number(targetId),
    items: articles, 
    user: req.user, 
    vcCarrierName: vcCarrierName || null
  });

  res.status(201).json({ success: true, message: 'Transfert initié avec succès.', data: result });
});

exports.approvisionner = asyncHandler(async (req, res) => {
  const utilisateurSecurise = req.user; 
  if (!utilisateurSecurise) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié." });
  }

  const payload = { ...req.body, user: utilisateurSecurise };
  
  const result = await productService.enregistrerApprovisionnement(payload);
  res.status(201).json({ success: true, message: 'Approvisionnement enregistré.', data: result });
});

// ==========================================
// 2. AJUSTEMENTS & PERTES
// ==========================================

exports.getAdjustments = asyncHandler(async (req, res) => {
  const isAdmin = req.user && ['ADMIN', 'SUPER_ADMIN'].includes(req.user.roleCode);
  let storeId = req.query.boutique || (isAdmin ? null : req.user.storeId);

  const companyId = req.user.companyId ? Number(req.user.companyId) : null;
  if (!companyId || isNaN(companyId)) {
      return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  if (!storeId && !isAdmin) {
    return res.status(400).json({ success: false, message: 'storeId est obligatoire.' });
  }

  const adjustments = await StockAdjustmentDAL.getByStore(
    storeId ? parseInt(storeId, 10) : null, 
    companyId, 
    { statusCode: req.query.status || null }
  );

  const formatted = adjustments.map(adj => {
    const qte = adj.Quantite ?? adj.dcAdjustmentQuantity ?? adj.DcAdjustmentQuantity ?? adj.quantite ?? 0;
    const qteAbsolue = Math.abs(Number(qte));

    let statutLisible = adj.Statut || adj.statusCode || 'PENDING';
    if (statutLisible === 'PENDING' || statutLisible === 'En attente') statutLisible = 'En Attente';
    if (statutLisible === 'APPROVED' || statutLisible === 'Validé') statutLisible = 'Validé';
    if (statutLisible === 'REJECTED' || statutLisible === 'Rejeté') statutLisible = 'Rejeté';

    return {
      _id: adj.stockAdjustmentId || adj.StockAdjustmentId || adj._id,
      date: adj.dtCreatedAt || new Date().toISOString(),
      createdAt: adj.dtCreatedAt || new Date().toISOString(), 
      produitNom: adj.Article || adj.vcProductName || 'Produit Inconnu',
      article: adj.Article || adj.vcProductName || 'Produit Inconnu',
      boutiqueNom: adj.PointDeVente || adj.vcStoreName || 'Boutique Inconnue',
      pointDeVente: adj.PointDeVente || adj.vcStoreName || 'Boutique Inconnue',
      motif: adj.Motif || adj.vcAdjustmentReason || 'Autre',
      justification: adj.Note || adj.vcJustification || 'Aucune note',
      quantite: qteAbsolue,
      imageJustificatif: adj.Preuve || adj.vcProofImageUrl || null,
      preuve: adj.Preuve || adj.vcProofImageUrl || null,
      statut: statutLisible,
      statutCode: adj.statusCode || 'PENDING'
    };
  });

  res.json({ success: true, data: formatted });
});

exports.createAdjustment = asyncHandler(async (req, res) => {
  const { article, quantite, raison, justification, imageJustificatif } = req.body;
  
  const storeId = req.user.storeId; 
  const userId = req.user.userId;
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;

  if (!storeId) {
      return res.status(400).json({ success: false, message: "Aucune boutique associée à votre compte." });
  }

  if (!companyId) {
      return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  let safeJustification = justification;
  if (!safeJustification || typeof safeJustification !== 'string' || safeJustification.trim() === '') {
      safeJustification = 'Aucune justification fournie'; 
  }

  const reasonMap = {
    'Casse': 'BREAKAGE',
    'Vol': 'THEFT',
    'Perte': 'LOSS',
    'Périmé': 'EXPIRED',
    'Erreur d\'inventaire': 'INVENTORY_ERROR',
    'Autre': 'OTHER'
  };
  
  const safeReasonCode = reasonMap[raison] || 'OTHER';

  const catalog = await ProductDAL.getArticlesWithDetails(Number(storeId), companyId);
  const produitInfo = catalog.find(p => Number(p.productId || p.ProductId) === Number(article));
  const stockActuel = produitInfo ? Number(produitInfo.dcAvailableQuantity || produitInfo.DcAvailableQuantity || 0) : 0;

  if (stockActuel < Math.abs(Number(quantite))) {
      return res.status(400).json({ 
          success: false, 
          message: `Stock insuffisant. Stock actuel : ${stockActuel}, Quantité perdue : ${quantite}` 
      });
  }

  const details = [{
    productId: Number(article),
    stockLotId: null, 
    dcQuantityBefore: stockActuel, 
    dcAdjustmentQuantity: -Math.abs(Number(quantite)) 
  }];

  const result = await StockAdjustmentDAL.create({
    storeId: Number(storeId),
    reasonCode: safeReasonCode, 
    vcJustification: safeJustification.trim(),
    vcProofImageUrl: imageJustificatif || null,
    createdByUserId: userId,
    details: details 
  });

  res.status(201).json({ success: true, message: "Demande d'ajustement enregistrée.", data: result });
});

exports.validateAdjustment = asyncHandler(async (req, res) => {
  const adjustmentId = parseInt(req.params.id, 10);
  const { decision, commentaire } = req.body;
  const userId = req.user.userId;

  const targetCode = decision === 'VALIDE' ? 'APPROVED' : 'REJECTED';

  await StockAdjustmentDAL.decide(adjustmentId, targetCode, {
    approvedByUserId: userId,
    vcApprovalComment: commentaire || ''
  });

  if (targetCode === 'APPROVED') {
    const { StockMovementDAL } = require('../dal/stockMovementDAL');
    
    const header = await StockAdjustmentDAL.getHeader(adjustmentId);
    const details = await StockAdjustmentDAL.getDetails(adjustmentId);

    if (header && details && details.length > 0) {
      for (const d of details) {
        await StockMovementDAL.record({
          storeId: Number(header.storeId),
          productId: Number(d.productId),
          typeCode: 'ADJUSTMENT_OUT', 
          dcQuantity: Math.abs(Number(d.dcAdjustmentQuantity)), 
          operatedByUserId: userId,
          vcReferenceType: 'ADJUSTMENT',
          referenceId: adjustmentId,
          vcComment: `Validation ajustement #${adjustmentId}`.substring(0, 150)
        });
      }
    }
  }

  res.json({ success: true, message: `Ajustement ${decision === 'VALIDE' ? 'validé (stock mis à jour)' : 'rejeté'}.` });
});

// ==========================================
// 3. CRUD PRODUITS & STOCKS
// ==========================================

exports.createProduct = asyncHandler(async (req, res) => {
  const data = { ...req.body, companyId: req.user.companyId, createdByUserId: req.user.userId };
  const product = await ProductDAL.create(data);
  res.status(201).json({ success: true, data: product });
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const data = req.body;

  const sqlData = {
    vcProductName: data.nom || data.vcProductName,
    vcDescription: data.description || data.vcDescription,
    vcBarcode: data.codeBarre || data.vcBarcode,
    vcImageUrl: data.image || data.vcImageUrl,
    dcDefaultAlertThreshold: data.seuilAlerte || data.dcDefaultAlertThreshold,
    productCategoryId: parseInt(data.productCategoryId) || 1,
  };

  const product = await ProductDAL.update(productId, sqlData);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Produit introuvable.' });
  }

  const storeId = data.boutique?._id || data.boutique || req.user.storeId;

  const nouveauPrixVente = data.prixVente || data.mSalePrice;
  const nouveauPrixAchat = data.prixAchat || data.mPurchasePrice;

  if (nouveauPrixVente !== undefined && storeId) {
      await ProductDAL.updateStorePrice({
          storeId: Number(storeId),
          productId: Number(productId),
          mCurrentSalePrice: Number(nouveauPrixVente),
          mPurchasePrice: Number(nouveauPrixAchat || 0),
          alertThreshold: data.seuilAlerte || 10,
          createdByUserId: req.user.userId
      });
  }

  if (data.promo !== undefined || data.remise !== undefined) {
      await ProductDAL.updatePromotions({
          storeId: Number(storeId),
          productId: Number(productId),
          mPromoRate: Number(data.promo || 0),
          btPromoActive: data.promoActive ? 1 : 0,
          dtPromoStart: data.dateDebutPromo || null,
          dtPromoEnd: data.dateFinPromo || null,
          mExceptionDiscount: Number(data.remise || 0)
      });
  }

  res.json({ success: true, data: product, message: "Article, prix et promotions mis à jour avec succès." });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const ok = await ProductDAL.softDelete(parseInt(req.params.productId, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
  res.json({ success: true, message: 'Produit supprimé.' });
});

exports.listCategories = asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId, 10);
  const categories = await ProductDAL.listCategories(companyId);
  res.json({ success: true, data: categories });
});

exports.createCategory = asyncHandler(async (req, res) => {
  const data = { ...req.body, companyId: req.user.companyId };
  const category = await ProductDAL.createCategory(data);
  res.status(201).json({ success: true, data: category });
});

exports.getByCompany = asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId, 10);
  const products = await ProductDAL.getByCompanyId(companyId);
  res.json({ success: true, data: products });
});

exports.getOne = asyncHandler(async (req, res) => {
  const product = await ProductDAL.findById(parseInt(req.params.productId, 10));
  if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
  res.json({ success: true, data: product });
});

exports.findByBarcode = asyncHandler(async (req, res) => {
  const product = await ProductDAL.findByBarcode(req.user.companyId, req.params.barcode);
  if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable.' });
  res.json({ success: true, data: product });
});

exports.search = asyncHandler(async (req, res) => {
  const storeId = req.user.storeId;
  if (!storeId) return res.status(400).json({ success: false, message: 'storeId obligatoire.' });
  const products = await ProductDAL.searchForStore(storeId, req.query.q);
  res.json({ success: true, data: products });
});

exports.addStoreProduct = asyncHandler(async (req, res) => {
  const data = { ...req.body, createdByUserId: req.user.userId };
  const result = await ProductDAL.addStoreProduct(data);
  res.status(201).json({ success: true, data: result });
});

exports.getStoreProducts = asyncHandler(async (req, res) => {
  const result = await ProductDAL.getStoreProducts(parseInt(req.params.productId, 10));
  res.json({ success: true, data: result });
});

// ✅ CORRECTION : On applique le même formatage que getAllArticles
exports.getStoreStock = asyncHandler(async (req, res) => {
  const storeId = parseInt(req.params.storeId, 10);
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;

  if (!companyId) {
      return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  const catalog = await ProductDAL.getSaleCatalog(storeId, companyId);
  
  // ✅ On formate pour que le Frontend reçoive "fournisseur: { nom: ... }"
  const formatted = catalog.map(formatProduct);

  res.json({ success: true, data: formatted });
});

// ✅ CORRECTION : On applique le même formatage que getAllArticles
exports.getLowStock = asyncHandler(async (req, res) => {
  const storeId = parseInt(req.params.storeId, 10);
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;

  if (!companyId) {
      return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  const catalog = await ProductDAL.getSaleCatalog(storeId, companyId);
  
  // ✅ On formate AVANT de filtrer
  const formatted = catalog.map(formatProduct);
  
  // ✅ On filtre sur les noms formatés
  const lowStock = formatted.filter(item => item.quantite <= (item.seuilAlerte || 10));
  
  res.json({ success: true, data: lowStock });
});

// ✅ CORRECTION : Récupérer les lots d'un produit dans une boutique
exports.getProductLots = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { storeId } = req.query;
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;

  if (!companyId) {
    return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  if (!productId) {
    return res.status(400).json({ success: false, message: "ID produit obligatoire." });
  }

  const lots = await ProductDAL.getProductLots(productId, parseInt(storeId, 10), companyId);
  res.json({ success: true, data: lots });
});

// ✅ CORRECTION : Modifier la date de péremption d'un lot précis
exports.updateLotExpiration = asyncHandler(async (req, res) => {
  const { productId, stockLotId } = req.params;
  const { dtExpirationAt } = req.body;
  const companyId = req.user.companyId ? Number(req.user.companyId) : null;

  if (!companyId) {
    return res.status(403).json({ success: false, message: "Erreur : Impossible d'identifier votre entreprise." });
  }

  if (!dtExpirationAt) {
    return res.status(400).json({ success: false, message: "Date de péremption obligatoire." });
  }

  await ProductDAL.updateLotExpiration({
    productId: parseInt(productId, 10),
    stockLotId: parseInt(stockLotId, 10),
    storeId: req.user.storeId || null,
    companyId: companyId,
    dtExpirationAt
  });

  res.json({ success: true, message: "Date de péremption mise à jour avec succès." });
});