/**
 * @file mouvementController.js
 * @description Contrôleur des mouvements de stock (STRICTEMENT ZERO SQL).
 */

const mouvementService = require('../services/mouvementService');
const asyncHandler = require('../middleware/asyncHandler');
const auditHelper = require('../utils/auditHelper');

exports.getAllMouvements = asyncHandler(async (req, res) => {
    // On passe req.query et req.user au service
    const result = await mouvementService.listerMouvements(req.query, req.user);
    res.status(200).json({ success: true, data: result });
});

exports.cancelMouvement = asyncHandler(async (req, res) => {
    const result = await mouvementService.annulerMouvement(req.params.id, req.user);
    
    await auditHelper.logSuccess(req, req.user, 'CANCEL_MOVEMENT', 'StockMovement', req.params.id);
    res.status(200).json({ success: true, data: result });
});

exports.declarerPerte = asyncHandler(async (req, res) => {
    const result = await mouvementService.declarerPerte(req.body, req.user);
    
    await auditHelper.logSuccess(req, req.user, 'DECLARE_LOSS', 'StockMovement', result.stockMovementId, { 
        article: req.body.articleId, 
        quantite: req.body.quantite, 
        raison: req.body.raison 
    });
    res.status(201).json({ success: true, data: result });
});

exports.confirmerReception = asyncHandler(async (req, res) => {
    const StockMovementDAL = require('../dal/stockMovementDAL');
    const StockTransferDAL = require('../dal/stockTransferDAL');

    const movement = await StockMovementDAL.getById(req.params.id);
    if (!movement) {
        return res.status(404).json({ success: false, message: 'Mouvement introuvable.' });
    }

    if (movement.vcReferenceType !== 'STORE' || !movement.referenceId) {
        return res.status(400).json({
            success: false,
            message: 'Ce mouvement ne correspond à aucun transfert de stock.'
        });
    }

    // Confirmer la réception du transfert lié
    await StockTransferDAL.updateQuantities(movement.referenceId, {
        receivedQty: [] // Les quantités seront lues depuis les détails du transfert
    });
    await StockTransferDAL.setStatus(movement.referenceId, 'RECEIVED', {
        approvedByUserId: req.user.userId
    });

    res.status(200).json({ success: true, message: 'Réception confirmée.' });
});