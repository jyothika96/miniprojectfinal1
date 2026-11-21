const express = require('express');
const router = express.Router();
const alertReviewController = require('../controllers/alertReviewController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Global investigation tracking feed
router.get('/', authenticateToken, alertReviewController.getAllInvestigations);

module.exports = router;
