/**
 * @file api.js
 * @description Configuration des appels API avec Axios.
 */

import axios from 'axios';
import { toast } from 'react-toastify';

let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3003/api/';
if (!API_URL.startsWith('http://') && !API_URL.startsWith('https://')) {
  if (API_URL.startsWith('localhost') || API_URL.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) {
    API_URL = `http://${API_URL}`;
  }
}

if (typeof window !== 'undefined' && window.location && window.location.hostname) {
  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    if (API_URL.includes('localhost')) API_URL = API_URL.replace('localhost', hostname);
    else if (API_URL.includes('127.0.0.1')) API_URL = API_URL.replace('127.0.0.1', hostname);
  }
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
});

const clearAuthSession = () => {
  const items = ['token', 'userRole', 'userName', 'userId', 'boutiqueId', 'mustChangePassword'];
  items.forEach(item => localStorage.removeItem(item));
  window.location.href = '/login';
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === true) {
      return response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/register') clearAuthSession();
    } else {
      const message = error.response?.data?.message || error.message || "Une erreur est survenue";
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

const mapSqlRole = (code) => {
  const roles = { ADMIN: 'Admin', MANAGER: 'Gérant', CASHIER: 'Caissier', SUPER_ADMIN: 'SuperAdmin' };
  return roles[code] || code;
};

export const authAPI = {
  login: async (email, password) => {
    const d = await api.post('auth/login', { identifier: email, password });
    const u = d?.user || {};
    if (d?.stores?.[0]?.storeId) localStorage.setItem('storeId', d.stores[0].storeId);
    if (d?.companies?.[0]?.companyId) localStorage.setItem('companyId', d.companies[0].companyId);
    const roleCode = u.roleCode || d?.companies?.[0]?.roleCode || d?.stores?.[0]?.roleCode || d?.globalRole?.globalRoleCode || null;
    return {
      data: {
        token: d?.token,
        user: { userId: u.userId, vcLastName: u.vcLastName, vcFirstName: u.vcFirstName, roleCode: roleCode, vcEmail: u.vcEmail, vcPhoneNumber: u.vcPhoneNumber },
        companies: d?.companies || [],
        stores: d?.stores || [],
        mustChangePassword: d?.mustChangePassword === true,
      },
    };
  },
  register: (data) => api.post('auth/register', data),
  getCurrentUser: () => api.get('auth/me'),
  getUsers: async (params) => {
    const response = await api.get('auth/users', { params });
    const list = Array.isArray(response) ? response : (response?.data || []);
    return list.map(u => ({ ...u, role: u.role ? mapSqlRole(u.role) : u.role }));
  },
  getDeletedUsers: () => api.get('auth/users/deleted'),
  createManager: (data) => api.post('auth/create-manager', data),
  createCashier: (data) => api.post('auth/create-cashier', data),
  updateManager: (id, data) => api.put(`auth/users/${id}`, data),
  deleteManager: (id) => api.delete(`auth/users/${id}`),
  restoreManager: (id) => api.put(`auth/users/${id}/restore`),
  forceDeleteManager: (id) => api.delete(`auth/users/${id}/force`),
  changePassword: ({ newPassword }) => api.put('users/me', { password: newPassword }),
  validateUser: (id) => api.put(`auth/users/${id}/validate`),
  rejectUser: (id) => api.put(`auth/users/${id}/reject`),
  getPendingAdminRegistrations: async () => {
    const response = await api.get('auth/admin-registrations/pending');
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.data?.data)) return response.data.data;
    return [];
  },
  processAdminRegistration: (id, { isApproved, vcRejectionReason, rejectionReason } = {}) => {
    const reason = rejectionReason ?? vcRejectionReason ?? null;
    return api.put(`auth/admin-registrations/${id}/process`, { isApproved: !!isApproved, rejectionReason: reason, vcRejectionReason: reason });
  },
  forgotPassword: (email) => api.post('auth/forgot-password', { email }),
  updateProfile: (data) => api.put('auth/profile', data),
  getNotifications: async () => {
    const response = await api.get('auth/notifications');
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  },
  markNotificationRead: (id) => api.put(`auth/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put('auth/notifications/read-all'),
  getAllNotifications: async () => {
    const response = await api.get('auth/all-notifications');
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  },
};

export const boutiqueAPI = {
  getAll: () => api.get('boutiques'),
  create: (data) => api.post('boutiques', data),
  update: (id, data) => api.put(`boutiques/${id}`, data),
  getDetailsForServeur: (id) => api.get(`boutiques/${id}`),
  delete: (id) => api.delete(`boutiques/${id}`),
  syncCodes: () => api.post('boutiques/sync-codes'),
};

export const articleAPI = {
  getAll: (params) => api.get('articles', { params }),
  create: (data) => api.post('articles', data),
  update: (id, data) => api.put(`articles/${id}`, data),
  delete: (id) => api.delete(`articles/${id}`),
  transferStock: (data) => api.post('articles/transfer', data),
  restock: (data) => api.post('articles/restock', data),
  demanderRemise: (id, data) => api.post(`articles/${id}/demander-remise`, data),
  applyAutoPromo: (data) => api.post('articles/auto-promo', data),
  updateMany: (data) => api.put('articles/update-many', data),
  
  // 🟢 CORRECTION ICI : On ajoute "params" pour permettre le filtrage par boutique
  getAdjustments: (params) => api.get('articles/adjustments', { params }),
  
  createAdjustment: (data) => api.post('articles/adjustments', data),
  validateAdjustment: (id, data) => api.put(`articles/adjustments/${id}/validate`, data),
  corrigerTransfert: (id, data) => api.put(`articles/transfer/${id}/correct`, data),
  annulerTransfert: (id) => api.post(`articles/transfer/${id}/cancel`),
};

let fournisseursCache = null;
let fournisseursCacheTime = 0;
const CACHE_TTL = 30000;

export const fournisseurAPI = {
  getAll: async (params) => {
    const now = Date.now();
    if (!params && fournisseursCache && (now - fournisseursCacheTime) < CACHE_TTL) return fournisseursCache;
    const res = await api.get('fournisseurs', { params });
    if (!params) { fournisseursCache = res; fournisseursCacheTime = now; }
    return res;
  },
  create: (data) => api.post('fournisseurs', data),
  update: (id, data) => api.put(`fournisseurs/${id}`, data),
  delete: (id) => api.delete(`fournisseurs/${id}`),
  getProducts: (id) => api.get(`fournisseurs/${id}/products`), 
  approvisionner: (data) => api.post('articles/approvisionner', data),
};

export const venteAPI = {
  create: (data) => api.post('ventes', data),
  getHistorique: (params) => api.get('ventes/historique', { params }),
  cancel: (id) => api.post(`ventes/${id}/cancel`),
  getLogs: () => api.get('ventes/logs'),
  getPendingSales: () => api.get('ventes/pending'),
  validateRemise: (id) => api.post(`ventes/${id}/validate-remise`),
  rejectRemise: (id) => api.post(`ventes/${id}/reject-remise`),
  genererTicket: (id) => api.get(`ventes/${id}/ticket`),
  updateGroupStatus: (orderGroupId, data) => api.patch(`ventes/group/${orderGroupId}/status`, data),
  updateStatus: (id, data) => api.patch(`ventes/${id}/status`, data),
  telechargerTicket: (filename) => api.get(`ventes/ticket/download/${filename}`, { responseType: 'blob' }),
};

export const clientAPI = {
  getAll: (params) => api.get('clients', { params }),
  create: (data) => api.post('clients', data),
  update: (id, data) => api.put(`clients/${id}`, data),
  delete: (id) => api.delete(`clients/${id}`),
  payDette: (id, data) => api.post(`clients/${id}/pay-dette`, data),
  getDebts: () => api.get('clients/debts'),
  getDebtHistory: () => api.get('clients/debt-history'),
  getDebtHistoryForClient: (id) => api.get(`clients/${id}/debt-history`),
  getDebtEvolution: () => api.get('clients/debt-evolution'),
  payerCommission: (data) => api.post('clients/pay-commission', data),
  sendReceiptEmail: (paymentId) => api.post(`clients/payment/${paymentId}/send-email`),
  getCrmAnalytics: () => api.get('clients/crm/analytics'),
  getCrmQuartiers: () => api.get('clients/crm/quartiers'),
  getCrmSettings: () => api.get('clients/crm/settings'),
  updateCrmSettings: (data) => api.put('clients/crm/settings', data),
  getSegmentationSettings: () => api.get('clients/crm/segmentation-settings'),
  updateSegmentationSettings: (data) => api.put('clients/crm/segmentation-settings', data),
  relancerClient: (id, data) => api.post(`clients/${id}/relance`, data),
};

export const caisseAPI = {
  getStatut: () => api.get('cash/status/mine'),
  ouvrir: (data) => api.post('cash/sessions/open', data),
  fermer: (data) => api.post('cash/sessions/close', data),
  creerDepense: (data) => api.post('cash/expenses', data),
  getMesDepenses: () => api.get('cash/expenses/me'),
  getMesRapports: (params) => api.get('cash/reports/me', { params }),
  listerRapports: (params) => api.get('cash/reports', { params }),
  getReportDetails: (id) => api.get(`cash/reports-detail/${id}`),
  validerRapport: (id, data) => api.post(`cash/reports/${id}/approve`, data),
  rejeterRapport: (id, data) => api.post(`cash/reports/${id}/reject`, data),
  getCaisseAdmin: () => api.get('cash/admin'),
  getStatistiquesSession: () => api.get('cash/sessions/stats/mine'),
  corrigerRapport: (data) => api.put('cash/correction', data),
  getVentesHistorique: (params) => api.get('ventes/historique', { params }),
  getDettesHistorique: () => api.get('clients/debt-history'),
  listerRapportsCaissiers: (params) => api.get('cash/reports/caissiers', { params }),
  validerRapportCaissier: (id, data) => api.post(`cash/reports/caissiers/${id}/approve`, data),
  rejeterRapportCaissier: (id, data) => api.post(`cash/reports/caissiers/${id}/reject`, data),
  getRapportCaissierDetails: (id) => api.get(`cash/reports/caissiers/${id}/details`),
};

export const mouvementAPI = {
  getAll: (params) => api.get('mouvements', { params }),
  cancel: (id) => api.post(`mouvements/${id}/cancel`),
  relancerGerant: (id) => api.post(`articles/transfer/${id}/remind`),
  confirmerReception: (id, data) => api.post(`stock/transfers/${id}/receive`, data),
};

export const dashboardAPI = {
  getStats: (params) => api.get('dashboard/stats', { params }),
  getGerantSummary: () => api.get('dashboard/gerant-summary'),
  getSuperAdminStats: () => api.get('dashboard/superadmin'),
};

export const auditAPI = {
  getLogs: (params) => api.get('audit', { params }),
};

export const userAPI = {
  getAll: () => api.get('auth/users'),
};

export const cacheAPI = {
  flushBoutiqueCache: () => api.delete('cache/boutiques'),
};

export default api;