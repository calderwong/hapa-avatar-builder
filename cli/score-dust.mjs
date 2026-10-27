#!/usr/bin/env node
// Score Dust loop attachment (CLI parity with POST /api/echos/score-dust/loops).
// Stores are backed up under data/backups/ before they are rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewRecordingStore } from '../server/preview-recording-store.mjs';
import { attachScoreDustLoop, publishScoreDustRender } from '../server/echo-score-dust-loops.mjs';
import { bindEchoScoreDustLayerRender, compileEchoScoreDustTrack } from '../src/domain/echo-score-dust-layer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = process.env.HAPA_MEDIA_DIR || path.join(root, 'data/media');
const tarotPath = process.env.HAPA_TAROT_STORE || path.join(root, 'data/tarot-store.json');
const songPath = process.env.HAPA_SONG_STORE || path.join(root, 'data/hapa-songs-store.json');
const recordings = createPreviewRecordingStore({ mediaRoot: process.env.HAPA_PREVIEW_RECORDING_DIR || path.join(mediaDir, 'echo-preview-recordings') });
const [op, id, ...rest] = process.argv.slice(2);
const options = Object.fromEntries(rest.filter((x) => x.startsWith('--')).map((x) => { const i = x.indexOf('='); return i < 0 ? [x.slice(2), true] : [x.slice(2, i), x.slice(i + 1)]; }));

function store(file, label = 'score-dust-loop') {
  return {
    read: async () => { if (!fs.existsSync(file)) throw Object.assign(new Error(`Store not found: ${path.relative(root, file)}`), { statusCode: 404 }); return JSON.parse(fs.readFileSync(file, 'utf8')); },
    write: async (value) => {
      const backups = path.join(root, 'data/backups');
      fs.mkdirSync(backups, { recursive: true });
      fs.copyFileSync(file, path.join(backups, `${path.basename(file, '.json')}-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`));
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
  };
}

try {
  if (op === 'publish-render' && id) {
    console.log(JSON.stringify({ ok: true, data: await publishScoreDustRender({ recordings, mediaDir }, { recordingId: id }) }, null, 2));
  } else if (op === 'layer-status' && id) {
    // Score Dust layer (IP-6): the graph track a project file compiles to.
    const raw = JSON.parse(fs.readFileSync(path.resolve(id), 'utf8'));
    console.log(JSON.stringify({ ok: true, data: compileEchoScoreDustTrack(raw) }, null, 2));
  } else if (op === 'bind-layer' && id) {
    // Publish a transparent export and bind it to a project file's score_dust_layer.
    if (!options.project || !options.receipt) throw new Error('Usage: node cli/score-dust.mjs bind-layer RECORDING_ID --project=PROJECT.json --receipt=RECEIPT.json');
    const projectPath = path.resolve(options.project), raw = JSON.parse(fs.readFileSync(projectPath, 'utf8')), body = raw.music_video_project || raw.project || raw;
    if (!body.score_dust_layer) throw new Error('The project declares no score_dust_layer.');
    const receipt = JSON.parse(fs.readFileSync(path.resolve(options.receipt), 'utf8'));
    const published = await publishScoreDustRender({ recordings, mediaDir }, { recordingId: id });
    body.score_dust_layer = bindEchoScoreDustLayerRender(body.score_dust_layer, { recordingId: id, uri: published.uri, sha256: published.sha256, receipt });
    compileEchoScoreDustTrack(raw);
    await store(projectPath, 'score-dust-layer').write(raw);
    console.log(JSON.stringify({ ok: true, data: { project: projectPath, layer: body.score_dust_layer } }, null, 2));
  } else {
  if (op !== 'attach-loop' || !id || (!options.tarot && !options.song)) throw new Error('Usage: node cli/score-dust.mjs attach-loop RECORDING_ID (--tarot=CARD_ID | --song=SONG_ID) [--title=TEXT] [--receipt=RECEIPT.json] | publish-render RECORDING_ID | layer-status PROJECT.json | bind-layer RECORDING_ID --project=PROJECT.json --receipt=RECEIPT.json');
  const target = options.tarot ? { kind: 'tarot', cardId: String(options.tarot) } : { kind: 'song', songId: String(options.song) };
  const receipt = options.receipt ? JSON.parse(fs.readFileSync(options.receipt, 'utf8')) : null;
  const result = await attachScoreDustLoop({ recordings, mediaDir, tarot: store(tarotPath), songs: store(songPath) }, { recordingId: id, target, title: options.title, receipt });
  console.log(JSON.stringify({ ok: true, data: result }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
