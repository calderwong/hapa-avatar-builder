#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const port = Number(process.argv[2] || 8817);
const baseUrl = `http://127.0.0.1:${port}`;
const output = path.resolve('outputs/surface-parity');
await mkdir(output, { recursive: true });
const child = spawn(process.execPath, ['server/api.mjs', '--host', '127.0.0.1', '--port', String(port), '--static', 'dist'], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await waitFor(`${baseUrl}/api/health`);
  const health = await json(`${baseUrl}/api/health`);
  const capabilities = await json(`${baseUrl}/api/overcard/capabilities`);
  const html = await (await fetch(baseUrl)).text();
  const help = await exec(process.execPath, ['cli/avatar-builder.mjs', '--help']);
  const cli = await exec(process.execPath, ['cli/avatar-builder.mjs', 'capabilities', '--json']);
  const cliCapabilities = JSON.parse(cli.stdout);
  if (health.service !== 'hapa-avatar-builder' || cliCapabilities.id !== 'hapa-avatar-builder' || !html.includes('Hapa Avatar Builder') || capabilities.protocol !== 'hapa.overcard.v1') throw new Error('Surface identity mismatch.');
  await Promise.all([
    writeFile(path.join(output, 'api-health.json'), `${JSON.stringify(health, null, 2)}\n`),
    writeFile(path.join(output, 'api-capabilities.json'), `${JSON.stringify(capabilities, null, 2)}\n`),
    writeFile(path.join(output, 'cli-capabilities.json'), `${JSON.stringify(cliCapabilities, null, 2)}\n`),
    writeFile(path.join(output, 'cli-help.txt'), help.stdout),
    writeFile(path.join(output, 'ui-launch.json'), `${JSON.stringify({ ok: true, baseUrl, title: 'Hapa Avatar Builder', visualReport: '../shared-hand-header-visual-qa/report.json' }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ ok: true, canonicalId: health.service, protocol: capabilities.protocol, output }));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${url} -> ${response.status}`); return response.json(); }
async function waitFor(url) { for (let attempt = 0; attempt < 80; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${url}`); }
