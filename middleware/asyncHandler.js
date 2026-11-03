/**
 * @file asyncHandler.js
 * @description Wrapper pour exécuter les handlers async et propager les erreurs au middleware d'erreur.
 * @module Middleware/AsyncHandler
 */

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;

