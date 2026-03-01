const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    // We need to continuously stream logs to capture the error when an order is created.
    const cmd = `docker ps -q --filter "label=com.docker.swarm.service.name=lis-backend-k7tqkc" | head -n 1 | xargs -I {} docker logs --tail 250 -f {}`;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            process.stdout.write(data);
        }).stderr.on('data', (data) => {
            process.stderr.write(data);
        });
    });
}).on('error', (err) => {
    console.log("SSH ERROR:", err);
}).connect({
    host: '194.163.178.142',
    port: 22,
    username: 'root',
    password: 'B6Pz5SuwO9ZvI018'
});
