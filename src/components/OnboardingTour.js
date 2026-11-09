// src/components/OnboardingTour.js
// Guide interactif pour les nouveaux utilisateurs après leur première connexion
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, ProgressBar } from 'react-bootstrap';
import './OnboardingTour.css';

// Étapes du tour selon le rôle
const getTourSteps = (userRole) => {
    const commonSteps = [
        {
            title: 'Menu Principal',
            description: 'Naviguez entre les différentes sections de votre espace : ventes, stocks, caisse, équipe...',
            icon: 'solar:sidebar-minimalistic-bold-duotone',
        },
        {
            title: 'Barre Supérieure',
            description: 'Accédez aux notifications, gérez votre profil, changez le thème ou déconnectez-vous.',
            icon: 'solar:bell-bold-duotone',
        },
        {
            title: 'Tableau de Bord',
            description: 'Ici vous verrez vos indicateurs clés : ventes du jour, stocks, performances de l\'équipe...',
            icon: 'solar:chart-2-bold-duotone',
        },
    ];

    if (userRole === 'Admin') {
        return [
            {
                title: '1. Menu Administration',
                description: 'Depuis la barre latérale, accédez à toutes les sections : utilisateurs, boutiques, articles, finances, caisses et rapports. Explorez chaque menu pour découvrir les fonctionnalités.',
                icon: 'solar:sidebar-minimalistic-bold-duotone',
            },
            {
                title: '2. Dashboard & KPIs',
                description: 'Sur le tableau de bord principal, suivez en temps réel le chiffre d\'affaires global, le nombre de ventes, les articles en stock faible et les performances consolidées de toutes vos boutiques.',
                icon: 'solar:chart-2-bold-duotone',
            },
            {
                title: '3. Créer vos Boutiques',
                description: 'Allez dans "Boutiques" pour créer vos points de vente. Chaque boutique a son propre gérant, son stock et ses caissiers. Vous pouvez les créer depuis cette section.',
                icon: 'solar:shop-2-bold',
            },
            {
                title: '4. Gérer les Gérants & Utilisateurs',
                description: 'Dans "Gérants" et "Utilisateurs", créez les comptes de vos gérants, caissiers et serveurs. Assignez chaque gérant à une boutique pour le voir apparaître dans les rapports.',
                icon: 'solar:users-group-two-rounded-bold-duotone',
            },
            {
                title: '5. Centrale d\'Achat & Stocks',
                description: 'Utilisez le "Dépôt Principal" pour gérer votre stock central. Ajoutez vos articles, enregistrez les entrées de marchandises et transférez le stock vers vos boutiques.',
                icon: 'solar:box-bold-duotone',
            },
            {
                title: '6. Fournisseurs & Approvisionnements',
                description: 'Dans "Fournisseurs", ajoutez vos partenaires d\'approvisionnement et enregistrez les réceptions de marchandises. Le stock central se met à jour automatiquement.',
                icon: 'solar:delivery-bold-duotone',
            },
            {
                title: '7. Finances & Validation',
                description: 'Dans "Finances & Caisse", validez ou rejetez les rapports de caisse de vos gérants. Suivez les écarts, les commentaires et la caisse centrale consolidée.',
                icon: 'solar:cash-out-bold-duotone',
            },
            {
                title: '8. Historique & Audit',
                description: 'Consultez l\'historique des ventes, les mouvements de stock et le journal d\'audit pour suivre toutes les actions effectuées dans le système par vos équipes.',
                icon: 'solar:shield-check-bold-duotone',
            },
        ];
    }

    if (userRole === 'Gérant') {
        return [
            ...commonSteps,
            {
                title: 'Enregistrer une Vente',
                description: 'Cliquez ici pour ouvrir le point de vente et enregistrer vos ventes rapidement.',
                icon: 'solar:cart-plus-bold',
            },
            {
                title: 'Gérer le Stock',
                description: 'Consultez et ajustez votre stock. Recevez les transferts de la centrale et gérez les articles disponibles.',
                icon: 'solar:box-bold-duotone',
            },
            {
                title: 'Ouvrir la Caisse',
                description: 'Avant de vendre, ouvrez votre caisse. À la fin de la journée, clôturez-la pour générer un rapport.',
                icon: 'solar:safe-square-bold',
            },
            {
                title: 'Votre Équipe',
                description: 'Gérez vos serveurs et caissiers. Consultez leurs performances et assignez-leur des tâches.',
                icon: 'solar:users-group-rounded-bold',
            },
        ];
    }

    if (userRole === 'Caissier') {
        return [
            ...commonSteps,
            {
                title: 'Point de Vente (POS)',
                description: 'C\'est votre outil principal ! Enregistrez les ventes, gérez les paiements en espèces et mobile money.',
                icon: 'solar:cart-plus-bold',
            },
            {
                title: 'Ma Caisse',
                description: 'Ouvrez votre caisse en début de journée et soumettez votre rapport de clôture au gérant.',
                icon: 'solar:safe-square-bold',
            },
            {
                title: 'Gestion des Créances',
                description: 'Consultez et gérez les dettes des clients. Enregistrez les recouvrements.',
                icon: 'solar:banknote-bold',
            },
        ];
    }

    if (userRole === 'Serveur') {
        return [
            ...commonSteps,
            {
                title: 'Prise de Commande',
                description: 'Prenez les commandes des clients. Vous pouvez envoyer des demandes de remise au gérant si nécessaire.',
                icon: 'solar:cart-plus-bold',
            },
            {
                title: 'Votre Espace',
                description: 'Depuis le menu, accédez à votre tableau de bord et à l\'historique de vos ventes.',
                icon: 'solar:notebook-bold',
            },
        ];
    }

    return commonSteps;
};

