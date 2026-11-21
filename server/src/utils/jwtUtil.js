const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'cdsews_secure_jwt_secret_key_2026';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromBase64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Sign payload into a standard RFC 7519 JWT (HS256)
 * @param {object} payload - Claims object
 * @param {string} [secret] - Signing secret key
 * @param {number} [expiresInSeconds=86400] - Token expiration in seconds (default: 24h)
 * @returns {string} Encoded JWT token
 */
function sign(payload, secret = JWT_SECRET, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payloadB64 = base64url(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) }));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode an RFC 7519 JWT (HS256)
 * @param {string} token - Encoded JWT token
 * @param {string} [secret] - Signing secret key
 * @returns {object} Decoded payload
 */
function verify(token, secret = JWT_SECRET) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }

  // Parse payload and check expiration
  const payload = JSON.parse(fromBase64url(payloadB64));

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token has expired');
  }

  return payload;
}

module.exports = {
  sign,
  verify,
  JWT_SECRET,
};
