/**
 * @file authController.js
 * @description Authentification et gestion des utilisateurs.
 * @module Controllers/Auth
 */

const jwt = require('jsonwebtoken');
const UserDAL = require('../dal/userDAL');
const UserStoreDAL = require('../dal/userStoreDAL'); // ✅ Requis pour les vérifications
const NotificationDAL = require('../dal/notificationDAL');
const asyncHandler = require('../middleware/asyncHandler');

function signToken(user, context) {
  const company = context.companies[0] || null;
  const store = context.stores[0] || null;
  const globalRole = context.globalRole || null;
  return jwt.sign(
    {
      userId: user.userId,
      companyId: company ? company.companyId : (store ? store.companyId : null),
      storeId: store ? store.storeId : null,
      roleCode: company ? company.roleCode
        : (store ? store.roleCode : (globalRole ? globalRole.globalRoleCode : null)),
      roleId: company ? company.roleId
        : (store ? store.roleId : (globalRole ? globalRole.roleId : null))
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

exports.register = asyncHandler(async (req, res) => {
  const payload = req.body;
  const rawName = payload.vcLastName || payload.nom || payload.lastName || '';
  const nameParts = rawName.trim().split(/\s+/);
  const vcFirstName = payload.vcFirstName || payload.prenom || payload.firstName || nameParts[0] || ''; 
  const vcLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : rawName;

  const email = payload.vcEmail || payload.email;
  const phone = payload.vcPhoneNumber || payload.telephone || payload.phone || null;
  const companyName = payload.vcCompanyName || payload.entrepriseNom || 'Mon Entreprise';
  
  let companyCode = payload.vcCompanyCode;
  if (!companyCode) {
    const prefix = companyName.substring(0, 5).toUpperCase().replace(/[^A-Z]/g, '');
    const suffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    companyCode = `${prefix || 'ENT'}-${suffix}`;
  }

  const result = await UserDAL.requestAdminRegistration({
    vcLastName,
    vcFirstName,
    vcEmail: email,
    vcPhoneNumber: phone,
    password: payload.password,
    vcCompanyCode: companyCode,
    vcCompanyName: companyName
  });

  res.status(201).json({ 
    success: true, 
    message: "Demande envoyée avec succès. En attente de validation par le SuperAdmin.",
    data: result
  });
});

exports.login = asyncHandler(async (req, res) => {
  const identifier = req.body.identifier || req.body.email;
  const password = req.body.password;

  if (!identifier || !password) {
    return res.status(400).json({ success: false, message: 'Identifiant et mot de passe obligatoires.' });
  }

  const user = await UserDAL.findByLoginIdentifier(identifier);
  if (!user) return res.status(401).json({ success: false, message: 'Identifiants invalides.' });
  if (!user.btIsActive) return res.status(403).json({ success: false, message: 'Compte désactivé ou en attente de validation.' });

  const ok = await UserDAL.comparePassword(password, user.vcPasswordHash);
  if (!ok) return res.status(401).json({ success: false, message: 'Identifiants invalides.' });

  await UserDAL.updateLastLogin(user.userId);
  const context = await UserDAL.getContext(user.userId);
  const token = signToken(user, context);

  const resolvedRole = (context.companies[0] && context.companies[0].roleCode)
    || (context.stores[0] && context.stores[0].roleCode)
    || (context.globalRole && context.globalRole.globalRoleCode)
    || null;
    
  const mustChangePassword = resolvedRole === 'SUPER_ADMIN' ? false : user.mustChangePassword === true;

  res.json({
    success: true,
    data: {
      token,
      mustChangePassword,
      user: {
        userId: user.userId, vcLastName: user.vcLastName, vcFirstName: user.vcFirstName,
        vcEmail: user.vcEmail, vcPhoneNumber: user.vcPhoneNumber,
        roleCode: resolvedRole,
        mustChangePassword
      },
      companies: context.companies,
      stores: context.stores
    }
  });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await UserDAL.findById(req.user.userId);
  const context = await UserDAL.getContext(req.user.userId);
  res.json({ success: true, data: { user, ...context } });
});

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */

function mapNotification(row) {
  return {
    _id: row.notificationId, userId: row.userId, title: row.vcTitle, message: row.vcMessage,
    read: row.btIsRead === true || row.btIsRead === 1, priority: row.vcPriority,
    typeCode: row.typeCode || null, actionUrl: row.vcActionUrl || null, createdAt: row.dtCreatedAt
  };
}

exports.getNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const rows = await NotificationDAL.getByUserId(req.user.userId, { unreadOnly });
  res.json(rows.map(mapNotification));
});

exports.getAllNotifications = asyncHandler(async (req, res) => {
  const rows = await NotificationDAL.getByUserId(req.user.userId, { limit: 200 });
  res.json(rows.map(mapNotification));
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const ok = await NotificationDAL.markAsRead(req.params.id, req.user.userId);
  if (!ok) return res.status(404).json({ success: false, message: 'Notification introuvable ou déjà lue.' });
  res.json({ success: true });
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  const count = await NotificationDAL.markAllAsRead(req.user.userId);
  res.json({ success: true, data: { updated: count } });
});

/* =========================================================================
   GESTION DES UTILISATEURS
   ========================================================================= */

exports.getUsers = asyncHandler(async (req, res) => {
  const role = String(req.user.roleCode || '').toUpperCase();
  
  let users = [];
  
  if (role === 'SUPER_ADMIN') {
    users = await UserDAL.listAll();
  } else {
    if (!req.user.companyId) {
      return res.status(403).json({ success: false, message: "Aucune entreprise associée à votre compte." });
    }
    users = await UserDAL.listByCompany(req.user.companyId);
  }

  // Sécurité : Un Admin ne voit pas le SuperAdmin
  const filteredUsers = users.filter(u => {
    if (role !== 'SUPER_ADMIN' && String(u.roleCode).toUpperCase() === 'SUPER_ADMIN') {
      return false;
    }
    return true;
  });

  res.json(filteredUsers.map((u) => ({
    _id: u.userId, 
    userId: u.userId,
    nom: [u.vcFirstName, u.vcLastName].filter(Boolean).join(' ') || u.vcEmail || `Utilisateur ${u.userId}`,
    email: u.vcEmail,
    active: u.btIsActive === true || u.btIsActive === 1, 
    role: u.roleCode || null,
    boutique: (u.storeId && u.boutiqueNom) 
      ? { _id: u.storeId, nom: u.boutiqueNom } 
      : null
  })));
});

/* =========================================================================
   WORKFLOW D'INSCRIPTION (SuperAdmin)
   ========================================================================= */

exports.pendingRegistrations = asyncHandler(async (req, res) => {
  const data = await UserDAL.getPendingAdminRegistrations();
  res.status(200).json({ success: true, data });
});

exports.processRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isApproved, rejectionReason } = req.body;
  const result = await UserDAL.processAdminRegistration({
    registrationRequestId: parseInt(id, 10),
    superAdminUserId: req.user.userId,
    isApproved: isApproved,
    vcRejectionReason: rejectionReason || null
  });
  res.status(200).json({ 
    success: true, 
    message: isApproved ? "Demande approuvée. Le compte et la boutique sont créés." : "Demande rejetée.",
    data: result
  });
});

