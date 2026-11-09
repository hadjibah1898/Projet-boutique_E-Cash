// src/components/CentraleStockView.js
// Composant d'affichage du stock de la boutique centrale
// Permet de visualiser le stock de la boutique centrale et de gérer les réapprovisionnements
// Affiche les alertes de stock faible et les mouvements récents
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect } from 'react';
import { Spinner, Alert, Button, Toast, ToastContainer } from 'react-bootstrap';
import { boutiqueAPI } from '../services/api';
import ArticlesView from './ArticlesView';
import RestockModal from './RestockModal';
import SupplyModal from './SupplyModal';

const CentraleStockView = () => {
    const [centralShop, setCentralShop] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState({ show: false, message: '' });
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [showSupplyModal, setShowSupplyModal] = useState(false);

    // Clé pour forcer le re-rendu de ArticlesView
    const [viewKey, setViewKey] = useState(Date.now());
    
    useEffect(() => {
        const findCentralShop = async () => {
            try {
                const boutiques = await boutiqueAPI.getAll();
                const centrale = boutiques.find(b => b.type === 'Centrale' || b.type === 'Bar'); // Correction: Inclure le type 'Bar'
                if (centrale) {
                    setCentralShop(centrale);
                } else {
                    setError("Aucun Dépôt Principal n'est configuré.");
                }
            } catch (err) {
                setError("Erreur lors de la recherche du dépôt principal.");
            } finally {
                setLoading(false);
            }
        };
        findCentralShop();
    }, []);

    const handleRestockSuccess = (message) => {
        setToast({ show: true, message });
        // Changer la clé force ArticlesView à se re-monter et donc à refaire son fetch
        setViewKey(Date.now()); 
    };

    if (loading) return <div className="p-4 text-center"><Spinner animation="border" /></div>;
    if (error) return <div className="p-4"><Alert variant="danger">{error}</Alert></div>;

    const headerActions = (
        <>
            <Button variant="outline-success" onClick={() => setShowSupplyModal(true)} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:box-up-bold" className="me-2 align-middle"></iconify-icon>
                Receptionner des Articles
            </Button>
            <Button variant="outline-primary" onClick={() => setShowRestockModal(true)} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:box-minimalistic-bold" className="me-2 align-middle"></iconify-icon>
                Envoyer vers une Boutique
            </Button>
        </>
    );

    return centralShop ? (
        <>
            <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999 }}>
                <Toast onClose={() => setToast({ ...toast, show: false })} show={toast.show} delay={4000} autohide bg="success">
                    <Toast.Header>
                        <strong className="me-auto">Succès</strong>
                    </Toast.Header>
                    <Toast.Body className="text-white">{toast.message}</Toast.Body>
                </Toast>
            </ToastContainer>
            <ArticlesView 
                key={viewKey} 
                userRole="Admin" 
                boutiqueId={centralShop._id} 
                title={`Dépôt Principal (${centralShop.nom})`} 
                headerActions={headerActions} 
            />
            <RestockModal show={showRestockModal} onHide={() => setShowRestockModal(false)} onSuccess={handleRestockSuccess} />
            <SupplyModal show={showSupplyModal} onHide={() => setShowSupplyModal(false)} onSuccess={handleRestockSuccess} />
        </>
    ) : null;
};

export default CentraleStockView;