#!/usr/bin/env node
// Runs the API server and the Vite client together (design doc §10).
// Usage: npm run dev [-- --user=<handle>]
import { spawn } from 'node:child_process';

const userArg = process.argv.slice(2).find((a) => a.startsWith('--user='));
const user = userArg ? userArg.slice('--user='.length) : undefined;

if (userArg && !/^[a-z0-9_-]+$/i.test(user)) {
  console.error(`Invalid --user value "${user}". Use a seeded user handle, e.g. --user=ana`);
  process.exit(1);
}

const env = { ...process.env, ...(user ? { CURRENT_USER: user } : {}), FORCE_COLOR: '1' };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const procs = [
  { name: 'server', color: '\x1b[36m', args: ['run', 'dev', '-w', '@tracker/server'] },
  { name: 'client', color: '\x1b[35m', args: ['run', 'dev', '-w', '@tracker/client'] },
].map(({ name, color, args }) => {
  const child = spawn(npm, args, { env, stdio: ['inherit', 'pipe', 'pipe'] });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return { name, child };
});

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of procs) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

for (const { name, child } of procs) {
  child.on('exit', (code) => {
    if (!shuttingDown)
      console.error(`[${name}] exited with code ${code}; stopping the other process.`);
    shutdown(code ?? 1);
  });
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (user) console.log(`Starting as user "${user}"`);