/* =========================================================================
   WORKFLOW UTILISATEUR (validate / reject / deleted)
   ========================================================================= */

exports.validateUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, message: 'ID utilisateur invalide.' });

  const pending = await UserDAL.findPendingRegistrationByUserId(userId);

  if (pending) {
    const result = await UserDAL.processAdminRegistration({
      registrationRequestId: pending.registrationRequestId,
      superAdminUserId: req.user.userId,
      isApproved: true,
      vcRejectionReason: null
    });
    return res.status(200).json({ success: true, message: 'Utilisateur validé.', data: result });
  }

  const result = await UserDAL.setActive(userId, true, req.user.userId);
  return res.status(200).json({ success: true, message: 'Utilisateur réactivé.', data: result });
});

exports.rejectUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, message: 'ID utilisateur invalide.' });

  const rejectionReason = req.body?.rejectionReason || null;
  const pending = await UserDAL.findPendingRegistrationByUserId(userId);

  if (pending) {
    const result = await UserDAL.processAdminRegistration({
      registrationRequestId: pending.registrationRequestId,
      superAdminUserId: req.user.userId,
      isApproved: false,
      vcRejectionReason: rejectionReason
    });
    return res.status(200).json({ success: true, message: 'Demande rejetée.', data: result });
  }

  const result = await UserDAL.setActive(userId, false, req.user.userId);
  return res.status(200).json({ success: true, message: 'Utilisateur désactivé.', data: result });
});

