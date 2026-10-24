// Attach a Score Dust loop export (P2 item 8) to a Tarot card's loop videos or
// to a Song Card's media. The export already lives in Preview Recordings
// (admin-only); attaching copies it into the public media root so Tarot Draw
// and Song surfaces can play it, and records where it came from.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { attachTarotCardMedia, normalizeTarotStore } from '../src/domain/tarot.js';

export const SCORE_DUST_LOOP_SCHEMA = 'hapa.echo.score-dust.loop-attachment.v1';
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const RECEIPT_KEYS = ['scoreFingerprint', 'seed', 'particles', 'codec', 'width', 'height', 'fps', 'frames', 'startSeconds', 'durationSeconds', 'loopBridgeSeconds', 'background', 'scoreBackground', 'finalStateFingerprint'];
const fail = (message, statusCode = 422) => Object.assign(new Error(`Score Dust loop: ${message}`), { statusCode });

export function parseLoopAttachment(body = {}) {
  const recordingId = String(body.recordingId || '');
  if (!SAFE_ID.test(recordingId)) throw fail('recordingId must name a Preview Recording', 400);
  const kind = body.target?.kind;
  if (kind === 'tarot' && typeof body.target.cardId === 'string' && body.target.cardId) return { recordingId, target: { kind, cardId: body.target.cardId }, title: String(body.title || '').slice(0, 120), receipt: body.receipt };
  if (kind === 'song' && typeof body.target.songId === 'string' && body.target.songId) return { recordingId, target: { kind, songId: body.target.songId }, title: String(body.title || '').slice(0, 120), receipt: body.receipt };
  throw fail('target must be {kind:"tarot", cardId} or {kind:"song", songId}', 400);
}

/** The media asset both stores receive; provenance is kept in metadata. */
export function scoreDustLoopAsset({ recordingId, title, receipt, uri, sizeBytes, sha256, songId = null }) {
  const source = Object.fromEntries(RECEIPT_KEYS.filter((k) => receipt?.[k] !== undefined && receipt[k] !== null && typeof receipt[k] !== 'object').map((k) => [k, receipt[k]]));
  return {
    id: `score-dust-loop-${recordingId}`, type: 'video', name: title || `Score Dust loop ${recordingId.slice(0, 8)}`, uri, mimeType: 'video/webm',
    tags: ['score-dust', 'score-dust-loop', 'seamless-loop'],
    notes: 'Seamless Score Dust loop rendered from the Echo visual score.',
    metadata: { schemaVersion: SCORE_DUST_LOOP_SCHEMA, source: 'hapa-echo-score-dust', recordingId, songId, sizeBytes, sha256, ...source },
  };
}

const matchesSong = (song, songId) => [song?.id, song?.songId, song?.cardId].includes(songId);

/**
 * attachScoreDustLoop(deps, body)
 * deps: { recordings: {get, openFile}, mediaDir, tarot: {read, write}, songs: {read, write} }
 */
export async function attachScoreDustLoop(deps, body) {
  const request = parseLoopAttachment(body);
  const record = await deps.recordings.get(request.recordingId);
  const artifact = await deps.recordings.openFile(request.recordingId);
  if (!/webm/.test(artifact.contentType)) throw fail('only WebM recordings can be attached as loops');
  // Validate the target before copying anything.
  let tarotStore = null, songStore = null, song = null;
  if (request.target.kind === 'tarot') {
    tarotStore = normalizeTarotStore(await deps.tarot.read());
    if (!tarotStore.cards.some((card) => card.id === request.target.cardId)) throw fail(`no Tarot card ${request.target.cardId}`, 404);
  } else {
    songStore = await deps.songs.read();
    song = (songStore.songs || []).find((s) => matchesSong(s, request.target.songId));
    if (!song) throw fail(`no Song Card ${request.target.songId}`, 404);
  }
  const dir = path.join(deps.mediaDir, 'score-dust-loops'), fileName = `${request.recordingId}.webm`, target = path.join(dir, fileName);
  await fsp.mkdir(dir, { recursive: true });
  const existing = fs.existsSync(target) ? (await fsp.stat(target)).size : -1;
  if (existing !== artifact.sizeBytes) await fsp.copyFile(artifact.filePath, target);
  const asset = scoreDustLoopAsset({ recordingId: request.recordingId, title: request.title || record?.projectTitle || '', receipt: request.receipt,
    uri: `/media/score-dust-loops/${fileName}`, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256 || null, songId: record?.songId || null });
  if (tarotStore) {
    const next = attachTarotCardMedia(tarotStore, request.target.cardId, asset, 'loop_video');
    await deps.tarot.write(next);
    const card = next.cards.find((c) => c.id === request.target.cardId);
    return { schemaVersion: SCORE_DUST_LOOP_SCHEMA, target: request.target, asset: card.assets.find((a) => a.id === asset.id), loops: card.assets.filter((a) => a.type === 'video').length };
  }
  const link = { ...asset, role: 'score-dust-loop', requirementId: 'song_media', createdAt: new Date().toISOString() };
  song.media = [...(song.media || []).filter((m) => m.id !== link.id), link];
  song.updatedAt = link.createdAt;
  await deps.songs.write(songStore);
  return { schemaVersion: SCORE_DUST_LOOP_SCHEMA, target: request.target, asset: link, loops: song.media.filter((m) => m.role === 'score-dust-loop').length };
}
