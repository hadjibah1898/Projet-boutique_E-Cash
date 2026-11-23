/**
 * @file caisseConstants.js
 * @description Constantes centralisées pour le module Caisse & Finances.
 * Évite les nombres magiques et centralise les libellés.
 */

export const CASH_REPORT_STATUS = {
  PENDING: 1,
  VALIDATED: 3,
  REJECTED: 4
};

export const STATUS_LABELS = {
  [CASH_REPORT_STATUS.PENDING]: 'En attente',
  [CASH_REPORT_STATUS.VALIDATED]: 'Validé',
  [CASH_REPORT_STATUS.REJECTED]: 'Rejeté'
};

export const STATUS_BADGE_COLOR = {
  [CASH_REPORT_STATUS.PENDING]: 'warning',
  [CASH_REPORT_STATUS.VALIDATED]: 'success',
  [CASH_REPORT_STATUS.REJECTED]: 'danger'
};

export const DIGITAL_PAYMENT_MODES = [
  'ORANGE_MONEY',
  'MTN_MOMO',
  'CARD',
  'BANK_TRANSFER',
  'ORANGE MONEY',
  'MOBICASH',
  'PAYCARD',
  'VIREMENT'
];

export const ITEMS_PER_PAGE = 10;
export const DEFAULT_API_LIMIT = 1000;
export const CURRENCY = 'GNF';

export const TABS = {
  RAPPORTS: 'rapports',
  CAISSE_CENTRALE: 'caisse-centrale',
  FINTECH: 'fintech'
};

export const EXPORT_LABELS = {
  FINTECH_PDF: 'DÉTAIL DES TRANSACTIONS FINTECH (OM/MOBI)',
  FINTECH_EXCEL_SHEET: 'Transactions Fintech',
  CAISSE_CENTRALE_PDF: 'RAPPORT FINANCIER DE CAISSE',
  CAISSE_CENTRALE_EXCEL_SHEET: 'Caisse Centrale',
  RAPPORTS_EXCEL_SHEET: 'Rapports',
  REPORT_DETAILS_PDF: 'RAPPORT DE CAISSE - DETAIL'
};
