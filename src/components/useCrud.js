/**
 * @file useCrud.js
 * @description Composant React.
 */

import { useState, useEffect, useCallback } from 'react';

export const useCrud = (apiService) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.getAll();
      setData(response.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement des données.');
    } finally {
      setLoading(false);
    }
  }, [apiService]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleShowModal = (item = null) => {
    if (item) {
      setCurrentItem(item);
      setEditMode(true);
    } else {
      setCurrentItem(null);
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCurrentItem(null);
  };

  const saveItem = async (itemToSave) => {
    const promise = editMode
      ? apiService.update(itemToSave._id, itemToSave)
      : apiService.create(itemToSave);
    await promise;
    fetchData();
    handleCloseModal();
  };

  return { data, loading, error, setError, showModal, editMode, currentItem, setCurrentItem, fetchData, handleShowModal, handleCloseModal, saveItem };
};