const jwt = require('../utils/jwtUtil');
const { JWT_SECRET } = jwt;

// Endpoints a 'public' account may call (GET only): the dashboard summary and its own session check.
const PUBLIC_ALLOWED_GET_PATHS = ['/api/dashboard/summary', '/api/auth/me'];

function isAllowedForPublic(req) {
  if (req.method !== 'GET') return false;
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  return PUBLIC_ALLOWED_GET_PATHS.includes(path);
}

/**
 * Authentication Middleware: Validates Bearer JWT Token
 */
function authenticateToken(req, res, next) {
  // Support Authorization header: Bearer <token> or query parameter ?token=<token> (for file downloads)
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const tokenFromQuery = req.query.token;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Authentication token is missing. Please sign in.',
      code: 'AUTH_TOKEN_MISSING',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, email, full_name, role }

    // The 'public' role is strictly view-only and limited to the dashboard summary.
    // Enforced here so that every protected route is covered, whatever the frontend does.
    if (decoded.role === 'public' && !isAllowedForPublic(req)) {
      return res.status(403).json({
        success: false,
        message: 'Public accounts can only view the dashboard.',
        code: 'PUBLIC_ROLE_RESTRICTED',
      });
    }
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Session has expired or is invalid. Please sign in again.',
      code: 'AUTH_TOKEN_INVALID',
      error: error.message,
    });
  }
}

/**
 * Role-Based Authorization Middleware: Checks whether authenticated user has an allowed role
 * @param  {...string} allowedRoles - e.g. 'admin', 'epidemiologist', 'health_officer', 'analyst'
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required prior to permission verification.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Permission denied. Role '${req.user.role}' is not authorized to perform this operation. Allowed: ${allowedRoles.join(', ')}.`,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  JWT_SECRET,
};
