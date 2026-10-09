#!/usr/bin/env node
// Apply a plan from scripts/plan-echo-download-heal.py in one song-store transaction.
// Same record fields as server/song-audio-upload.mjs (formatPath/formatUri/localPath/audioUploads),
// same store lock and atomic publication, but one backup and one receipt for the batch.
// Files move from staging (same volume) or hard-link from downloads, so custody costs no extra disk.
// "make-current" stem sets preserve the prior stem records in song.stemHistory instead of deleting them.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { echoSourceContainer } from '../server/echo-source-inventory.mjs';
import { acquireOwnedFileLock, releaseOwnedFileLock } from '../server/owned-file-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opts = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf('='); return at < 0 ? [arg.slice(2), true] : [arg.slice(2, at), arg.slice(at + 1)]; }));
const storePath = path.resolve(process.env.HAPA_SONG_STORE || path.join(root, 'data/hapa-songs-store.json'));
const plan = JSON.parse(fs.readFileSync(opts.plan, 'utf8'));
const apply = opts.apply === true;
const mediaDir = path.join(path.dirname(storePath), 'song-audio-uploads');
const roleKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sha = value => createHash('sha256').update(value).digest('hex');
function fileSha(file) {
  const hash = createHash('sha256'), fd = fs.openSync(file, 'r'), buf = Buffer.alloc(8 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function header(file) { const fd = fs.openSync(file, 'r'), b = Buffer.alloc(16); try { fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); } return echoSourceContainer(b); }

const now = new Date().toISOString(), batchId = `echo-download-heal-${now.replace(/[:.]/g, '-')}`;
const work = [];
for (const entry of plan.songs) for (const action of entry.actions) {
  if (action.kind === 'master') work.push({ songId: entry.songId, kind: 'master', format: action.format, file: action.file, via: 'hardlink' });
  else for (const [format, files] of Object.entries(action.stems))
    for (const f of files) work.push({ songId: entry.songId, kind: 'stem', format, role: f.role, file: f.file, via: 'move', origin: `${path.basename(f.archive)}:${f.member}`, mode: action.mode });
}
for (const item of work) {
  if (!fs.existsSync(item.file)) throw new Error(`Missing planned file ${item.file}`);
  if (header(item.file) !== item.format) throw new Error(`Container mismatch ${item.file}`);
}
const switching = new Set(plan.songs.filter(e => e.actions.some(a => a.mode === 'make-current')).map(e => e.songId));
console.log(JSON.stringify({ apply, files: work.length, masters: work.filter(w => w.kind === 'master').length, stems: work.filter(w => w.kind === 'stem').length, stemSetSwitches: switching.size }));
if (!apply) process.exit(0);

fs.mkdirSync(mediaDir, { recursive: true });
const lock = acquireOwnedFileLock({ lockPath: storePath + '.audio-reference-repair.lock', schemaVersion: 'hapa.song-audio-reference-repair-lock.v1', staleLegacyMs: 60000 });
const placed = [];
try {
  const beforeBytes = fs.readFileSync(storePath), store = JSON.parse(beforeBytes);
  const byId = new Map(store.songs.map(s => [s.id, s]));
  const receipt = { schemaVersion: 'hapa.echo-download-heal.v1', id: batchId, createdAt: now, plan: path.resolve(opts.plan), downloads: plan.downloads,
    beforeStoreSha256: sha(beforeBytes), switchedStemSets: [], files: [], sourceFilesModified: false };
  for (const songId of switching) {
    const song = byId.get(songId);
    song.stemHistory = [...(song.stemHistory || []), { supersededAt: now, reason: 'Replaced by downloaded Suno stem set with paired WAV and MP3 (Calder, 2026-10-08)', batchId, stems: song.stems || [] }];
    receipt.switchedStemSets.push({ songId, archivedRecords: (song.stems || []).length });
    song.stems = [];
  }
  for (const item of work) {
    const song = byId.get(item.songId);
    if (!song) throw new Error(`Song not found ${item.songId}`);
    let target;
    if (item.kind === 'master') { song.audio ||= {}; target = song.audio; if (target.wavPath && fs.existsSync(target.wavPath)) continue; }
    else {
      song.stems ||= [];
      target = song.stems.find(s => roleKey(s.stemType || s.kind || s.title || s.id) === roleKey(item.role));
      if (!target) { if (song.stems.length >= 48) throw new Error(`48 stem-record limit: ${item.songId}`); target = { id: `${item.songId}-stem-${roleKey(item.role)}`, stemType: item.role, kind: item.role, title: `${song.title} (${item.role})` }; song.stems.push(target); }
    }
    const id = randomUUID(), dest = path.join(mediaDir, `${id}.${item.format}`);
    if (item.via === 'move') fs.renameSync(item.file, dest);
    else { try { fs.linkSync(item.file, dest); } catch { fs.copyFileSync(item.file, dest, fs.constants.COPYFILE_EXCL); } }
    placed.push({ dest, back: item.via === 'move' ? item.file : null });
    const bytes = fs.statSync(dest).size, digest = fileSha(dest);
    const oldFormat = path.extname(target.localPath || '').slice(1).toLowerCase().replace(/^wave$/, 'wav');
    if (['wav', 'mp3'].includes(oldFormat) && !target[oldFormat + 'Path'] && target.localPath) { target[oldFormat + 'Path'] = target.localPath; target[oldFormat + 'Uri'] ||= pathToFileURL(target.localPath).href; }
    target[item.format + 'Path'] = dest; target[item.format + 'Uri'] = pathToFileURL(dest).href;
    const oldPreferredExists = target.localPath && fs.existsSync(target.localPath);
    if (item.format === 'wav' || !oldPreferredExists || new RegExp(`\\.${item.format}$`, 'i').test(target.localPath || '')) {
      target.localPath = dest; target.localAvailable = true; target.format = item.format; target.sha256 = digest;
    }
    const filename = item.kind === 'master' ? path.basename(item.file) : item.origin;
    target.audioUploads = [...(target.audioUploads || []), { id, format: item.format, path: dest, filename, sha256: digest, bytes, uploadedAt: now, source: 'echo-download-heal', batchId, verification: 'container-header+duration-match', decodeVerified: false }];
    receipt.files.push({ songId: item.songId, kind: item.kind, role: item.role || null, format: item.format, source: item.file, origin: filename, via: item.via, dest, sha256: digest, bytes });
  }
  store.updatedAt = now;
  const next = Buffer.from(JSON.stringify(store, null, 2) + '\n');
  const backupPath = path.join(path.dirname(storePath), 'backups', `songs-before-${batchId}.json`);
  const receiptPath = path.join(path.dirname(storePath), 'merge-reports', `${batchId}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true }); fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(backupPath, beforeBytes, { flag: 'wx', mode: 0o600 });
  Object.assign(receipt, { backupPath, afterStoreSha256: sha(next), state: 'prepared' });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const temp = `${storePath}.${batchId}.tmp`, fd = fs.openSync(temp, 'wx', fs.statSync(storePath).mode & 0o777);
  try { fs.writeFileSync(fd, next); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (sha(fs.readFileSync(storePath)) !== receipt.beforeStoreSha256) { fs.rmSync(temp); throw new Error('Song store changed during heal; nothing published'); }
  fs.renameSync(temp, storePath);
  fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, state: 'applied' }, null, 2) + '\n', { mode: 0o600 });
  placed.length = 0;
  console.log(JSON.stringify({ ok: true, receiptPath, backupPath, files: receipt.files.length, switched: receipt.switchedStemSets.length }));
} finally {
  // On failure, return moved staging files and remove links so the store and disk stay consistent.
  for (const p of placed.reverse()) { try { if (p.back) fs.renameSync(p.dest, p.back); else fs.rmSync(p.dest, { force: true }); } catch {} }
  releaseOwnedFileLock(lock);
}
