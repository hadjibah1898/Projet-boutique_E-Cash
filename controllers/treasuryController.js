/**
 * @file treasuryController.js
 * @description Trésorerie (tblTreasuryAccount + tblTreasuryMovement).
 * @module Controllers/Treasury
 */

const TreasuryDAL = require('../dal/treasuryDAL');
const asyncHandler = require('../middleware/asyncHandler');

exports.createAccount = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await TreasuryDAL.createAccount(req.body) });
});

exports.getAccounts = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await TreasuryDAL.getAccounts(req.params.companyId) });
});

exports.recordMovement = asyncHandler(async (req, res) => {
  const result = await TreasuryDAL.recordMovement({
    ...req.body,
    treasuryAccountId: req.params.treasuryAccountId,
    operatedByUserId: req.user.userId
  });
  res.status(201).json({ success: true, data: result });
});

exports.getMovements = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await TreasuryDAL.getMovements(req.params.treasuryAccountId) });
});
