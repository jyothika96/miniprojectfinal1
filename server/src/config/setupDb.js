const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ensurePublicUser } = require('./publicUser');

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '3306', 10);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'disease_surveillance';

async function setupDatabase() {
  console.log('\n======================================================');
  console.log(' Community Disease Surveillance & Early-Warning System');
  console.log(' Automated Database Setup & Seed Tool');
  console.log('======================================================\n');
  console.log(`Connecting to MySQL host: ${host}:${port} as user: '${user}'...`);

  let connection;
  try {
    // Connect without selecting a specific database first
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
      dateStrings: true,
    });

    console.log(' Connected to MySQL successfully!');

    // Read database/schema.sql
    const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    console.log(`Reading SQL schema file from:\n  ${schemaPath}`);
    const sqlScript = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Executing database creation, tables, indexes, and synthetic seed data...`);
    await connection.query(sqlScript);

    console.log(' Schema and synthetic sample data created successfully!\n');

    // Verify row counts in the newly seeded tables
    await connection.query(`USE \`${database}\``);
    await ensurePublicUser(connection, process.env.PUBLIC_USER_PASSWORD || 'Public@123');
    console.log(' View-only public account ready (username: public).\n');
    const tables = [
      'users',
      'regions',
      'facilities',
      'disease_categories',
      'threshold_settings',
      'case_reports',
      'alerts',
      'alert_reviews',
    ];

    console.log('------------------------------------------------------');
    console.log(' Verification - Record Counts in Database:');
    console.log('------------------------------------------------------');

    for (const table of tables) {
      const [rows] = await connection.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`  * ${table.padEnd(22)} : ${rows[0].count} records`);
    }

    console.log('------------------------------------------------------');
    console.log(' Database initialization is COMPLETE and verified!');
    console.log(' You can now run "npm start" or "npm run dev" to launch the server.\n');
  } catch (error) {
    console.error('\n Database setup failed:');
    console.error(`  Error message : ${error.message}`);
    console.error(`  Error code    : ${error.code || 'N/A'}`);

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n Authentication failed:');
      console.error(`  Please open 'server/.env' and update DB_PASSWORD with your actual MySQL password.`);
      console.error(`  Current DB_USER     : ${user}`);
      console.error(`  Current DB_PASSWORD : ${password ? '********' : '(empty)'}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n Could not connect to MySQL server:');
      console.error(`  Please make sure your MySQL service (e.g. MySQL80) is running on port ${port}.`);
    }
    console.log('\n======================================================\n');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();
