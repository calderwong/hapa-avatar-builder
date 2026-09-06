#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEchoSourceInspector } from '../server/echo-source-inventory.mjs';
import { resolveEchoRuntimeMediaUri } from '../server/echo-runtime-media-route.mjs';
import { echoPreviewSourceUri, applyEchoPreviewProjection } from '../src/domain/echo-preview-projection.js';

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const root = path.resolve(import.meta.dirname, '..');
const songId = argument('song', 'dear-papa-song-dear-papa');
const variantId = argument('cut', 'intentional-enrichment-8c3bc198a60f-8971520567cdc69c-edit-24f4c28124045e0b');
for (const value of [songId, variantId]) if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) throw new Error('Unsafe fixture selection');
const base = argument('api', 'http://127.0.0.1:19088');
if (new URL(base).hostname !== '127.0.0.1') throw new Error('This proof targets an owned loopback API.');
const output = path.resolve(argument('output', 'artifacts/echo-enhancement-current-baseline/selected-cut-preview-proof/preparation'));
await fs.mkdir(output, { recursive: true });
const files = [path.join(root, 'data/music-video-projects', `${songId}-video-project.json`), path.join(root, 'data/music-video-project-variants', songId, `${variantId}.json`)];
const cut = JSON.parse(await fs.readFile(files[1], 'utf8'));
const sources = [...new Set(cut.timeline.filter(shot => shot.media_contract?.type === 'video').map(shot => resolveEchoRuntimeMediaUri(echoPreviewSourceUri(shot), { root }).resolvedPath))];
if (sources.some(value => !value)) throw new Error('Unresolved proof source');
async function identities() {
  const inspector = createEchoSourceInspector(), result = {};
  for (const file of [...files, ...sources]) {
    result[path.relative(root, file)] = sources.includes(file) ? (await inspector.inspect(file)).sha256 : createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if (!result[path.relative(root, file)]) throw new Error('Source identity unavailable');
  }
  return result;
}
const before = await identities(), startedAt = new Date().toISOString();
const query = new URLSearchParams({ songId, variantId });
let response = await fetch(`${base}/api/echos/director-preview/prepare?${query}`, { method: 'POST', signal: AbortSignal.timeout(30000) });
let job = await response.json();
if (!response.ok) throw new Error(JSON.stringify(job));
console.log(JSON.stringify({ id: job.id, total: job.total, status: job.status }));
const deadline = Date.now() + 31 * 60 * 1000;
let previous = -1;
while (['queued', 'running', 'cancelling'].includes(job.status) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  response = await fetch(`${base}/api/echos/director-preview/prepare?jobId=${encodeURIComponent(job.id)}`, { signal: AbortSignal.timeout(30000) });
  job = await response.json(); if (!response.ok) throw new Error(JSON.stringify(job));
  if (job.completed !== previous) { console.log(JSON.stringify({ completed: job.completed, total: job.total, status: job.status })); previous = job.completed; }
}
const after = await identities();
const preview = applyEchoPreviewProjection(cut.timeline, job, { songId, variantId });
const authoringUnchanged = JSON.stringify(before) === JSON.stringify(after);
const applied = preview.filter((shot, index) => shot !== cut.timeline[index]).length;
const explicitlyAllowedOriginFallback = process.argv.includes('--allow-origin-fallback')
  && job.status === 'partial' && job.items.filter(row => row.status !== 'ready').every(row => row.error === 'proxy-nonzero-source-origin-requires-time-map' && !row.proxy);
const pass = authoringUnchanged && (job.status === 'ready' && applied === job.total
  || explicitlyAllowedOriginFallback && applied > 0 && applied === job.items.filter(row => row.status === 'ready').length);
const report = { pass, songId, variantId, startedAt, completedAt: new Date().toISOString(),
  authoringUnchanged, sourceCount: sources.length, applied, allCuesPrepared: job.status === 'ready', explicitlyAllowedOriginFallback,
  scope: 'Selected-cut proxy preparation and source preservation; unsupported nonzero origins remain on original media', before, after, job };
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass, status: job.status, authoringUnchanged, sourceCount: sources.length, applied, failed: job.items?.filter(row => row.status !== 'ready').map(row => row.error) }));
if (!pass) process.exitCode = 1;
