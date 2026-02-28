const { Client } = require('pg');
require('dotenv').config();

async function ensureDatabase() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '1111',
    };

    const dbName = process.env.DB_DATABASE || 'lis';

    const client = new Client({ ...config, database: 'postgres' });

    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
        if (res.rowCount === 0) {
            console.log(`Creating database ${dbName}...`);
            await client.query(`CREATE DATABASE ${dbName}`);
            console.log(`Database ${dbName} created successfully.`);
        } else {
            console.log(`Database ${dbName} already exists.`);
        }
    } catch (err) {
        console.error('Error ensuring database exists:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

ensureDatabase();
