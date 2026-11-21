const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { sign } = require('../utils/jwtUtil');

/**
 * Authenticate user, verify password with bcrypt, and return signed JWT token & profile
 */
async function login(req, res, next) {
  try {
    const { username, email, password } = req.body;
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username/email and password are required.',
      });
    }

    // Lookup user by either username or email
    const users = await query(
      `SELECT id, username, email, password_hash, full_name, role, phone, is_active
       FROM users
       WHERE (email = ? OR username = ?)`,
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password.',
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact public health IT administration.',
      });
    }

    // Verify password with bcrypt
    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username/email or password.',
      });
    }

    // Create sanitized payload
    const sanitizedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone,
    };

    // Issue cryptographic JWT token (24h expiration)
    const token = sign(sanitizedUser, undefined, 86400);

    res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      token,
      user: sanitizedUser,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current authenticated user profile verified from database
 */
async function getMe(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const users = await query(
      `SELECT id, username, email, full_name, role, phone, is_active, created_at
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ success: false, message: 'User account no longer active' });
    }

    res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  getMe,
};