const OnboardingTour = ({ userRole, userName }) => {
    const [show, setShow] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [steps] = useState(() => getTourSteps(userRole));

    // Vérifier si c'est la première connexion
    useEffect(() => {
        const onboardingDone = localStorage.getItem('onboardingDone');
        if (!onboardingDone) {
            const timer = setTimeout(() => setShow(true), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleNext = useCallback(() => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleFinish();
        }
    }, [currentStep, steps.length]);

    const handlePrevious = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const handleFinish = useCallback(() => {
        localStorage.setItem('onboardingDone', 'true');
        setShow(false);
    }, []);

    const handleSkip = useCallback(() => {
        localStorage.setItem('onboardingDone', 'true');
        setShow(false);
    }, []);

    const handleRestartTour = useCallback(() => {
        localStorage.removeItem('onboardingDone');
        setCurrentStep(0);
        setShow(true);
    }, []);

    if (steps.length === 0) return null;

    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;

    return (
        <>
            {/* Bouton flottant discret pour relancer le guide */}
            {!show && (
                <div
                    className="onboarding-reset-btn"
                    onClick={handleRestartTour}
                    title="Relancer le guide d'utilisation"
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '3px',
                        zIndex: 9998,
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(13, 110, 253, 0.15)',
                        border: '2px solid rgba(13, 110, 253, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        opacity: 0.5,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.backgroundColor = 'rgba(13, 110, 253, 0.9)';
                        e.currentTarget.style.borderColor = '#0d6efd';
                        e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.5';
                        e.currentTarget.style.backgroundColor = 'rgba(13, 110, 253, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(13, 110, 253, 0.25)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <iconify-icon
                        icon="solar:bookmark-circle-bold-duotone"
                        style={{
                            fontSize: '22px',
                            color: '#0d6efd',
                            transition: 'color 0.3s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#0d6efd'; }}
                    ></iconify-icon>
                </div>
            )}

            {/* Modal du guide */}
            <Modal
                show={show}
                onHide={handleSkip}
                centered
                size="md"
                backdrop="static"
                className="onboarding-tour-modal"
                contentClassName="border-0 shadow-lg rounded-4"
            >
                <Modal.Header className="border-0 pb-0">
                    <div className="w-100">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <small className="text-muted fw-bold">
                                Étape {currentStep + 1} sur {steps.length}
                            </small>
                            <Button
                                variant="link"
                                size="sm"
                                className="text-muted text-decoration-none p-0"
                                onClick={handleSkip}
                            >
                                Passer le guide
                            </Button>
                        </div>
                        <ProgressBar now={progress} variant="primary" style={{ height: '4px' }} className="rounded-pill" />
                    </div>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                    <div className="mb-4">
                        <div className="bg-primary-subtle rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: '80px', height: '80px' }}>
                            <iconify-icon icon={step.icon} style={{ fontSize: '40px', color: '#0d6efd' }}></iconify-icon>
                        </div>
                        <h5 className="fw-bold mb-3">{step.title}</h5>
                        <p className="text-muted mb-0" style={{ maxWidth: '400px', margin: '0 auto' }}>
                            {step.description}
                        </p>
                    </div>

                    {/* Indicateurs de progression */}
                    <div className="d-flex justify-content-center gap-2 mb-4">
                        {steps.map((_, index) => (
                            <div
                                key={index}
                                className="rounded-pill"
                                style={{
                                    width: index === currentStep ? '24px' : '8px',
                                    height: '8px',
                                    backgroundColor: index === currentStep ? '#0d6efd' : '#dee2e6',
                                    transition: 'all 0.3s ease',
                                }}
                            />
                        ))}
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0 justify-content-center gap-2">
                    {currentStep > 0 && (
                        <Button variant="outline-secondary" onClick={handlePrevious} className="rounded-pill px-4">
                            <iconify-icon icon="solar:alt-arrow-left-linear" className="me-1 align-middle"></iconify-icon>
                            Précédent
                        </Button>
                    )}
                    <Button variant="primary" onClick={handleNext} className="rounded-pill px-4 fw-bold">
                        {currentStep < steps.length - 1 ? (
                            <>
                                Suivant
                                <iconify-icon icon="solar:alt-arrow-right-linear" className="ms-1 align-middle"></iconify-icon>
                            </>
                        ) : (
                            <>
                                <iconify-icon icon="solar:check-circle-bold" className="me-1 align-middle"></iconify-icon>
                                Terminer
                            </>
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default OnboardingTour;