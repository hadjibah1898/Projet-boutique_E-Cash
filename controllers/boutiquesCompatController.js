/**
 * @file boutiquesCompatController.js
 * @description Routes de compatibilité /api/boutiques (ancien frontend français).
 * @module Controllers/BoutiquesCompat
 */

const StoreDAL = require('../dal/storeDAL');
const UserStoreDAL = require('../dal/userStoreDAL');
const asyncHandler = require('../middleware/asyncHandler');

/** 'STORE' -> 'Centrale', 'SECONDARY' -> 'Secondaire'. */
function mapStoreType(storeTypeCode) {
  if (String(storeTypeCode || '').toUpperCase() === 'STORE') return 'Centrale';
  return 'Secondaire';
}

/** Mappe une ligne store (+ gérants) vers la forme legacy Mongo. */
function mapStore(row, vendeurs = []) {
  return {
    _id: row.storeId,
    storeId: row.storeId,
    companyId: row.companyId,
    nom: row.vcStoreName,
    code: row.vcStoreCode,
    type: mapStoreType(row.storeTypeCode),
    adresse: row.vcAddress || '',
    ville: row.vcCity || '',
    telephone: row.vcPhoneNumber || '',
    latitude: row.dcLatitude != null ? Number(row.dcLatitude) : null,
    longitude: row.dcLongitude != null ? Number(row.dcLongitude) : null,
    active: row.btEnabled === true || row.btEnabled === 1,
    vendeurs,
    createdAt: row.dtCreatedAt,
    updatedAt: row.dtLastUpdated
  };
}

function resolveCompanyId(req) {
  const role = String(req.user.roleCode || '').toUpperCase();
  if (role === 'SUPER_ADMIN') return null;
  if (req.user.companyId) return req.user.companyId;
  
  const err = new Error("Accès refusé : Aucune entreprise associée à votre compte.");
  err.statusCode = 403;
  throw err;
}

async function assertStoreAccess(req, store) {
  if (!store) return;
  const role = String(req.user.roleCode || '').toUpperCase();
  if (role === 'SUPER_ADMIN') return;
  
  if (!req.user.companyId || store.companyId !== req.user.companyId) {
    const err = new Error('Boutique introuvable.');
    err.statusCode = 404;
    throw err;
  }
}

function validateAndNormalizeCode(rawCode) {
  if (!rawCode || !String(rawCode).trim()) {
    const err = new Error("Le code boutique est obligatoire.");
    err.statusCode = 400;
    throw err;
  }
  const code = String(rawCode).trim().toUpperCase();
  if (code.length > 20) {
    const err = new Error("Le code boutique ne doit pas dépasser 20 caractères.");
    err.statusCode = 400;
    throw err;
  }
  if (!/^[A-Z0-9\-_]+$/.test(code)) {
    const err = new Error("Le code boutique ne peut contenir que des lettres, chiffres, tirets et underscores.");
    err.statusCode = 400;
    throw err;
  }
  return code;
}

exports.getAll = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await StoreDAL.listAll(companyId);
  
  const mapped = await Promise.all(rows.map(async (row) => {
    let vendeurs = [];
    try {
      // ✅ UTILISATION DU DAL (Pas de SQL direct)
      const users = await UserStoreDAL.listUsers(row.storeId, req.user.userId);
      vendeurs = (users || []).map((u) => ({
        _id: u.userId,
        nom: `${u.vcFirstName || ''} ${u.vcLastName || ''}`.trim() || u.vcEmail || 'Gérant'
      }));
    } catch (e) { 
      console.error("Erreur chargement gérants", e);
    }
    return mapStore(row, vendeurs);
  }));
  
  res.json({ success: true, data: mapped });
});

exports.getOne = asyncHandler(async (req, res) => {
  const store = await StoreDAL.findById(req.params.id);
  if (!store) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  
  await assertStoreAccess(req, store);

  let vendeurs = [];
  try {
    const users = await UserStoreDAL.listUsers(store.storeId, req.user.userId);
    vendeurs = (users || []).map((u) => ({
      _id: u.userId,
      nom: `${u.vcFirstName || ''} ${u.vcLastName || ''}`.trim() || u.vcEmail || 'Gérant'
    }));
  } catch (e) { }
  
  res.json({ success: true, data: mapStore(store, vendeurs) });
});

