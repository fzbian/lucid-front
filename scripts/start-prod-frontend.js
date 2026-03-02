const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function parseEnvFile(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIdx = normalized.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = normalized.slice(0, eqIdx).trim();
    let value = normalized.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFromFiles() {
  const candidates = [
    '.env.production.local',
    '.env.production',
    '.env.local',
    '.env',
    'example.env',
  ];

  for (const rel of candidates) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const parsed = parseEnvFile(fs.readFileSync(abs, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function ensureRequiredEnv() {
  const apiBase = String(process.env.API_BASE || '').trim();
  if (!apiBase) {
    console.error('Missing API_BASE.');
    console.error('Set API_BASE in example.env (or .env/.env.production) before running start:prod.');
    process.exit(1);
  }
}

function runBuild() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', 'build'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function startServer() {
  const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
  const child = spawn(nodeCmd, ['server/server.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => process.exit(code || 0));
}

loadEnvFromFiles();
ensureRequiredEnv();
runBuild();
startServer();
