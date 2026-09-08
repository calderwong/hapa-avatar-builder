import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { runEchoPreparationStage } from './echo-performance-preparation.mjs';
import { ByteBoundedLruCache } from './byte-bounded-lru-cache.mjs';

const VERSION = 'hapa.echo.playback-proxy.v3';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pending = new Map();
const frameIndices = new ByteBoundedLruCache({ maxBytes: 8 * 1024 ** 2, maxEntries: 32 });
const indexing = new Map();

// Read only the independently coded, hash-verified previews produced by this
// owner. FFprobe supplies MP4 packet offsets and AVC configuration; no second
// media parser or source transcode is introduced for historical frame access.
export async function readEchoPlaybackProxyFrameIndex({ proxyRoot, key } = {}) {
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw new Error('proxy-frame-key-invalid');
  const root = await fs.realpath(proxyRoot), directory = path.join(root, key), file = path.join(directory, 'preview.mp4');
  if (await fs.realpath(directory) !== directory || await fs.realpath(file) !== file) throw new Error('proxy-frame-path-invalid');
  const before = await fs.stat(file), manifestFile = path.join(directory, 'manifest.json');
  if (!before.isFile() || before.size <= 0 || before.size > 32 * 1024 ** 2 || (await fs.stat(manifestFile)).size > 65536) throw new Error('proxy-frame-input-budget');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (manifest.key !== key || manifest.schemaVersion !== VERSION || manifest.settings?.gop !== 1 || manifest.settings?.bFrames !== 0 || manifest.durationSeconds * 30 > 4096 || manifest.byteSize !== before.size) throw new Error('proxy-frame-index-unsupported');
  const identity = await createEchoSourceInspector().inspect(file);
  if (identity.sha256 !== manifest.sha256) throw new Error('proxy-frame-hash-mismatch');
  const cacheKey = `${key}:${identity.sha256}`;
  const cached = frameIndices.get(cacheKey); if (cached) return cached.index;
  if (indexing.has(cacheKey)) return indexing.get(cacheKey);
  if (indexing.size >= 2) throw new Error('proxy-frame-index-busy');
  const work = (async () => {
    const data = JSON.parse(await command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_streams', '-show_data', '-show_entries', 'packet=pos,size,pts_time,dts_time,duration_time,flags:stream=codec_name,codec_tag_string,width,height,extradata', '-of', 'json=compact=1', file]));
    const stream = data.streams?.[0];
    if (data.streams?.length !== 1 || stream.codec_name !== 'h264' || stream.codec_tag_string !== 'avc1' || stream.width !== manifest.width || stream.height !== manifest.height) throw new Error('proxy-frame-codec-mismatch');
    const description = String(stream.extradata || '').trim().split('\n').map(line => line.slice(10).split(/ {2,}/)[0].replace(/\s/g, '')).join('');
    if (!/^01[a-f0-9]{12,2046}$/i.test(description) || description.length % 2) throw new Error('proxy-frame-avc-description-invalid');
    const packets = (data.packets || []).map(row => ({ offset: Number(row.pos), size: Number(row.size), timestamp: Math.round(Number(row.pts_time) * 1e6), duration: Math.round(Number(row.duration_time) * 1e6), independent: String(row.flags).includes('K'), dts: Math.round(Number(row.dts_time) * 1e6) }));
    if (!packets.length || packets.length > 4096 || packets.some((p, i) => ![p.offset, p.size, p.timestamp, p.duration, p.dts].every(Number.isSafeInteger) || p.offset < 0 || p.size <= 0 || p.offset + p.size > before.size || p.timestamp < 0 || p.duration <= 0 || p.timestamp !== p.dts || !p.independent || (i > 0 && (p.timestamp <= packets[i - 1].timestamp || p.offset < packets[i - 1].offset + packets[i - 1].size)))) throw new Error('proxy-frame-packets-invalid');
    const after = await fs.stat(file);
    if ([before.size, before.mtimeMs, before.ctimeMs, before.ino].join(':') !== [after.size, after.mtimeMs, after.ctimeMs, after.ino].join(':')) throw new Error('proxy-frame-source-changed');
    const index = { schemaVersion: 'hapa.echo.proxy-frame-index.v1', key, sha256: identity.sha256, byteSize: before.size, codec: `avc1.${description.slice(2, 8)}`, description, width: stream.width, height: stream.height, startSeconds: packets[0].timestamp / 1e6, durationSeconds: manifest.durationSeconds, packets: packets.map(({ dts, independent, ...p }) => p) };
    frameIndices.set(cacheKey, { index, size: Buffer.byteLength(JSON.stringify(index)) * 3 });
    return index;
  })().finally(() => indexing.delete(cacheKey));
  indexing.set(cacheKey, work); return work;
}
async function command(executable, args, { signal, timeoutMs = 30000 } = {}) {
  let output = '';
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  let overflow = false;
  try {
    await runEchoPreparationStage(executable, args, { signal: controller.signal, timeoutMs, onOutput: chunk => {
      if (output.length + chunk.length > 1024 * 1024) { overflow = true; controller.abort(); } else output += chunk;
    } });
    if (overflow) throw new Error('proxy-process-output-budget');
    return output;
  } finally { signal?.removeEventListener('abort', abort); }
}
async function probe(file, options) {
  const data = JSON.parse(await command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height,avg_frame_rate,start_time,duration:format=duration,start_time', '-of', 'json', file], options));
  const stream = data.streams?.[0];
  const startSeconds = Number(stream?.start_time ?? data.format?.start_time ?? 0);
  // A container can report an interval length without its positive video origin.
  // Playback bounds are the video stream's end on the preserved source timeline.
  const duration = Number(stream?.duration) > 0 ? startSeconds + Number(stream.duration) : Number(data.format?.duration);
  if (!stream || ![stream.width, stream.height].every(value => Number.isSafeInteger(value) && value > 0) || !(duration > 0 && duration <= 1800)) throw new Error('proxy-source-dimensions-or-duration-budget');
  return { codec: stream.codec_name, pixelFormat: stream.pix_fmt, width: stream.width, height: stream.height,
    durationSeconds: duration, frameRate: stream.avg_frame_rate, startSeconds };
}

/** Extracts the existing bounded H.264 preview transcode into a source-hashed,
 * independently verifiable derivative. It never writes a project or source. */
export function prepareEchoPlaybackProxy(options) {
  // Abort belongs to one request. Do not let one caller cancel another caller's
  // in-flight work; the queue owner deduplicates identical queued jobs instead.
  if (options.signal) return prepare(options);
  const key = JSON.stringify(options);
  if (pending.has(key)) return pending.get(key);
  const work = prepare(options).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
async function prepare({ sourcePath, proxyRoot, uriRoot = '/media/echo-proxies-v2', maximumDurationSeconds = null, seekOptimized = false, maximumDimension = 1280, signal } = {}) {
  if (![640, 960, 1280].includes(maximumDimension)) throw new Error('proxy-dimension-unsupported');
  if (typeof uriRoot !== 'string' || !uriRoot.startsWith('/media/') || uriRoot.includes('..')) throw new Error('proxy-local-media-uri-required');
  const source = await fs.realpath(sourcePath), root = path.resolve(proxyRoot);
  const before = await fs.stat(source);
  const sourceStamp = [before.size, before.mtimeMs, before.ctimeMs, before.ino].join(':');
  if (!before.isFile() || before.size > 2 * 1024 ** 3 || !before.size) throw new Error('proxy-source-file-budget');
  const inspector = createEchoSourceInspector();
  const ensureSourceUnchanged = async () => {
    const after = await fs.stat(source);
    if ([before.size, before.mtimeMs, before.ctimeMs, before.ino].join(':') !== [after.size, after.mtimeMs, after.ctimeMs, after.ino].join(':')) throw new Error('proxy-source-changed-during-preparation');
  };
  const identity = await inspector.inspect(source);
  if (!identity.sha256 || identity.status !== 'bytes-verified') throw new Error('proxy-source-unverified');
  const original = await probe(source, { signal });
  if (Math.max(original.width, original.height) > 16384 || original.width * original.height > 64 * 1024 * 1024) throw new Error('proxy-source-decoded-pixel-budget');
  if (!Number.isFinite(original.startSeconds) || original.startSeconds < 0 || original.startSeconds >= original.durationSeconds) throw new Error('proxy-nonzero-source-origin-requires-time-map');
  const requested = maximumDurationSeconds === null ? original.durationSeconds : Number(maximumDurationSeconds);
  if (!(requested > 0 && requested <= 1800)) throw new Error('proxy-duration-budget');
  const duration = Math.min(original.durationSeconds, requested);
  const decoder = (await command('ffmpeg', ['-version'], { signal, timeoutMs: 10000 })).split('\n')[0];
  const settings = { fps: 30, maximumDimension, codec: 'libx264', preset: 'veryfast', crf: 27, maximumBitrate: '1500k', bufferSize: '3000k', gop: 30, pixelFormat: 'yuv420p', sourceOrigin: 'preserved-zero', durationSeconds: duration };
  if (seekOptimized) Object.assign(settings, { gop: 1, bFrames: 0, maximumBitrate: '8000k', bufferSize: '16000k', seekOptimized: true });
  if (original.startSeconds > .001) Object.assign(settings, { sourceOrigin: 'preserved-positive', sourceOriginSeconds: original.startSeconds, copyTimestamps: true });
  const key = hash({ version: VERSION, sourceHash: identity.sha256, settings, decoder });
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  if (source === realRoot || source.startsWith(realRoot + path.sep)) throw new Error('proxy-cache-cannot-own-source');
  const directory = path.join(root, key), manifestPath = path.join(directory, 'manifest.json');
  try {
    const manifestBytes = await fs.readFile(manifestPath);
    if (manifestBytes.length > 65536) throw new Error('proxy-manifest-budget');
    const cached = JSON.parse(manifestBytes);
    const file = path.join(directory, 'preview.mp4');
    const measured = await inspector.inspect(file);
    if (cached.key !== key || cached.sourceHash !== identity.sha256 || cached.sha256 !== measured.sha256 || cached.byteSize !== measured.bytes) throw new Error('proxy-cache-identity-mismatch');
    const current = await probe(file, { signal });
    if (current.codec !== 'h264' || current.pixelFormat !== 'yuv420p' || current.width !== cached.width || current.height !== cached.height || Math.abs(current.durationSeconds - cached.durationSeconds) > .001 || Math.abs(current.startSeconds - original.startSeconds) > .001) throw new Error('proxy-cache-probe-mismatch');
    await ensureSourceUnchanged();
    return { ...cached, sourceStamp, uri: `${uriRoot}/${key}/preview.mp4`, path: file, cached: true };
  } catch (error) {
    if (signal?.aborted || error.message === 'proxy-source-changed-during-preparation') throw error;
    // An owned corrupt/incomplete derivative is disposable. Remove only this
    // content-key directory; the source was explicitly excluded from the cache.
    const existing = await fs.lstat(directory).catch(cause => { if (cause.code !== 'ENOENT') throw cause; return null; });
    if (existing?.isSymbolicLink()) throw new Error('proxy-cache-symlink-rejected');
    if (existing) {
      const quarantine = path.join(root, `.invalid-${key}-${Date.now()}`);
      await fs.rename(directory, quarantine);
      await fs.rm(quarantine, { recursive: true, force: true });
    } else if (error.code !== 'ENOENT') throw error;
  }
  const temporary = await fs.mkdtemp(path.join(root, '.preparing-'));
  try {
    const file = path.join(temporary, 'preview.mp4');
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...(settings.copyTimestamps ? ['-copyts'] : []), '-i', source, '-t', duration.toFixed(6), '-map', '0:v:0', '-an',
      '-vf', "scale='min(" + maximumDimension + ",iw)':'min(" + maximumDimension + ",ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
      '-maxrate', settings.maximumBitrate, '-bufsize', settings.bufferSize, '-pix_fmt', 'yuv420p', '-r', '30', '-g', String(settings.gop), '-keyint_min', String(settings.gop), ...(seekOptimized ? ['-bf', '0'] : []), '-sc_threshold', '0', '-movflags', '+faststart', '-threads', '2', file], { signal, timeoutMs: 600000 });
    const media = await probe(file, { signal });
    if (media.codec !== 'h264' || media.pixelFormat !== 'yuv420p' || media.durationSeconds < duration - .08 || Math.max(media.width, media.height) > maximumDimension) throw new Error('proxy-encode-verification-failed');
    if (Math.abs(media.startSeconds - original.startSeconds) > .001) throw new Error('proxy-encode-source-origin-shift');
    const bytes = await inspector.inspect(file);
    await ensureSourceUnchanged();
    const verifiedSource = await createEchoSourceInspector().inspect(source);
    if (verifiedSource.sha256 !== identity.sha256) throw new Error('proxy-source-hash-changed');
    if (!bytes.sha256) throw new Error('proxy-output-hash-unavailable');
    const manifest = { schemaVersion: VERSION, key, status: 'ready', sourcePath: source, sourceHash: identity.sha256, sourceDurationSeconds: original.durationSeconds,
      ...media, sha256: bytes.sha256, byteSize: bytes.bytes, uri: `${uriRoot}/${key}/preview.mp4`, settings, decoder,
      fidelity: 'sampled-H264-preview; originals retained for export', fastStart: true, maxDimension: maximumDimension, maxBitRate: seekOptimized ? 8000000 : 1500000, gopSeconds: settings.gop / settings.fps, fingerprint: key, mimeType: 'video/mp4' };
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temporary, directory);
    return { ...manifest, sourceStamp, path: path.join(directory, 'preview.mp4'), cached: false };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
