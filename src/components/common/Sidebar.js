// src/components/common/Sidebar.js
import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Nav, NavDropdown, Badge, Button } from 'react-bootstrap';
import { authAPI } from '../../services/api';
import { useNotifications } from '../../NotificationContext';
import './Sidebar.css';

const Sidebar = ({ userRole, isSidebarOpen, toggleSidebar, userName, handleLogout, theme, toggleTheme }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const [boutiqueName, setBoutiqueName] = useState('');

    useEffect(() => {
        // ✅ CORRECTION : Rôle SQL MANAGER
        if (userRole === 'MANAGER') {
            const fetchUserBoutique = async () => {
                try {
                    const res = await authAPI.getCurrentUser();
                    // Adapté pour SQL : on cherche vcStoreName ou nom
                    if (res?.stores?.[0]?.vcStoreName) {
                        setBoutiqueName(res.stores[0].vcStoreName);
                    }
                } catch (error) {
                    console.error("Info: Impossible de charger la boutique", error);
                }
            };
            fetchUserBoutique();
        }
    }, [userRole]);

    const navigate = useNavigate();
    const location = useLocation();

    const handleNavLinkClick = () => {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(40);
        }
        if (window.innerWidth < 992 && toggleSidebar) {
            toggleSidebar();
        }
    };

    const handleNotificationClick = (notification) => {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(40);
        }
        if (!notification.read) {
            markAsRead(notification._id);
        }
        if (window.innerWidth < 992 && toggleSidebar) {
            toggleSidebar();
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
    };

    return (
        <aside className="left-sidebar" aria-label="Barre latérale de navigation">
            <div className="brand-logo">
                <div className="d-flex align-items-center">
                    <button type="button" className="btn btn-link d-lg-none text-muted me-3" onClick={toggleSidebar} aria-label="Fermer la navigation">
                        <iconify-icon icon="solar:close-circle-bold" style={{ fontSize: '24px' }}></iconify-icon>
                    </button>
                    <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2 text-primary" style={{ fontSize: '28px' }}></iconify-icon>
                    <div>
                        {/* ✅ CORRECTION : Rôles SQL */}
                        <h3 className="m-0 text-primary fw-bold lh-1" style={{ fontSize: '1.2rem' }}>
                            {userRole === 'SUPER_ADMIN' ? 'SuperAdmin' : (userRole === 'ADMIN' ? 'Admin' : (userRole === 'CASHIER' ? 'Caissier' : 'Gérant'))}
                        </h3>
                        {userRole === 'MANAGER' && boutiqueName && (
                            <small className="text-muted fw-bold d-block mt-1" style={{ fontSize: '0.85rem' }}>
                                {boutiqueName}
                            </small>
                        )}
                    </div>
                </div>
            </div>
            
            <nav className="sidebar-nav scroll-sidebar">
                {/* ✅ CORRECTION : Rôle SQL ADMIN */}
                {userRole === 'ADMIN' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Gestion</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Finances & Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/articles" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Articles</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/etat-stock" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon>
                                <span className="hide-menu">État des stocks</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/fournisseurs" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/centrale" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:box-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dépôt Principal</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shop-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutiques</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/mouvements" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/clients" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/notifications" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Notifications</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Administration</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/managers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Gérants</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/audit" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Journal d'Audit</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'SUPER_ADMIN' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Administration Globale</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/audit" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Journal d'Audit Global</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:globus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Vue Multi-Entreprises</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/registrations/pending" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Validations d'inscriptions</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/users" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Gestion des Utilisateurs</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'MANAGER' ? ( 
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/cashiers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Caissiers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-4-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Effectuer une Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/caisse/rapports-caissiers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Rapports Caissiers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/historique?tab=history" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/articles" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Consulter le Stock</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/clients" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Ma Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'CASHIER' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/pos" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Point de Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Ma Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : ( 
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Tableau de Bord</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                )}

                {/* Utility Nav for Mobile */}
                <div className="d-lg-none mt-auto py-2 border-top">
                    <Nav className="flex-column">
                        <Nav.Item>
                            <Button variant="link" onClick={toggleTheme} className="sidebar-link text-body-secondary d-flex align-items-center">
                                <iconify-icon icon={theme === 'dark' ? 'solar:sun-bold-duotone' : 'solar:moon-bold-duotone'} style={{ fontSize: '22px' }}></iconify-icon>
                                <span className="hide-menu ms-3">Thème {theme === 'dark' ? 'Clair' : 'Sombre'}</span>
                            </Button>
                        </Nav.Item>

                        <NavDropdown
                            title={
                                <span className="position-relative d-inline-flex align-items-center sidebar-link text-body-secondary">
                                    <iconify-icon icon="solar:bell-bing-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                                    <span className="hide-menu ms-3">Notifications</span>
                                    {unreadCount > 0 && (
                                        <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Badge>
                                    )}
                                </span>
                            }
                            id="notification-dropdown-sidebar"
                            align="end"
                            className="notifications-dropdown"
                        >
                            <div className="d-flex justify-content-between align-items-center px-3 py-2">
                                <h6 className="mb-0 fw-bold">Notifications</h6>
                                {unreadCount > 0 && <Button size="sm" variant="link" className="p-0" onClick={handleMarkAllRead}>Tout marquer comme lu</Button>}
                            </div>
                            <NavDropdown.Divider className="my-0" />
                            <div className="notification-list">
                                {notifications.length > 0 ? notifications.slice(0, 7).map(n => (
                                    <NavDropdown.Item key={n._id} onClick={() => handleNotificationClick(n)} className={`py-2 ${!n.read ? 'bg-primary-subtle' : ''}`}>
                                        <div className={`small ${!n.read ? 'fw-bold' : ''}`}>{n.message}</div>
                                        <div className="text-muted small mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
                                    </NavDropdown.Item>
                                )) : (
                                    <div className="text-center text-muted p-3 small">Aucune notification</div>
                                )}
                            </div>
                            <NavDropdown.Divider className="my-0" />
                            <NavDropdown.Item as={Link} to={userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' ? "/admin/notifications" : "/gerant/notifications"} className="text-center fw-bold py-2" onClick={handleNavLinkClick}>
                                Voir tout
                            </NavDropdown.Item>
                        </NavDropdown>

                        <NavDropdown
                            title={
                                <div className="d-flex align-items-center sidebar-link text-body-secondary">
                                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random&color=fff&rounded=true&size=32`} alt="avatar" className="me-2" />
                                    <span className="hide-menu">{userName}</span>
                                </div>
                            }
                            id="user-dropdown-sidebar"
                            align="end"
                        >
                            <NavDropdown.Header><div className="fw-bold">{userName}</div><div className="text-muted small">{userRole}</div></NavDropdown.Header>
                            <NavDropdown.Divider />
                            <NavDropdown.Item as={Link} to="/profile" onClick={handleNavLinkClick}><iconify-icon icon="solar:user-circle-linear" className="me-2"></iconify-icon> Mon Profil</NavDropdown.Item>
                            <NavDropdown.Item onClick={handleLogout}><iconify-icon icon="solar:logout-3-linear" className="me-2"></iconify-icon> Déconnexion</NavDropdown.Item>
                        </NavDropdown>

                        <Nav.Item className="mt-4 d-flex justify-content-center">
                            <Button 
                                variant="danger" 
                                onClick={handleLogout} 
                                className="shadow-sm rounded-circle d-flex align-items-center justify-content-center p-0"
                                style={{ width: '48px', height: '48px' }}
                                title="Déconnexion"
                            >
                                <iconify-icon icon="solar:logout-3-linear" style={{ fontSize: '24px' }}></iconify-icon>
                            </Button>
                        </Nav.Item>
                    </Nav>
                </div>
            </nav>
        </aside>
    );
};
export default Sidebar;