const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'disease_surveillance',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // Return dates as YYYY-MM-DD strings instead of UTC objects
  timezone: '+00:00',
  multipleStatements: false,
};

let pool;

try {
  pool = mysql.createPool(dbConfig);
} catch (error) {
  console.error('[DB] Failed to create connection pool:', error.message);
}

/**
 * Execute a parameterized SQL query
 * @param {string} sql - SQL statement with ? placeholders
 * @param {Array} params - Array of parameters
 * @returns {Promise<Array>} Query results
 */
async function query(sql, params = []) {
  if (!pool) {
    throw new Error('Database pool is not initialized. Please verify your .env configuration.');
  }
  try {
    const [rows, fields] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('[DB Query Error]:', {
      message: error.message,
      code: error.code,
      sql: sql.replace(/\s+/g, ' ').trim().substring(0, 120),
    });
    throw error;
  }
}

/**
 * Test MySQL connection and return status info
 */
async function testConnection() {
  try {
    const [result] = await pool.query('SELECT 1 + 1 AS result, DATABASE() as current_db, VERSION() as mysql_version');
    return {
      connected: true,
      database: result[0].current_db,
      version: result[0].mysql_version,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
    };
  } catch (err) {
    let suggestion = 'Check your MySQL server status and .env credentials.';
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      suggestion = `Access denied for user '${dbConfig.user}'. Please edit server/.env and provide the correct DB_PASSWORD.`;
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      suggestion = `Database '${dbConfig.database}' does not exist. Run 'npm run db:setup' inside the server directory to create it.`;
    } else if (err.code === 'ECONNREFUSED') {
      suggestion = `Could not connect to MySQL at ${dbConfig.host}:${dbConfig.port}. Please ensure MySQL service is running.`;
    }

    return {
      connected: false,
      error: err.message,
      code: err.code,
      suggestion,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
    };
  }
}

module.exports = {
  pool,
  query,
  testConnection,
};
