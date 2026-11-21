const bcrypt = require('bcryptjs');

const PUBLIC_USERNAME = 'public';
const PUBLIC_EMAIL = 'public@healthsurveillance.org';
const PUBLIC_FULL_NAME = 'Public Viewer';

/**
 * Makes sure the users.role column accepts 'public' and that the single
 * view-only public account exists. Safe to run more than once: it never touches
 * any other user, and it resets the public account's password to the one given.
 * @param {import('mysql2/promise').Connection} connection - connection with the target database selected
 * @param {string} password - plain-text password for the public account
 */
async function ensurePublicUser(connection, password) {
  // 1. Allow the 'public' role (no-op if it is already allowed)
  const [cols] = await connection.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
  );
  if (cols.length && !String(cols[0].COLUMN_TYPE).includes("'public'")) {
    await connection.query(
      `ALTER TABLE users MODIFY role
       ENUM('admin', 'epidemiologist', 'health_officer', 'analyst', 'public')
       NOT NULL DEFAULT 'health_officer'`
    );
  }

  // 2. Create or refresh the public account
  const hash = bcrypt.hashSync(password, 10);
  const [existing] = await connection.query('SELECT id FROM users WHERE username = ? OR email = ?', [
    PUBLIC_USERNAME,
    PUBLIC_EMAIL,
  ]);

  if (existing.length === 0) {
    await connection.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active)
       VALUES (?, ?, ?, ?, 'public', NULL, 1)`,
      [PUBLIC_USERNAME, PUBLIC_EMAIL, hash, PUBLIC_FULL_NAME]
    );
    return 'created';
  }

  await connection.query(
    `UPDATE users SET password_hash = ?, role = 'public', is_active = 1 WHERE id = ?`,
    [hash, existing[0].id]
  );
  return 'updated';
}

module.exports = { ensurePublicUser, PUBLIC_USERNAME, PUBLIC_EMAIL };
