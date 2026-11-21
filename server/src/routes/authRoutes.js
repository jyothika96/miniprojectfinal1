const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Public authentication endpoint
router.post('/login', authController.login);

// Server verification endpoint for active session
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
