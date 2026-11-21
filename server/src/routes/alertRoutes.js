const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const alertReviewController = require('../controllers/alertReviewController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Alerts query endpoints (all authenticated staff roles can view)
router.get('/', authenticateToken, alertController.getAlerts);
router.get('/:id', authenticateToken, alertController.getAlertById);

// Alert creation (Manual trigger): Admin, Epidemiologist, and Health Officer
router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'epidemiologist', 'health_officer'),
  alertController.createAlert
);

// Alert review & status workflow update: Admin, Epidemiologist, and Health Officer
router.put(
  '/:id/status',
  authenticateToken,
  authorizeRoles('admin', 'epidemiologist', 'health_officer'),
  alertController.updateAlertStatus
);

// Alert deletion: Admin only
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('admin'),
  alertController.deleteAlert
);

// Investigation reviews specific to an alert: Admin, Epidemiologist, and Health Officer
router.post(
  '/:alertId/reviews',
  authenticateToken,
  authorizeRoles('admin', 'epidemiologist', 'health_officer'),
  alertReviewController.addReview
);

module.exports = router;
