/**
 * @file Header.js
 * @description Composant React.
 */

import React from 'react';
import { Navbar, Nav, NavDropdown, Badge, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../NotificationContext';
import './Header.css';

const Header = ({ userName, userRole, onLogout, theme, toggleTheme, toggleSidebar }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const navigate = useNavigate();

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            markAsRead(notification._id);
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
    };

    // ✅ CORRECTION : Rôles SQL Server
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const notificationRoute = isAdmin ? "/admin/notifications" : (userRole === 'MANAGER' ? "/gerant/notifications" : "/caissier/notifications");

    return (
        <Navbar expand="lg" className="header shadow-sm px-4" bg="body" variant={theme}>
            {/* Bouton Hamburger pour ouvrir le Sidebar sur Mobile - Seul bouton sur mobile */}
            <Button 
                variant="link" 
                className="d-lg-none me-2 p-0 text-body" 
                onClick={toggleSidebar}
                aria-label="Ouvrir le menu de navigation"
            >
                <iconify-icon icon="solar:hamburger-menu-bold" style={{ fontSize: '28px' }}></iconify-icon>
            </Button>

            <Navbar.Brand as={Link} to="/" className="fw-bold d-flex align-items-center me-auto">
                <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2 text-primary" style={{ fontSize: '28px' }}></iconify-icon>
                <span className="d-none d-sm-inline">gestion de stock</span>
            </Navbar.Brand>

            {/* Éléments utilitaires visibles UNIQUEMENT sur Desktop (Large screen) */}
            <Nav className="ms-auto d-none d-lg-flex align-items-center gap-3">
                <Button variant="link" onClick={toggleTheme} className="nav-link text-body-secondary p-0 d-flex align-items-center">
                    <iconify-icon icon={theme === 'dark' ? 'solar:sun-bold-duotone' : 'solar:moon-bold-duotone'} style={{ fontSize: '22px' }}></iconify-icon>
                </Button>

                <NavDropdown
                    title={
                        <span className="position-relative d-flex align-items-center">
                            <iconify-icon icon="solar:bell-bing-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                            {unreadCount > 0 && (
                                <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </Badge>
                            )}
                        </span>
                    }
                    id="notification-dropdown"
                    align="end"
                    className="notifications-dropdown custom-header-dropdown"
                >
                    <div className="d-flex justify-content-between align-items-center px-3 py-2">
                        <h6 className="mb-0 fw-bold">Notifications</h6>
                        {unreadCount > 0 && <Button size="sm" variant="link" className="p-0 text-decoration-none" onClick={handleMarkAllRead}>Tout marquer comme lu</Button>}
                    </div>
                    <NavDropdown.Divider className="my-0" />
                    <div className="notification-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {notifications.length > 0 ? notifications.slice(0, 7).map(n => (
                            <NavDropdown.Item key={n._id} onClick={() => handleNotificationClick(n)} className={`py-2 ${!n.read ? 'bg-primary-subtle' : ''}`}>
                                <div className={`small ${!n.read ? 'fw-bold' : ''}`} style={{ whiteSpace: 'normal' }}>{n.message}</div>
                                <div className="text-muted small mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
                            </NavDropdown.Item>
                        )) : (
                            <div className="text-center text-muted p-3 small">Aucune notification</div>
                        )}
                    </div>
                    <NavDropdown.Divider className="my-0" />
                    <NavDropdown.Item as={Link} to={notificationRoute} className="text-center fw-bold py-2">
                        Voir tout
                    </NavDropdown.Item>
                </NavDropdown>

                <NavDropdown 
                    className="custom-header-dropdown"
                    title={
                        <div className="d-flex align-items-center">
                            <img 
                                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0D6EFD&color=fff&rounded=true&size=32`} 
                                alt="avatar" 
                                className="me-2 shadow-sm" 
                            />
                            <span className="d-none d-xl-inline">{userName}</span>
                        </div>
                    } 
                    id="user-dropdown" 
                    align="end"
                >
                    <NavDropdown.Header><div className="fw-bold">{userName}</div><div className="text-muted small">{userRole}</div></NavDropdown.Header>
                    <NavDropdown.Divider />
                    <NavDropdown.Item as={Link} to="/profile"><iconify-icon icon="solar:user-circle-linear" className="me-2"></iconify-icon> Mon Profil</NavDropdown.Item>
                    <NavDropdown.Item onClick={onLogout} className="text-danger"><iconify-icon icon="solar:logout-3-linear" className="me-2"></iconify-icon> Déconnexion</NavDropdown.Item>
                </NavDropdown>
            </Nav>
        </Navbar>
    );
};

export default Header;