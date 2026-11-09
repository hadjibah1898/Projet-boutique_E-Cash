import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { authAPI } from './services/api';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toastQueue, setToastQueue] = useState([]);
    
    const notificationsRef = useRef(notifications);

    useEffect(() => {
        notificationsRef.current = notifications;
    }, [notifications]);

    const fetchNotifications = useCallback(async (isInitialFetch = false) => {
        const token = localStorage.getItem('token');
        const userRole = localStorage.getItem('userRole');

        if (!token) {
            setLoading(false);
            return;
        }
        try {
            // L'intercepteur extrait déjà l'enveloppe .data, res contient directement le tableau
            const fetchedNotifications = userRole === 'Admin' 
                ? await authAPI.getAllNotifications() 
                : await authAPI.getNotifications();
            
            const cleanNotifications = Array.isArray(fetchedNotifications) ? fetchedNotifications : [];

            if (!isInitialFetch) {
                const currentNotifications = notificationsRef.current;
                const newNotifications = cleanNotifications.filter(
                    fetchedNotif => !currentNotifications.some(existingNotif => existingNotif._id === fetchedNotif._id)
                );

                if (newNotifications.length > 0) {
                    setToastQueue(prev => [...prev, ...newNotifications]);
                }
            }

            setNotifications(prev => {
                if (JSON.stringify(prev) === JSON.stringify(cleanNotifications)) return prev;
                return cleanNotifications;
            });
            
            setUnreadCount(cleanNotifications.filter(n => !n.read).length);
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Gestion du rafraîchissement par Polling (Vérification toutes les 60 secondes)
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            fetchNotifications(true); // Chargement immédiat au montage

            const interval = setInterval(() => {
                fetchNotifications(false); // Lance le calcul des différences pour afficher les Toasts
            }, 60000); 

            return () => clearInterval(interval);
        } else {
            setNotifications([]);
            setUnreadCount(0);
            setLoading(false);
        }
    }, [fetchNotifications]);

    const markAsRead = useCallback(async (id) => {
        const notification = notifications.find(n => n._id === id);
        if (notification && !notification.read) {
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
            try {
                await authAPI.markNotificationRead(id);
            } catch (error) {
                console.error("Failed to mark notification as read", error);
                fetchNotifications(true); 
            }
        }
    }, [notifications, fetchNotifications]);

    const markAllAsRead = useCallback(async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
        try {
            await authAPI.markAllNotificationsRead();
        } catch (error) {
            console.error("Failed to mark all notifications as read", error);
            fetchNotifications(true);
        }
    }, [fetchNotifications]);
    
    const removeToast = (id) => {
        setToastQueue(prev => prev.filter(t => t._id !== id));
    };

    const value = { notifications, unreadCount, loading, toastQueue, removeToast, markAsRead, markAllAsRead };

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};