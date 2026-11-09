// src/components/NotificationsHistoryView.js
// Composant d'affichage de l'historique des notifications
// Permet de visualiser toutes les notifications reçues
// Affiche les informations sur le message, la date et le statut
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect } from 'react';
import { Card, Spinner, Badge, Form, Button, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../NotificationContext'; // Assurez-vous que ce chemin est correct

const NotificationsHistoryView = () => {
    const userRole = (localStorage.getItem('userRole') || '').trim();
    const navigate = useNavigate();
    const { notifications, loading, markAsRead, markAllAsRead, fetchNotifications } = useNotifications();
    const [searchTerm, setSearchTerm] = useState('');

    const handleRowClick = (notification) => {
        // Marquer comme lue si elle ne l'est pas déjà
        if (!notification.read) {
            markAsRead(notification._id);
        }

        // Naviguer si un lien existe
        if (notification.link) {
            navigate(notification.link);
        }
    };

    // Ajout pour rafraîchir les notifications au montage du composant
    useEffect(() => {
        if (fetchNotifications) {
            fetchNotifications();
        }
    }, [fetchNotifications]);

    const getTypeBadge = (type) => {
        switch (type) {
            case 'success': return 'success';
            case 'error': return 'danger';
            case 'warning': return 'warning';
            default: return 'info';
        }
    };

    let columns = [
        { 
            key: 'type', 
            label: 'Type', 
            render: (type) => <Badge bg={getTypeBadge(type)}>{type.toUpperCase()}</Badge>
        },
        { 
            key: 'message', 
            label: 'Message',
            render: (msg, item) => (
                <div>
                    <div className={!item.read ? 'fw-bold' : ''}>{msg}</div>
                    <small className="text-muted">{new Date(item.createdAt).toLocaleString('fr-FR')}</small>
                </div>
            )
        },
        { 
            key: 'read', 
            label: 'Statut', 
            render: (read) => (
                read ? (
                    <Badge bg="light" text="dark" className="d-flex align-items-center gap-1 px-2">
                        <iconify-icon icon="solar:check-read-linear"></iconify-icon>
                        Lu
                    </Badge>
                ) : (
                    <Badge bg="primary" className="d-flex align-items-center gap-1 px-2">
                        <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                        Non lu
                    </Badge>
                )
            )
        }
    ];

    // Ajout de la colonne "Destinataire" uniquement pour l'admin
    if (userRole === 'Admin') {
        columns.splice(2, 0, { 
            key: 'recipient', 
            label: 'Destinataire',
            render: (user) => user ? (
                <div>
                    <div className="fw-bold">{user.nom}</div>
                    <small className="text-muted">{user.role}</small>
                </div>
            ) : <span className="text-muted">Utilisateur supprimé</span>
        });
    }

    const filteredNotifications = notifications.filter(n => {
        const messageMatch = n.message.toLowerCase().includes(searchTerm.toLowerCase());
        if (userRole === 'Admin') {
            const recipientMatch = n.recipient && n.recipient.nom.toLowerCase().includes(searchTerm.toLowerCase());
            return messageMatch || recipientMatch;
        }
        return messageMatch;
    });

    const hasUnread = notifications.some(n => !n.read);

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <style>{`
                .notifications-table tbody tr.clickable {
                    cursor: pointer;
                }
                @media (max-width: 767.98px) {
                    .notifications-table { font-size: 0.85rem; }
                }
            `}</style>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">{userRole === 'Admin' ? 'Historique des Notifications' : 'Mes Notifications'}</h3>
                <div className="d-flex flex-wrap gap-2">
                    {hasUnread && (
                        <Button variant="outline-success" onClick={markAllAsRead} className="rounded-pill shadow-sm btn-sm px-3 py-2">
                            <iconify-icon icon="solar:check-read-bold" className="me-2 align-middle"></iconify-icon>
                            Tout marquer comme lu
                        </Button>
                    )}
                    <Button variant="outline-primary" onClick={fetchNotifications} disabled={loading} className="rounded-pill shadow-sm btn-sm px-3 py-2">
                        <iconify-icon icon="solar:refresh-bold" className="me-2 align-middle"></iconify-icon>
                        {loading ? 'Actualisation...' : 'Actualiser'}
                    </Button>
                </div>
            </div>
            
            <div className="mb-4">
                <Form.Control
                    type="text"
                    placeholder={userRole === 'Admin' ? "Rechercher par message ou destinataire..." : "Rechercher par message..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="shadow-sm w-100 w-md-auto"
                    style={{ maxWidth: '450px' }}
                />
            </div>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <Table hover responsive className="align-middle mb-0 notifications-table">
                        <thead className="bg-light">
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} className="border-0 small text-uppercase text-secondary py-3 px-4">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredNotifications.length > 0 ? (
                                filteredNotifications.map((item) => (
                                    <tr key={item._id} onClick={() => handleRowClick(item)} className={`${item.link ? 'clickable' : ''} ${!item.read ? 'table-primary-soft' : ''}`}>
                                        {columns.map(col => (
                                            <td key={col.key} className="px-4 py-3">
                                                {col.render ? col.render(item[col.key], item) : item[col.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={columns.length} className="text-center py-5 text-muted">Aucune notification trouvée.</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </div>
    );
};

export default NotificationsHistoryView;