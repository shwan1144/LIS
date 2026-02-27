import { spawn } from 'node:child_process';

const port = process.env.PORT?.trim() || '3000';
const child = spawn(`npx serve -s dist -l ${port}`, {
  stdio: 'inherit',
  shell: true,
});

child.on('error', (error) => {
  console.error('Failed to start static server:', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
