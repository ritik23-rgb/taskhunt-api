// config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 4000, 
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // This block is mandatory for TiDB Serverless to prevent the insecure transport error
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

module.exports = pool;