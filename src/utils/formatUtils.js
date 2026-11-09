// src/utils/formatUtils.js

import React from 'react';
import { Badge } from 'react-bootstrap';

/**
 * Safely converts a value to a number, handling Decimal128 from MongoDB and null/undefined.
 * @param {*} value - The value to convert.
 * @returns {number} The converted number, or 0 if conversion fails.
 */
export const safeNum = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value.$numberDecimal) {
    return parseFloat(value.$numberDecimal) || 0;
  }
  return 0;
};

/**
 * Formats a number as a currency string in GNF.
 * Replaces non-breaking spaces with normal spaces for better compatibility (e.g., with PDF libraries).
 * @param {number} amount - The amount to format.
 * @returns {string} The formatted currency string.
 */
export const formatCurrency = (amount) => {
  return (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

/**
 * Returns a Bootstrap Badge component for a given payment status.
 * @param {string} status - The payment status (e.g., 'VALIDEE', 'REJETEE').
 * @returns {JSX.Element} A Bootstrap Badge.
 */
export const getPaymentStatusBadge = (status) => {
    if (status === 'VALIDEE') {
        return <Badge bg="success">Validé</Badge>;
    }
    if (status === 'REJETEE') {
        return <Badge bg="danger">Rejeté</Badge>;
    }
    return <Badge bg="warning" text="dark">En attente</Badge>;
};