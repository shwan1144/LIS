const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    const dbUrl = 'postgresql://postgres:d9bvq9vyz79nrw1k@lis-lisdb-lzhndm:5432/postgres';
    const network = 'dokploy-network';
    const img = 'lis-backend-k7tqkc:latest';

    console.log('Running fix:tenant-grants to secure the newly imported data...');
    const cmd = `docker run --rm --network ${network} -e DATABASE_URL=${dbUrl} -e NODE_ENV=production --entrypoint /bin/bash ${img} -c "npm run fix:tenant-grants"`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('fix:tenant-grants finished with code ' + code);
            console.log('Restarting the backend service...');
            conn.exec(`docker service update --force lis-backend-k7tqkc`, (e, s) => {
                s.on('close', () => conn.end());
            });
        }).on('data', (data) => process.stdout.write(data)).stderr.on('data', (data) => process.stderr.write(data));
    });
}).on('error', (err) => {
    console.log("SSH ERROR:", err);
}).connect({
    host: '194.163.178.142',
    port: 22,
    username: 'root',
    password: 'B6Pz5SuwO9ZvI018'
});
