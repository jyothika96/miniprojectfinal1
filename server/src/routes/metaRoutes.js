const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

// Reference tables (regions, facilities, diseases, users)
router.get('/all', authenticateToken, metaController.getAllMeta);

// Threshold configuration viewing
router.get('/thresholds', authenticateToken, metaController.getThresholds);

// Threshold configuration editing: Admin only
router.put(
  '/thresholds/:diseaseId',
  authenticateToken,
  authorizeRoles('admin'),
  metaController.updateThreshold
);

module.exports = router;
