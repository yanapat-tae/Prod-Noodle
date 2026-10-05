import { spawn } from 'node:child_process';
const processes = [spawn(process.execPath, ['server/demo.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
function stop() { for (const child of processes) child.kill('SIGTERM'); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', code => { stop(); process.exit(code ?? 0); });
