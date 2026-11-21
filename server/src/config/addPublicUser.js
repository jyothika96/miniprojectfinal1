/**
 * Adds (or resets) the view-only public login on an EXISTING database
 * without touching any other data.
 *
 * Usage (from the project root):
 *   npm run db:add-public-user
 *   npm run db:add-public-user -- "YourChosenPassword"
 * Or set PUBLIC_USER_PASSWORD in server/.env.
 */
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const { ensurePublicUser, PUBLIC_USERNAME } = require('./publicUser');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_PASSWORD = 'Public@123';

async function main() {
  const password = process.argv[2] || process.env.PUBLIC_USER_PASSWORD || DEFAULT_PASSWORD;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'disease_surveillance',
  });

  try {
    const result = await ensurePublicUser(connection, password);
    console.log(`\n Public account ${result}.`);
    console.log(`  Username : ${PUBLIC_USERNAME}`);
    console.log(`  Password : ${password}`);
    console.log('  Access   : dashboard only (view-only)\n');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\n Could not add the public account:', err.message, '\n');
  process.exit(1);
});
