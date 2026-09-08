import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { runEchoPreparationStage } from './echo-performance-preparation.mjs';

const VERSION = 'hapa.echo.playback-proxy.v3';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pending = new Map();
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
async function prepare({ sourcePath, proxyRoot, uriRoot = '/media/echo-proxies-v2', maximumDurationSeconds = null, seekOptimized = false, signal } = {}) {
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
  const settings = { fps: 30, maximumDimension: 1280, codec: 'libx264', preset: 'veryfast', crf: 27, maximumBitrate: '1500k', bufferSize: '3000k', gop: 30, pixelFormat: 'yuv420p', sourceOrigin: 'preserved-zero', durationSeconds: duration };
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
      '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27',
      '-maxrate', settings.maximumBitrate, '-bufsize', settings.bufferSize, '-pix_fmt', 'yuv420p', '-r', '30', '-g', String(settings.gop), '-keyint_min', String(settings.gop), ...(seekOptimized ? ['-bf', '0'] : []), '-sc_threshold', '0', '-movflags', '+faststart', '-threads', '2', file], { signal, timeoutMs: 600000 });
    const media = await probe(file, { signal });
    if (media.codec !== 'h264' || media.pixelFormat !== 'yuv420p' || media.durationSeconds < duration - .08 || Math.max(media.width, media.height) > 1280) throw new Error('proxy-encode-verification-failed');
    if (Math.abs(media.startSeconds - original.startSeconds) > .001) throw new Error('proxy-encode-source-origin-shift');
    const bytes = await inspector.inspect(file);
    await ensureSourceUnchanged();
    const verifiedSource = await createEchoSourceInspector().inspect(source);
    if (verifiedSource.sha256 !== identity.sha256) throw new Error('proxy-source-hash-changed');
    if (!bytes.sha256) throw new Error('proxy-output-hash-unavailable');
    const manifest = { schemaVersion: VERSION, key, status: 'ready', sourcePath: source, sourceHash: identity.sha256, sourceDurationSeconds: original.durationSeconds,
      ...media, sha256: bytes.sha256, byteSize: bytes.bytes, uri: `${uriRoot}/${key}/preview.mp4`, settings, decoder,
      fidelity: 'sampled-H264-preview; originals retained for export', fastStart: true, maxDimension: 1280, maxBitRate: seekOptimized ? 8000000 : 1500000, gopSeconds: settings.gop / settings.fps, fingerprint: key, mimeType: 'video/mp4' };
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temporary, directory);
    return { ...manifest, sourceStamp, path: path.join(directory, 'preview.mp4'), cached: false };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
