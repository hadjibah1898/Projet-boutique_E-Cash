// src/auth/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ userRole, requiredRole, children }) => {
    const token = localStorage.getItem('token');

    // Fonction de normalisation : Casse + Accents + Underscores
    const normalize = (str) => {
        if (!str) return '';
        return str
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, "") // Enlève les accents
            .replace(/_/g, '');              // Enlève les underscores (SUPER_ADMIN -> SUPERADMIN)
    };

    const uRole = normalize(userRole);

    if (!uRole || !token) {
        // Si non connecté, retour au login
        return <Navigate to="/login" replace />;
    }

    // Le SuperAdmin a un accès illimité
    if (uRole === 'SUPERADMIN') return children;

    // Normalisation des rôles requis
    const roles = (Array.isArray(requiredRole) ? requiredRole : [requiredRole]).map(normalize);

    if (!roles.includes(uRole)) {
        // Redirection vers le tableau de bord par défaut selon le rôle
        let homePath = '/gerant'; // Par défaut
        
        if (uRole === 'ADMIN' || uRole === 'SUPERADMIN') {
            homePath = '/admin';
        } else if (uRole === 'MANAGER') {
            homePath = '/gerant';
        } else if (uRole === 'CASHIER' || uRole === 'CAISSIER') {
            homePath = '/caissier';
        }

        return <Navigate to={homePath} replace />;
    }

    // Si tout est en ordre, on affiche la page
    return children;
};

export default ProtectedRoute;