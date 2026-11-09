// src/auth/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ userRole, requiredRole, children }) => {
    const token = localStorage.getItem('token');
    if (!userRole || !token) {
        // 1. Si l'utilisateur n'est pas connecté, on le renvoie vers la page de connexion.
        return <Navigate to="/login" replace />;
    }

    // Le SuperAdmin a un accès illimité à toutes les routes protégées
    if (userRole === 'SuperAdmin') return children;

    // Supporte un rôle unique (string) ou un tableau de rôles
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!roles.includes(userRole)) {
        // 2. Si l'utilisateur n'a pas le bon rôle, on le renvoie vers son tableau de bord par défaut.
        const homePath = (userRole === 'Admin' || userRole === 'SuperAdmin') ? '/admin' : (userRole === 'Gérant' ? '/gerant' : '/serveur/dashboard'); // Correction: Utiliser le type de boutique
        return <Navigate to={homePath} replace />;
    }

    // 3. Si tout est en ordre, on affiche la page demandée.
    return children;
};

export default ProtectedRoute;