const { Client } = require('pg');

async function getInstrumentIds() {
    const client = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'lis',
        password: '1111',
        port: 5432,
    });

    try {
        await client.connect();
        const res = await client.query('SELECT id, name, code FROM instruments');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

getInstrumentIds();
