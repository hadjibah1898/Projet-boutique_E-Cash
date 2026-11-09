/**
 * @file NotificationPopover.js
 * @description Composant React.
 */

import React from 'react';
import { Dropdown, Badge, Spinner, ListGroup, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../NotificationContext';

/**
 * Composant NotificationPopover
 * Affiche une icône de cloche avec un badge pour les notifications non lues.
 * Permet de visualiser les notifications récentes dans un menu déroulant.
 */
const NotificationPopover = () => {
    const navigate = useNavigate();
    const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            markAsRead(notification._id);
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    return (
        <Dropdown align="end" className="notification-dropdown">
            <Dropdown.Toggle as="div" className="position-relative p-2" style={{ cursor: 'pointer' }}>
                <iconify-icon
                    icon={unreadCount > 0 ? "solar:bell-bing-bold-duotone" : "solar:bell-linear"}
                    style={{ fontSize: '24px' }}
                    className={unreadCount > 0 ? "text-primary" : "text-secondary"}
                ></iconify-icon>
                {unreadCount > 0 && (
                    <Badge pill bg="danger" className="position-absolute top-0 start-50 translate-middle border border-light blink-animation" style={{ fontSize: '0.6rem', marginTop: '5px' }}>
                        {unreadCount}
                    </Badge>
                )}
            </Dropdown.Toggle>

            <Dropdown.Menu className="shadow-lg border-0 rounded-4 py-0 overflow-hidden" style={{ width: '320px' }}>
                <div className="p-3 border-bottom d-flex justify-content-between align-items-center bg-light">
                    <h6 className="mb-0 fw-bold">Notifications</h6>
                    {unreadCount > 0 && (
                        <Button variant="link" size="sm" className="p-0 text-decoration-none x-small fw-bold" onClick={(e) => { e.stopPropagation(); markAllAsRead(); }}>
                            Tout marquer comme lu
                        </Button>
                    )}
                </div>

                <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    {loading ? (
                        <div className="text-center p-4"><Spinner animation="border" size="sm" className="text-primary" /></div>
                    ) : notifications.length > 0 ? (
                        <ListGroup variant="flush">
                            {notifications.slice(0, 8).map((n) => (
                                <ListGroup.Item
                                    key={n._id}
                                    action
                                    onClick={() => handleNotificationClick(n)}
                                    className={`border-bottom py-3 px-3 border-0 ${!n.read ? 'bg-primary-subtle' : ''}`}
                                >
                                    <div className="d-flex gap-2">
                                        <div className={`rounded-circle p-2 bg-${n.type === 'error' ? 'danger' : n.type === 'success' ? 'success' : 'primary'}-subtle text-${n.type === 'error' ? 'danger' : n.type === 'success' ? 'success' : 'primary'} d-flex align-items-center justify-content-center`} style={{ width: '32px', height: '32px', minWidth: '32px' }}>
                                            <iconify-icon icon={n.type === 'error' ? 'solar:danger-bold' : n.type === 'success' ? 'solar:check-circle-bold' : 'solar:info-circle-bold'}></iconify-icon>
                                        </div>
                                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                            <div className={`small ${!n.read ? 'fw-bold' : ''} text-wrap`} style={{ fontSize: '0.85rem', lineHeight: '1.2' }}>{n.message}</div>
                                            <div className="x-small text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                                                {new Date(n.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    ) : (
                        <div className="text-center p-4 text-muted small">Aucune notification pour le moment</div>
                    )}
                </div>

                <Dropdown.Item
                    className="text-center py-2 border-top bg-light fw-bold small text-primary"
                    onClick={() => navigate('/notifications')}
                >
                    Voir tout l'historique
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default NotificationPopover;