function mapPayload(body, createdByUserId, { requireCode = true } = {}) {
  const type = String(body.type || 'Secondaire');
  const rawCode = body.code || body.vcStoreCode || body.codeBoutique;
  const vcStoreCode = requireCode ? validateAndNormalizeCode(rawCode) : (rawCode ? validateAndNormalizeCode(rawCode) : undefined);

  return {
    companyId: body.companyId != null ? Number(body.companyId) : null,
    storeTypeCode: type === 'Centrale' ? 'STORE' : 'SECONDARY',
    vcStoreCode,
    vcStoreName: body.nom || body.vcStoreName,
    vcAddress: body.adresse !== undefined ? body.adresse : body.vcAddress,
    vcCity: body.ville !== undefined ? body.ville : body.vcCity,
    vcPhoneNumber: body.telephone || body.vcPhoneNumber || null,
    dcLatitude: body.latitude !== undefined ? body.latitude : body.dcLatitude,
    dcLongitude: body.longitude !== undefined ? body.longitude : body.dcLongitude,
    createdByUserId
  };
}

exports.create = asyncHandler(async (req, res) => {
  const data = mapPayload(req.body, req.user.userId, { requireCode: true });
  const role = String(req.user.roleCode || '').toUpperCase();

  if (role !== 'SUPER_ADMIN') {
    if (!req.user.companyId) {
      return res.status(403).json({ success: false, message: 'Accès refusé : Aucune entreprise associée.' });
    }
    data.companyId = req.user.companyId;
  }

  if (!data.companyId) {
    return res.status(400).json({ success: false, message: 'companyId est obligatoire.' });
  }

  try {
    const created = await StoreDAL.create(data);
    
    // ✅ SYNCHRONISATION VIA DAL
    if (req.body.vendeurs && Array.isArray(req.body.vendeurs)) {
      const managers = req.body.vendeurs.map(Number).filter(id => !isNaN(id) && id > 0);
      await UserStoreDAL.syncManagers(created.storeId, managers, req.user.userId);
    }

    const full = await StoreDAL.findById(created.storeId);
    res.status(201).json({ success: true, data: mapStore(full || created, []) });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ success: false, message: "Ce code boutique est déjà utilisé pour cette entreprise." });
    }
    throw err;
  }
});

exports.update = asyncHandler(async (req, res) => {
  const store = await StoreDAL.findById(req.params.id);
  await assertStoreAccess(req, store);

  const data = {};
  const incoming = mapPayload(req.body, req.user.userId, { requireCode: false });
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) data[key] = value;
  }

  delete data.vcStoreCode;
  delete data.storeTypeCode;
  delete data.companyId;

  try {
    const updated = await StoreDAL.update(req.params.id, data);
    if (!updated) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });

    // ✅ SYNCHRONISATION VIA DAL
    if (req.body.vendeurs && Array.isArray(req.body.vendeurs)) {
      const managers = req.body.vendeurs.map(Number).filter(id => !isNaN(id) && id > 0);
      await UserStoreDAL.syncManagers(Number(req.params.id), managers, req.user.userId);
    }

    const full = await StoreDAL.findById(Number(req.params.id));
    res.json({ success: true, data: mapStore(full || updated, []) });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ success: false, message: "Ce code boutique est déjà utilisé pour cette entreprise." });
    }
    throw err;
  }
});

exports.remove = asyncHandler(async (req, res) => {
  const store = await StoreDAL.findById(req.params.id);
  await assertStoreAccess(req, store);

  const ok = await StoreDAL.softDelete(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Boutique introuvable.' });
  res.json({ success: true, message: 'Boutique supprimée.' });
});

exports.syncCodes = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { updated: 0 }, message: 'Synchronisation effectuée avec succès !' });
});