exports.getDeletedUsers = asyncHandler(async (req, res) => {
  const users = await UserDAL.getDeletedUsers();
  res.json(users.map((u) => ({
    _id: u.userId, userId: u.userId,
    nom: [u.vcFirstName, u.vcLastName].filter(Boolean).join(' ') || u.vcEmail || `Utilisateur ${u.userId}`,
    email: u.vcEmail, vcPhoneNumber: u.vcPhoneNumber, active: false, role: u.roleCode || 'PENDING', createdAt: u.dtCreatedAt
  })));
});

/* =========================================================================
   CRÉATION GÉRANT & CAISSIER
   ========================================================================= */

exports.createManager = asyncHandler(async (req, res) => {
  const { nom, prenom, email, telephone, password, storeId } = req.body;

  if (!storeId) return res.status(400).json({ success: false, message: 'Veuillez sélectionner une boutique.' });
  if (!nom?.trim()) return res.status(400).json({ success: false, message: 'Le nom est obligatoire.' });
  if (!password) return res.status(400).json({ success: false, message: 'Le mot de passe est obligatoire.' });

  const newManager = await UserDAL.createManagerAndAssign({
    vcLastName: nom,
    vcFirstName: prenom,
    vcEmail: email,
    vcPhoneNumber: telephone || null,
    password,
    storeId: parseInt(storeId, 10),
    createdByUserId: req.user.userId
  });

  res.status(201).json({
    success: true,
    message: 'Gérant créé et affecté avec succès.',
    data: newManager
  });
});

exports.createCashier = asyncHandler(async (req, res) => {
  const { nom, email, password, boutique } = req.body;
  const storeId = parseInt(boutique, 10);

  if (!storeId) return res.status(400).json({ success: false, message: 'Veuillez sélectionner une boutique.' });
  if (!nom?.trim()) return res.status(400).json({ success: false, message: 'Le nom est obligatoire.' });
  if (!password) return res.status(400).json({ success: false, message: 'Le mot de passe est obligatoire.' });

  // ✅ SÉCURITÉ : Un Gérant ne peut créer que pour SA boutique
  if (req.user.roleCode === 'MANAGER' && Number(req.user.storeId) !== storeId) {
    return res.status(403).json({ 
      success: false, 
      message: "Accès refusé : Vous ne pouvez pas créer de caissier pour une autre boutique." 
    });
  }

  const parts = String(nom).trim().split(/\s+/);
  const vcFirstName = parts[0] || '';
  const vcLastName = parts.slice(1).join(' ') || parts[0] || '';

  const newCashier = await UserDAL.createCashierAndAssign({
    vcLastName: vcLastName,
    vcFirstName: vcFirstName,
    vcEmail: email,
    password,
    storeId: storeId,
    createdByUserId: req.user.userId
  });

  res.status(201).json({
    success: true,
    message: 'Caissier créé et affecté avec succès.',
    data: newCashier
  });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'ID utilisateur invalide.' });
  }

  // ✅ SÉCURITÉ : Un Gérant ne peut modifier que ses propres employés
  if (req.user.roleCode === 'MANAGER') {
    const storeUsers = await UserStoreDAL.listUsers(req.user.storeId, req.user.userId);
    const isUserInStore = storeUsers.some(u => u.userId === userId);
    
    if (!isUserInStore) {
      return res.status(403).json({ 
        success: false, 
        message: "Accès refusé : Vous ne pouvez pas modifier un utilisateur d'une autre boutique." 
      });
    }
  }

  const { nom, email, password, active } = req.body;
  const updateData = {};
  
  if (nom !== undefined) {
    const parts = String(nom).trim().split(/\s+/);
    updateData.vcFirstName = parts[0] || null;
    updateData.vcLastName = parts.slice(1).join(' ') || parts[0] || null;
  }
  
  if (email !== undefined) updateData.vcEmail = email;
  if (password) updateData.password = password;

  const updated = await UserDAL.update(userId, updateData);
  
  if (active !== undefined) {
    await UserDAL.setActive(userId, active, req.user.userId);
  }

  if (!updated) {
    return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
  }

  res.json({
    success: true,
    message: 'Utilisateur mis à jour avec succès.',
    data: updated
  });
});