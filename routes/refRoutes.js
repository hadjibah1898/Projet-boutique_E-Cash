/**
 * @file refRoutes.js
 * @description Routes des tables de référence.
 * @module Routes/Ref
 */

const router = require('express').Router();
const ctrl = require('../controllers/refController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', ctrl.listRefs);
router.get('/:refKey', ctrl.getAll);
router.get('/:refKey/code/:code', ctrl.getByCode);

module.exports = router;
