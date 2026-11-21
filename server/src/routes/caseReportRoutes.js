const express = require('express');
const router = express.Router();
const caseReportController = require('../controllers/caseReportController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Case reports routes protected with authentication & RBAC
router.get('/', authenticateToken, caseReportController.getCases);
router.get('/:id', authenticateToken, caseReportController.getCaseById);

// Case submission: Admin, Epidemiologist, and Health Officer
router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'epidemiologist', 'health_officer'),
  caseReportController.createCase
);

// Case modification: Admin and Epidemiologist
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('admin', 'epidemiologist'),
  caseReportController.updateCase
);

// Case deletion: Admin only
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('admin'),
  caseReportController.deleteCase
);

module.exports = router;
