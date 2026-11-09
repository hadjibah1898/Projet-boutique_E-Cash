/**
 * @file offlineSync.js
 * @description Service de synchronisation hors-ligne (IndexedDB).
 */

import { openDB } from 'idb';
import { venteAPI } from '../services/api';

const DB_NAME = 'stockGestionDB';
const STORE_NAME = 'offlineVentes';

/**
 * Initialise la base de données IndexedDB.
 * @returns {Promise<IDBDatabase>} Une promesse qui résout avec l'instance de la base de données.
 */
const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

/**
 * Sauvegarde une vente dans IndexedDB lorsque l'application est hors ligne.
 * @param {Object} venteData - Les données de la vente à sauvegarder.
 */
export const saveVenteOffline = async (venteData) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.add({ venteData, timestamp: new Date().toISOString() });
    await tx.done;
    console.log('Vente sauvegardée hors ligne:', venteData);
};

/**
 * Tente de synchroniser toutes les ventes hors ligne avec le serveur.
 * @param {string} userId - Optionnel : synchroniser uniquement les ventes de cet utilisateur
 * @returns {Promise<{success: number, failed: number}>} Un objet contenant le nombre de ventes synchronisées et échouées.
 */
export const syncVentes = async (userId = null) => {
    const db = await initDB();

    // 1. Récupérer toutes les ventes hors ligne pour l'utilisateur dans une transaction en lecture seule
    const readTx = db.transaction(STORE_NAME, 'readonly');
    const allOfflineSales = await readTx.store.getAll();
    await readTx.done; // Fermer la transaction de lecture

    const salesToSync = allOfflineSales.filter(sale => sale.venteData.gerantId === userId);

    let successCount = 0;
    let failedCount = 0;
    const syncedSaleIds = [];

    // 2. Tenter de synchroniser chaque vente avec l'API
    // On utilise Promise.allSettled pour ne pas arrêter la boucle si une vente échoue
    const syncPromises = salesToSync.map(async (sale) => {
        try {
            await venteAPI.create(sale.venteData);
            successCount++;
            syncedSaleIds.push(sale.id); // Collecter les IDs des ventes synchronisées
        } catch (error) {
            console.error('Échec de la synchronisation de la vente hors ligne:', sale, error);
            failedCount++;
            // Ne pas supprimer la vente, elle restera pour une tentative ultérieure
        }
    });

    await Promise.allSettled(syncPromises); // Attendre que toutes les tentatives soient terminées

    // 3. Supprimer les ventes synchronisées dans une NOUVELLE transaction en écriture
    if (syncedSaleIds.length > 0) {
        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
        for (const id of syncedSaleIds) {
            deleteTx.store.delete(id);
        }
        await deleteTx.done;
    }

    return { success: successCount, failed: failedCount };
};

/**
 * Récupère le nombre de ventes hors ligne en attente de synchronisation.
 * @param {string} userId - Optionnel : filtrer par ID utilisateur
 * @returns {Promise<number>} Le nombre de ventes hors ligne.
 */
export const getOfflineVentesCount = async (userId = null) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const ventes = await tx.store.getAll();
    await tx.done;

    // Filtrer pour ne compter que les ventes appartenant à l'utilisateur actuel
    return userId
        ? ventes.filter(v => v.venteData.gerantId === userId).length
        : ventes.length; // Si pas d'userId, on compte tout (pourrait être utile pour un admin local)
};

/**
 * Récupère toutes les ventes hors ligne stockées dans IndexedDB.
 * @returns {Promise<Array>} Une promesse qui résout avec un tableau des ventes hors ligne.
 */
export const getOfflineVentes = async (userId = null) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const allVentes = await tx.store.getAll();
    await tx.done;

    // Filtrer par userId si fourni
    return userId
        ? allVentes.filter(v => v.venteData.gerantId === userId)
        : allVentes;
};