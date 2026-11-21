const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Filtered surveillance reports & CSV streaming
router.get('/cases', authenticateToken, reportController.getReports);
router.get('/export-csv', authenticateToken, reportController.exportCsv);
router.get('/export/csv', authenticateToken, reportController.exportCsv);

module.exports = router;
