#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareEchoPlaybackAudio } from '../server/echo-playback-audio.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const split = arg.indexOf('='); return [arg.slice(2, split), arg.slice(split + 1)]; }));
if (!args.source) throw new Error('Usage: node scripts/prepare-echo-playback-audio.mjs --source=<master> [--cache=<derived-cache>]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controller = new AbortController(), cancel = () => controller.abort();
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try {
  console.log(JSON.stringify(await prepareEchoPlaybackAudio({ sourcePath: args.source, cacheRoot: args.cache || path.join(root, 'data/cache/echo-playback-audio'), signal: controller.signal }), null, 2));
} finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
