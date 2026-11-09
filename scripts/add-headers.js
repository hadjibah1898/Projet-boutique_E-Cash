/**
 * Script d'ajout automatique de commentaires d'en-tête JSDoc (Frontend)
 * Usage: node stock-gestion-frontend/scripts/add-headers.js
 */
const fs = require('fs');
const path = require('path');

const descriptions = {
  'components/UsersView.js': "Vue de gestion des utilisateurs (SuperAdmin, Admin, AdminBar) : création, validation, suspension.",
  'components/ArticlesView.js': "Vue de consultation et gestion des articles avec filtres, catégories et actions.",
  'components/VentesView.js': "Vue principale des ventes : onglet vente (panier) et onglet historique avec filtres.",
  'components/Dashboard.js': "Tableau de bord Admin Marchand : KPIs, graphiques, statistiques des ventes et stocks.",
  'components/ClientsView.js': "Vue de gestion des clients et ouvriers : CRUD, dettes, commissions, historique.",
  'components/SuppliersView.js': "Vue de gestion des fournisseurs avec CRUD et approvisionnement.",
  'components/StockMovementsView.js': "Vue des mouvements de stock : transferts, ajustements, pertes, historique.",
  'components/NotificationsHistoryView.js': "Vue de l'historique complet des notifications.",
  'components/DebtManagementView.js': "Vue de gestion des créances : suivi des dettes clients, paiements.",
  'components/ProfileView.js': "Vue du profil utilisateur connecté avec possibilité de modification.",
  'components/CaissierPOS.js': "Point de vente (POS) pour le Caissier : scan, panier, encaissement.",
  'components/CaissierDashboard.js': "Tableau de bord Caissier : résumé des ventes, accès rapide POS.",
  'components/GerantDashboard.js': "Tableau de bord Gérant Marchand : KPIs boutique, ventes, caisse.",
  'components/ServeurDashboard.js': "Tableau de bord Serveur : commandes en cours, tables, pourboires.",
  'components/BarDashboard.js': "Tableau de bord Bar (AdminBar, GérantBar) : stats spécifiques bar, doses.",
  'components/Register.js': "Page d'inscription : choix du type de compte (Marchand/Bar) et création.",
  'components/Auth.js': "Page de connexion/authentification avec formulaire login.",
  'components/CaisseView.js': "Vue de gestion de caisse pour le Gérant : ouverture, fermeture, dépenses.",
  'components/AdminCaisseView.js': "Vue d'audit des caisses pour l'Admin : toutes les sessions, rapports.",
  'components/CaissierCaisseView.js': "Vue de caisse pour le Caissier : ouverture, fermeture, dépenses.",
  'components/GerantCaisseValidation.js': "Vue de validation des rapports de caisse pour le Gérant.",
  'components/AdjustmentModals.js': "Modales de gestion des ajustements de stock (pertes, casses).",
  'components/InventoryTab.js': "Onglet inventaire avec gestion des stocks et alertes.",
  'components/ArticleFormModal.js': "Modale formulaire de création/édition d'article.",
  'components/ManagersView.js': "Vue de gestion des gérants par l'Admin : création, édition, assignation boutique.",
  'components/CashiersView.js': "Vue de gestion des caissiers par le Gérant.",
  'components/ShopsView.js': "Vue de gestion des boutiques (Admin) : création, édition, configuration.",
  'components/CentraleStockView.js': "Vue du dépôt principal/centrale : gestion des stocks centralisés.",
  'components/BarConfigView.js': "Vue de configuration du Bar : QR codes, paramètres bar.",
  'components/BarCommandesView.js': "Vue des commandes en cours pour le Bar.",
  'components/SupplyModal.js': "Modale d'approvisionnement/reapprovisionnement de stock.",
  'components/ServersView.js': "Vue de gestion des serveurs par le Gérant.",
  'components/IntelligentSupplyModal.js': "Modale d'approvisionnement intelligent avec suggestions.",
  'common/IntelligentSupplyModal.js': "Version commune de la modale d'approvisionnement intelligent.",
  'components/ThermalTicket.js': "Composant de ticket thermique/imprimable pour les ventes.",
  'components/ProtectedRoute.js': "Composant obsolète de protection de route (remplacé par common/ProtectedRoute).",
  'components/OnboardingTour.js': "Composant de visite guidée (onboarding) pour les nouveaux utilisateurs.",
  'utils/exportCSV.js': "Utilitaires d'export des données (CSV, PDF).",
  'utils/offlineSync.js': "Service de synchronisation hors-ligne (IndexedDB).",
  'services/api.js': "Configuration des appels API avec Axios.",
  'utils/axiosConfig.js': "Configuration des intercepteurs Axios (token, erreurs).",
  'services/socket.js': "Service de connexion WebSocket pour les notifications en temps réel.",
  'common/ProtectedRoute.js': "Composant de protection des routes avec vérification du rôle.",
  'common/Sidebar.js': "Barre latérale de navigation adaptative selon le rôle utilisateur.",
};

const dirs = [
  'stock-gestion-frontend/src/components',
  'stock-gestion-frontend/src/components/common',
  'stock-gestion-frontend/src/utils',
  'stock-gestion-frontend/src/services',
];

let count = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.jsx'));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = fullPath.replace(/\\/g, '/');
    let content = fs.readFileSync(fullPath, 'utf8');

    if (content.startsWith('/**') || content.startsWith('// ') || content.startsWith('/*!')) {
      console.log(`✓ Déjà commenté: ${relPath}`);
      continue;
    }

    const key = relPath.replace('stock-gestion-frontend/src/', '');
    const desc = descriptions[key] || 'Composant React.';
    const header = `/**
 * @file ${file}
 * @description ${desc}
 */

`;
    content = header + content;
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ Ajouté: ${relPath}`);
    count++;
  }
}

console.log(`\n${count} fichiers frontend mis à jour avec un en-tête.`);