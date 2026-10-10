import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import {
  ECHO_PREVIEW_RECORD_MAX_DURATION_MS,
  ECHO_PREVIEW_RECORD_MIME_CANDIDATES,
  ECHO_PREVIEW_RECORD_FPS,
  ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE,
  ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE,
  createEchoPreviewRecordingSession,
  echoPreviewRecordingContentType,
  echoPreviewRecordingFileExtension,
  echoPreviewRecordingFileName,
  echoPreviewRecordingQualityLabel,
  ensureEchoPreviewRecordingLocalSession,
  formatEchoPreviewRecordingElapsed,
  pickEchoPreviewRecordingMimeType,
} from "../src/domain/echo-preview-recording.js";
import {
  createPreviewRecordingStore,
  PreviewRecordingStoreError,
} from "../server/preview-recording-store.mjs";
import { paintEchoLyricSurfaceToCanvas } from "../src/domain/echo-lyric-presentation.js";

// ---------------------------------------------------------------------------
// Domain: container negotiation
// ---------------------------------------------------------------------------

test("pickEchoPreviewRecordingMimeType prefers the first supported candidate", () => {
  const saw = [];
  const mimeType = pickEchoPreviewRecordingMimeType((candidate) => {
    saw.push(candidate);
    return candidate === ECHO_PREVIEW_RECORD_MIME_CANDIDATES[2];
  });
  assert.equal(mimeType, ECHO_PREVIEW_RECORD_MIME_CANDIDATES[2]);
  assert.equal(saw.length, 3); // stops walking after the first supported one
});

test("pickEchoPreviewRecordingMimeType returns undefined when nothing is supported", () => {
  assert.equal(pickEchoPreviewRecordingMimeType(() => false), undefined);
  assert.equal(pickEchoPreviewRecordingMimeType(undefined), undefined);
  assert.equal(pickEchoPreviewRecordingMimeType(() => { throw new Error("no recorder"); }), undefined);
});

test("recording container helpers map mime to extension and content type", () => {
  assert.equal(echoPreviewRecordingFileExtension('video/mp4;codecs="avc1.42E01E,mp4a.40.2"'), "mp4");
  assert.equal(echoPreviewRecordingFileExtension("video/mp4"), "mp4");
  assert.equal(echoPreviewRecordingFileExtension("video/webm"), "webm");
  assert.equal(echoPreviewRecordingFileExtension(""), "webm");
  assert.equal(echoPreviewRecordingContentType("video/mp4"), "video/mp4");
  assert.equal(echoPreviewRecordingContentType("video/webm;codecs=vp9,opus"), "video/webm");
  assert.equal(ECHO_PREVIEW_RECORD_FPS, 30);
});

test("recording quality profile gives full-resolution motion and audio a high bitrate budget", () => {
  assert.equal(ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE, 20_000_000);
  assert.equal(ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE, 256_000);
  assert.equal(
    echoPreviewRecordingQualityLabel({ width: 1920, height: 1080 }),
    "HQ 1920\u00d71080 · 30 FPS · 20 Mbps VIDEO · 256 kbps AUDIO",
  );
  assert.equal(
    echoPreviewRecordingQualityLabel({ width: 1080, height: 1920 }),
    "HQ 1080\u00d71920 · 30 FPS · 20 Mbps VIDEO · 256 kbps AUDIO",
  );
});

test("recording filenames include song, take number, length, and timestamp", () => {
  assert.equal(
    echoPreviewRecordingFileName({
      songTitle: 'Brave Tongues: Live / Echo',
      recordingNumber: 3,
      durationMs: 312_400,
      createdAt: new Date("2026-08-24T18:52:14.432Z"),
      mimeType: "video/mp4",
    }),
    "Brave Tongues - Live - Echo - recording 03 - 05m12s - 2026-08-24T18-52-14Z.mp4",
  );
});

test("formatEchoPreviewRecordingElapsed renders m:ss", () => {
  assert.equal(formatEchoPreviewRecordingElapsed(0), "0:00");
  assert.equal(formatEchoPreviewRecordingElapsed(95000), "1:35");
  assert.equal(formatEchoPreviewRecordingElapsed(121_000), "2:01");
  assert.equal(formatEchoPreviewRecordingElapsed(-5), "0:00");
});

// ---------------------------------------------------------------------------
// Domain: MediaRecorder session lifecycle
// ---------------------------------------------------------------------------

function fakeRecorder({ autoStopOnSecond = null } = {}) {
  const recorder = {
    state: "inactive",
    mimeType: "video/webm;codecs=vp8,opus",
    onstop: null,
    onerror: null,
    startedWith: null,
    stopped: false,
    start(timeslice) {
      if (this.state !== "inactive") throw new Error("InvalidStateError");
      this.state = "recording";
      this.startedWith = timeslice ?? null;
      if (autoStopOnSecond !== null) {
        setTimeout(() => {
          if (this.state === "recording") {
            this.state = "inactive";
            this.onstop?.();
          }
        }, autoStopOnSecond);
      }
    },
    stop() {
      if (this.state === "inactive") throw new Error("InvalidStateError");
      this.state = "inactive";
      this.stopped = true;
      this.onstop?.();
    },
    fail() {
      this.state = "inactive";
      this.onerror?.({ error: new Error("synthetic recorder failure") });
    },
  };
  return recorder;
}

function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    advance(ms) { current += ms; },
  };
}

test("session records, ticks, and resolves a blob on stop", async () => {
  const clock = fakeClock();
  const recorder = fakeRecorder();
  const session = createEchoPreviewRecordingSession({
    recorder,
    maxDurationMs: 60_000,
    clock: clock.now,
    tickIntervalMs: 1,
  });
  assert.equal(session.state, "idle");
  session.start(1000);
  assert.equal(session.state, "recording");
  assert.equal(recorder.startedWith, 1000);
  assert.throws(() => session.start(1000), /cannot start/i); // double-start guard
  clock.advance(2500);
  await new Promise((resolve) => setTimeout(resolve, 80)); // interval is clamped to >=50ms; let a tick observe the fake clock
  const result = await session.stop({
    buildResultBlob: () => "BLOB",
    timeoutMs: 20,
  });
  assert.equal(result.state, "stopped");
  assert.equal(result.blob, "BLOB");
  assert.ok(result.durationMs >= 2000 && result.durationMs <= 3000);
  assert.equal(session.state, "stopped");
  // Stop after completion is a resolved no-op, never a throw.
  const again = await session.stop({ timeoutMs: 20 });
  assert.equal(again.state, "stopped");
  assert.equal(again.blob, null);
});

test("session auto-stops at the duration ceiling and still resolves", async () => {
  const recorder = fakeRecorder();
  let autoStopCalls = 0;
  const startedAt = Date.now();
  const session = createEchoPreviewRecordingSession({
    recorder,
    maxDurationMs: 5,
    clock: () => Date.now() - startedAt, // real elapsed time
    tickIntervalMs: 5,
    onAutoStop: () => { autoStopCalls += 1; },
  });
  session.start(1000);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(autoStopCalls, 1);
  assert.equal(session.state, "stopped");
  assert.equal(recorder.state, "inactive");
  const result = await session.stop({ buildResultBlob: () => "BLOB", timeoutMs: 20 });
  assert.equal(result.state, "stopped");
  assert.equal(result.blob, "BLOB");
});

test("session surfaces recorder errors instead of hanging", async () => {
  const recorder = fakeRecorder();
  const session = createEchoPreviewRecordingSession({ recorder, clock: () => 0, tickIntervalMs: 5 });
  session.start(1000);
  recorder.fail();
  assert.equal(session.state, "error");
  const result = await session.stop({ timeoutMs: 20 });
  assert.equal(result.state, "error");
  assert.match(result.error, /synthetic recorder failure/);
});

test("session rejects a non-recorder input", () => {
  assert.throws(() => createEchoPreviewRecordingSession({}), /MediaRecorder/);
});

// ---------------------------------------------------------------------------
// Server store: persistence, safety, retention
// ---------------------------------------------------------------------------

async function tempMediaRoot() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "hapa-preview-recordings-"));
}

test("store add/list/get round-trips a capture with sha256 and size", async () => {
  const root = await tempMediaRoot();
  try {
    const store = createPreviewRecordingStore({
      mediaRoot: root,
      randomId: () => "a1b2c3d4-0000-4000-8000-000000000001",
      now: () => new Date("2026-08-24T00:00:00.000Z"),
    });
    const bytes = Buffer.from("0123456789abcdef");
    const record = await store.add({
      buffer: bytes,
      mimeType: "video/webm;codecs=vp8,opus",
      metadata: { songId: "song-1", songTitle: "Brave Tongues", width: 1920, height: 1080, fps: 30, durationMs: 12_345 },
    });
    assert.equal(record.id, "a1b2c3d4-0000-4000-8000-000000000001");
    assert.equal(record.extension, "webm");
    assert.equal(record.contentType, "video/webm");
    assert.equal(record.recordingNumber, 1);
    assert.equal(record.fileName, "Brave Tongues - recording 01 - 00m12s - 2026-08-24T00-00-00Z.webm");
    assert.equal(record.sizeBytes, bytes.byteLength);
    assert.equal(record.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
    assert.equal(record.songTitle, "Brave Tongues");
    const file = await store.openFile(record.id);
    assert.equal(file.sizeBytes, bytes.byteLength);
    assert.equal(file.contentType, "video/webm");
    assert.equal(fs.readFileSync(file.filePath, "utf8"), "0123456789abcdef");
    const listed = await store.list();
    assert.equal(listed.length, 1);
    // List rows must be plain objects (the serializer is async; a promise
    // would stringify to {} and silently corrupt the shelf).
    assert.equal(typeof listed[0], "object");
    assert.equal(listed[0].id, record.id);
    assert.equal(JSON.parse(JSON.stringify(listed[0])).id, record.id);
    assert.equal((await store.get(record.id)).id, record.id);
    const filtered = await store.list({ songId: "other" });
    assert.equal(filtered.length, 0);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("store add numbers later takes per song and serves inline for mp4 uploads", async () => {
  const root = await tempMediaRoot();
  try {
    let id = 0;
    const store = createPreviewRecordingStore({
      mediaRoot: root,
      randomId: () => `11111111-1111-4111-8111-${String(++id).padStart(12, "0")}`,
      now: () => new Date("2026-08-24T18:52:14.000Z"),
    });
    await store.add({ buffer: Buffer.from("first"), mimeType: "video/webm", metadata: { songId: "song-1", songTitle: "Brave Tongues" } });
    const record = await store.add({ buffer: Buffer.from("mp4-bytes"), mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', metadata: { songId: "song-1", songTitle: "Brave Tongues", durationMs: 65_000 } });
    assert.equal(record.extension, "mp4");
    assert.equal(record.recordingNumber, 2);
    assert.equal(record.fileName, "Brave Tongues - recording 02 - 01m05s - 2026-08-24T18-52-14Z.mp4");
    assert.equal(record.contentType, "video/mp4");
    const file = await store.openFile(record.id);
    assert.equal(file.contentType, "video/mp4");
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("store rejects unsafe ids, empty uploads, oversized uploads, and unknown ids", async () => {
  const root = await tempMediaRoot();
  try {
    const store = createPreviewRecordingStore({ mediaRoot: root, maxFileBytes: 16, randomId: () => "a1b2c3d4-0000-4000-8000-000000000002" });
    await assert.rejects(
      store.add({ buffer: Buffer.from("x"), mimeType: "video/webm", metadata: { id: "../../etc/passwd" } }),
      (error) => error instanceof PreviewRecordingStoreError && error.code === "preview_recording_id_unsafe",
    );
    await assert.rejects(
      store.add({ buffer: Buffer.alloc(0), mimeType: "video/webm" }),
      (error) => error instanceof PreviewRecordingStoreError && error.code === "preview_recording_empty",
    );
    await assert.rejects(
      store.add({ buffer: Buffer.alloc(32), mimeType: "video/webm" }),
      (error) => error instanceof PreviewRecordingStoreError && error.code === "preview_recording_too_large" && error.statusCode === 413,
    );
    await assert.rejects(
      store.get("a1b2c3d4-0000-4000-8000-000000000003"),
      (error) => error instanceof PreviewRecordingStoreError && error.code === "preview_recording_not_found" && error.statusCode === 404,
    );
    // Path traversal can never escape the media root, even via the index.
    await assert.rejects(
      store.openFile("a1b2c3d4-0000-4000-8000-000000000004"),
      (error) => error instanceof PreviewRecordingStoreError && error.statusCode === 404,
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("store remove deletes the file and the index entry", async () => {
  const root = await tempMediaRoot();
  try {
    const store = createPreviewRecordingStore({ mediaRoot: root, randomId: () => "a1b2c3d4-0000-4000-8000-000000000005" });
    const record = await store.add({ buffer: Buffer.from("delete-me"), mimeType: "video/webm" });
    const result = await store.remove(record.id);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(path.join(root, record.fileName)), false);
    assert.equal((await store.list()).length, 0);
    await assert.rejects(
      store.remove(record.id),
      (error) => error instanceof PreviewRecordingStoreError && error.code === "preview_recording_not_found",
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("store retention ceiling evicts the oldest capture", async () => {
  const root = await tempMediaRoot();
  try {
    let counter = 0;
    const store = createPreviewRecordingStore({
      mediaRoot: root,
      maxRecordings: 2,
      randomId: () => `a1b2c3d4-0000-4000-8000-00000000${String(++counter).padStart(4, "0")}`,
      now: () => new Date(Date.UTC(2026, 7, 23, 12, 0, counter)),
    });
    const first = await store.add({ buffer: Buffer.from("one"), mimeType: "video/webm" });
    await store.add({ buffer: Buffer.from("two"), mimeType: "video/webm" });
    await store.add({ buffer: Buffer.from("three"), mimeType: "video/webm" });
    const listed = await store.list();
    assert.equal(listed.length, 2);
    assert.equal(listed.some((row) => row.id === first.id), false);
    assert.equal(fs.existsSync(path.join(root, first.fileName)), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("store serializes concurrent mutations through the index write chain", async () => {
  const root = await tempMediaRoot();
  try {
    const store = createPreviewRecordingStore({ mediaRoot: root, randomId: () => `a1b2c3d4-0000-4000-8000-${crypto.randomBytes(4).toString("hex")}` });
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        store.add({ buffer: Buffer.from(`concurrent-${index}`), mimeType: "video/webm", metadata: { songId: "song-x" } }),
      ),
    );
    const listed = await store.list({ songId: "song-x" });
    assert.equal(listed.length, 6);
    assert.ok(listed.every((row) => typeof row === "object" && typeof row.id === "string" && row.id.length >= 8), "list rows must be hydrated plain objects");
    const indexRaw = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
    assert.equal(indexRaw.recordings.length, 6);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Source contracts: server routes, CLI, and the Director Preview UI
// ---------------------------------------------------------------------------

const repoRoot = new URL("..", import.meta.url);
const apiSource = fs.readFileSync(new URL("server/api.mjs", repoRoot), "utf8");
const cliSource = fs.readFileSync(new URL("cli/avatar-builder.mjs", repoRoot), "utf8");
const viewSource = fs.readFileSync(new URL("src/components/HapaEchosView.jsx", repoRoot), "utf8");
const domainSource = fs.readFileSync(new URL("src/domain/echo-preview-recording.js", repoRoot), "utf8");

test("api registers admin-gated preview recording routes with a bounded raw upload", () => {
  assert.match(apiSource, /import \{ createPreviewRecordingStore, PreviewRecordingStoreError \} from ".\/preview-recording-store\.mjs";/);
  assert.match(apiSource, /const PREVIEW_RECORDING_DIR = process\.env\.HAPA_PREVIEW_RECORDING_DIR \|\| path\.join\(MEDIA_DIR, "echo-preview-recordings"\);/);
  assert.match(apiSource, /PREVIEW_RECORDING_MAX_UPLOAD_BYTES = Math\.max\(1 \* 1024 \* 1024, Math\.min\(512 \* 1024 \* 1024, Number\(process\.env\.HAPA_PREVIEW_RECORDING_MAX_UPLOAD_BYTES\) \|\| 128 \* 1024 \* 1024\)/);
  assert.match(apiSource, /pathname === "\/api\/echo\/preview-recordings" && req\.method === "GET"/);
  assert.match(apiSource, /pathname === "\/api\/echo\/preview-recordings" && req\.method === "POST"/);
  assert.ok(apiSource.includes("const previewRecordingItemMatch = pathname.match("), "item route matcher must exist");
  assert.ok(apiSource.includes("([A-Za-z0-9_-]{8,64})(\\/file)?"), "item route must accept the optional /file suffix");
  // Every route must be admin-gated before touching the store.
  const routeSection = apiSource.slice(apiSource.indexOf('"/api/echo/preview-recordings"'), apiSource.indexOf('"/api/echos/director-project" && req.method === "POST"'));
  const adminGates = (routeSection.match(/requireAdmin\(req, res\)/g) || []).length;
  assert.ok(adminGates >= 3, `expected at least 3 admin gates in the preview recording routes, found ${adminGates}`);
  assert.match(routeSection, /readRawBody\(req, PREVIEW_RECORDING_MAX_UPLOAD_BYTES\)/);
  assert.match(routeSection, /Content-Range/);
  assert.match(routeSection, /Accept-Ranges/);
  assert.match(routeSection, /Content-Disposition/);
});

test("cli exposes an echo-preview-recordings listing command", () => {
  assert.match(cliSource, /if \(cmd === "echo-preview-recordings"\)/);
  assert.match(cliSource, /\/api\/echo\/preview-recordings\$\{query\}/);
  assert.match(cliSource, /HAPA_AVATAR_ADMIN_TOKEN/);
  assert.match(cliSource, /echo-preview-recordings \[\--song <song-id>\]/);
});

test("director preview exposes the record button, the recordings tab, and the capture engine", () => {
  // Capture engine wired to the canonical inputs.
  assert.match(viewSource, /from "\.\.\/domain\/echo-preview-recording\.js";/);
  assert.match(viewSource, /createMediaStreamDestination\(\)/);
  assert.match(viewSource, /createEchoPreviewRecordingSession\(/);
  assert.match(viewSource, /drawEchoCameraFramedMediaInput\(\{[\s\S]*?canvas,[\s\S]*?mediaElement: element,/);
  assert.match(viewSource, /recorder\.ondataavailable/);
  assert.match(viewSource, /fetch\(`\$\{API_BASE\}\/api\/echo\/preview-recordings\?/);
  assert.match(viewSource, /MediaRecorder/);
  assert.match(viewSource, /canvas\.captureStream\(ECHO_PREVIEW_RECORD_FPS\)/);
  assert.match(viewSource, /videoBitsPerSecond: ECHO_PREVIEW_RECORD_VIDEO_BIT_RATE/);
  assert.match(viewSource, /audioBitsPerSecond: ECHO_PREVIEW_RECORD_AUDIO_BIT_RATE/);

  // Record button in the preview controls with an honest state machine.
  const controls = viewSource.slice(
    viewSource.indexOf('data-testid="echo-director-preview-controls"'),
    viewSource.indexOf('data-testid="echo-director-preview-expand"'),
  );
  assert.ok(controls.length > 0, "preview controls row must exist");
  assert.match(controls, /data-testid="echo-director-preview-record"/);
  assert.match(controls, /data-recording-state=\{previewRecordingState\}/);
  assert.match(controls, /"● Record \+ Play"/);
  assert.match(controls, /formatEchoPreviewRecordingElapsed\(previewRecordingElapsedMs\)/);
  assert.match(controls, /data-testid="echo-director-preview-record-quality"/);

  // The recordings shelf.
  assert.match(viewSource, /\['preview', 'lyrics', 'tracks', 'variation', 'live', 'palmier', 'script', 'edl', 'journal', 'recordings', 'living-light'\]/);
  assert.match(viewSource, /{tab === 'recordings' && '🎞 Recordings'}/);
  assert.match(viewSource, /data-testid="echo-preview-recordings-panel"/);
  assert.match(viewSource, /data-testid="echo-preview-recording-item"/);
  assert.match(viewSource, /data-testid="echo-preview-recording-download"/);
  assert.match(viewSource, /data-testid="echo-preview-recording-delete"/);
  assert.match(viewSource, /\/api\/echo\/preview-recordings\/\$\{encodeURIComponent\(recording\.id\)\}\/file\?download=1/);
});

test("Record owns a synchronized playback-and-capture start with a required live audio track", () => {
  const start = viewSource.slice(
    viewSource.indexOf("const startPreviewRecording = useCallback(async () => {"),
    viewSource.indexOf("// Load the recording shelf once on mount."),
  );
  assert.ok(start.length > 0, "async recording start path must exist");
  assert.match(start, /const audioTrack = await acquirePreviewRecordingAudioTrack\(\)/);
  assert.match(start, /new \(globalThis\.MediaStream\)\(\[\.\.\.videoTracks, audioTrack\]\)/);
  assert.match(start, /stream\.getAudioTracks\(\)\.length !== 1/);
  assert.doesNotMatch(start, /audioTrack \? \[audioTrack\] : \[\]/, "video-only fallback must not survive");
  const recorderStart = start.indexOf("session.start(ECHO_PREVIEW_RECORD_TIMESLICE_MS)");
  const playbackStart = start.indexOf("await audioElement.play()");
  assert.ok(recorderStart >= 0 && playbackStart > recorderStart, "the recorder must be live immediately before playback starts");
  assert.match(start, /setIsPlaying\(true\)/);
});

test("Record surfaces audio/video readiness and failures without rejecting intentional pauses", () => {
  const controls = viewSource.slice(
    viewSource.indexOf('data-testid="echo-director-preview-controls"'),
    viewSource.indexOf('data-testid="echo-director-preview-expand"'),
  );
  assert.match(controls, /disabled=\{previewRecordingStartBlocked\}/);
  assert.match(controls, /Buffering audio/);
  assert.match(controls, /Buffering video/);
  assert.match(controls, /Record \+ Play/);
  assert.match(controls, /data-testid="echo-director-preview-record-readiness"/);
  assert.match(controls, /role=\{previewRecordingAudioFailed \? "alert" : "status"\}/);
  assert.match(controls, /data-testid="echo-director-preview-record-error"/);
  assert.match(controls, /role="alert"/);
  assert.match(viewSource, /onLoadedData=\{\(\) => \{[\s\S]*?setAudioPlaybackReady\(true\);[\s\S]*?setAudioPlaybackError\(""\);/);
  assert.match(viewSource, /onWaiting=\{\(\) => setAudioPlaybackReady\(false\)\}/);
  assert.match(viewSource, /RECORDING · PLAYBACK PAUSED/);
  const recordingPath = viewSource.slice(
    viewSource.indexOf("const acquirePreviewRecordingAudioTrack = async () => {"),
    viewSource.indexOf("// Load the recording shelf once on mount."),
  );
  assert.doesNotMatch(recordingPath, /mean_volume|rms|silence threshold/i, "pauses and quiet passages must remain valid recording content");
});

test("terminal audio load failures never masquerade as indefinite buffering", () => {
  const preparation = viewSource.indexOf('prepareEchoAudioPlayback({');
  assert.ok(preparation >= 0, 'the editor must prepare its selected audio');
  const audioFetch = viewSource.slice(
    preparation,
    viewSource.indexOf('const retryPreviewAudio =', preparation),
  );
  assert.match(audioFetch, /setAudioPlaybackError\(`Playback audio could not be loaded \(\$\{err\.message \|\| "request failed"\}\)\. Click Retry audio\.`\)/);
  assert.match(audioFetch, /audioLoadRetryNonce/);

  const controls = viewSource.slice(
    viewSource.indexOf('data-testid="echo-director-preview-controls"'),
    viewSource.indexOf('data-testid="echo-director-preview-expand"'),
  );
  assert.match(viewSource, /const previewRecordingAudioBuffering = !previewRecordingAudioFailed && \(audioLoading \|\| !audioPlaybackReady\)/);
  assert.match(controls, /previewRecordingAudioFailed \? retryPreviewAudio/);
  assert.match(controls, /↻ Retry audio/);
  assert.match(controls, /data-testid="echo-director-preview-audio-error"/);
  assert.match(viewSource, /RECORD · AUDIO FAILED · RETRY REQUIRED/);
});

test("audio capture binds the current element and awaits a running AudioContext", () => {
  const acquire = viewSource.slice(
    viewSource.indexOf("const acquirePreviewRecordingAudioTrack = async () => {"),
    viewSource.indexOf("const compositePreviewRecordingFrame = () => {"),
  );
  assert.match(acquire, /connectedAudioRef\.current !== audioElement/);
  assert.match(acquire, /if \(context\.state !== "running"\) await context\.resume\(\)/);
  assert.match(acquire, /if \(context\.state !== "running"\)/);
  assert.match(acquire, /throw new Error\("The playback audio route did not produce a live recording track\."\)/);
});

test("capture composites picture, shader, and only the visible Preview lyrics", () => {
  const composite = viewSource.slice(
    viewSource.indexOf("const compositePreviewRecordingFrame = () => {"),
    viewSource.indexOf("const startPreviewRecordingComposite = () => {"),
  );
  assert.ok(composite.length > 0, "composite function must exist");
  assert.match(composite, /drawEchoCameraFramedMediaInput/);
  assert.match(composite, /drawImage\(shaderCanvas, 0, 0, width, height\)/);
  assert.match(composite, /echoLyricPresentationRef\.current\?\.\(t\)/);
  assert.match(composite, /paintEchoLyricSurfaceToCanvas\(context, echoLyricCaptureSurfaceRef\.current, \{ width, height \}\)/);
  assert.doesNotMatch(composite, /data-echo-preview-hud/, "the telemetry HUD remains excluded");
});

test("recording lyric painter follows the Preview surface visibility and authored styling", () => {
  const calls = [];
  const context = {
    canvas: { width: 1920, height: 1080 },
    save() { calls.push("save"); }, restore() { calls.push("restore"); }, scale(x, y) { calls.push(["scale", x, y]); },
    beginPath() {}, roundRect() { calls.push("panel"); }, rect() {}, fill() {}, stroke() {},
    fillRect(x, y, width, height) { calls.push(["fillRect", x, y, width, height]); },
    translate(x, y) { calls.push(["translate", x, y]); }, rotate(value) { calls.push(["rotate", value]); },
    fillText(value) { calls.push(["text", value]); },
  };
  const state = {
    frame: { visible: true }, line: { id: "line-1" }, contract: { enabled: true, templateId: "center-word-focus-v1", style: "neon-cyan" },
    presentation: { width: 1920, height: 1080, text: "#ffffff", accent: "#22d3ee", background: "transparent", fontFamily: "Impact", fontWeight: 800, fixedCenter: true, paddingX: 0, paddingY: 0, borderWidth: 0, borderRadius: 0, panel: { width: "1612px" } },
    layout: { boxes: [{ x: 0, y: 0, width: 420, height: 120 }], width: 420, height: 120, panelHeight: 120, fontSize: 112, wordsOffsetX: 0, wordsOffsetY: 0 },
    placement: { x: 750, y: 480, width: 420, height: 120 },
    rows: [{ index: 0, displayText: "Gnow", active: true, opacity: 1, scale: 1, translateX: 0, translateY: 0, rotateDegrees: 0 }],
    nodes: [{ textContent: "Gnow" }], label: { textContent: "", style: { display: "none" } },
  };
  const element = { style: { visibility: "visible" }, __echoLyricSurface: state };
  assert.deepEqual(paintEchoLyricSurfaceToCanvas(context, element, { width: 1920, height: 1080 }), { drawn: true, wordCount: 1, templateId: "center-word-focus-v1" });
  assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "text" && entry[1] === "Gnow"));
  calls.length = 0;
  state.contract.templateId = "letter-wave-v1";
  state.presentation.fixedCenter = false;
  state.presentation.canvasBackground = "#020617";
  state.presentation.borderWidth = 2;
  state.layout.glyphBoxes = [[
    { x: 0, y: 0, width: 45, height: 120 },
    { x: 45, y: 0, width: 45, height: 120 },
  ]];
  state.rows = [{
    index: 0, displayText: "Go", active: true, opacity: 1, scale: 1,
    characters: [
      { index: 0, text: "G", opacity: 1, scale: 1, translateY: -4 },
      { index: 1, text: "o", opacity: .7, scale: 1.05, translateY: 4 },
    ],
  }];
  assert.deepEqual(paintEchoLyricSurfaceToCanvas(context, element, { width: 1920, height: 1080 }), { drawn: true, wordCount: 1, templateId: "letter-wave-v1" });
  assert.deepEqual(calls.filter((entry) => Array.isArray(entry) && entry[0] === "text").map((entry) => entry[1]), ["G", "o"]);
  element.style.visibility = "hidden";
  assert.deepEqual(paintEchoLyricSurfaceToCanvas(context, element, { width: 1920, height: 1080 }), { drawn: false, reason: "lyrics-not-visible" });
});

test("capture survives Preview/Variations switching and stops on hidden, song change or unmount", () => {
  assert.match(viewSource, /if \(\(!\["preview", "variation"\]\.includes\(activeWorkbenchTab\) \|\| powerMode === "hidden"\) && previewRecordingActiveRef\.current\)/);
  assert.match(viewSource, /if \(previewRecordingActiveRef\.current\) stopPreviewRecording\(\);/);
  assert.match(viewSource, /if \(previewRecordingActiveRef\.current\) stopPreviewRecording\(\);\n      releasePreviewRecordingResources\(\);/);
});

test("upload failure falls back to a local download instead of dropping the capture", () => {
  const stop = viewSource.slice(viewSource.indexOf("const stopPreviewRecording = useCallback(async () => {"), viewSource.indexOf("const startPreviewRecording = useCallback(() => {"));
  assert.match(stop, /URL\.createObjectURL\(blob\)/);
  assert.match(stop, /anchor\.download = echoPreviewRecordingFileName\(\{/);
  assert.match(stop, /recordingNumber: Math\.max\(priorTakeNumbers\.length, \.\.\.priorTakeNumbers, 0\) \+ 1/);
  assert.match(stop, /post to\/upload|POST/i);
});

test("domain module allows long-form capture with no mint coupling", () => {
  assert.match(domainSource, /ECHO_PREVIEW_RECORDING_SCHEMA = "hapa\.echo\.preview-recording\.v1"/);
  assert.equal(ECHO_PREVIEW_RECORD_MAX_DURATION_MS, 60 * 60 * 1000);
  assert.match(domainSource, /ECHO_PREVIEW_RECORD_MAX_DURATION_MS = 60 \* 60 \* 1000/);
  assert.doesNotMatch(domainSource, /song-card|createSongCardMint|mintLedger/i);
});

test("session bootstrap posts the trusted-local-UI session with same-origin credentials", async () => {
  const calls = [];
  const fakeFetch = (input, init) => {
    calls.push({ input: String(input), init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: "hapa.avatar-builder.local-ui-session.v1", ok: true, authMode: "trusted-local-ui" }),
    });
  };
  const payload = await ensureEchoPreviewRecordingLocalSession("http://127.0.0.1:8797", fakeFetch);
  assert.equal(payload.ok, true);
  assert.equal(payload.authMode, "trusted-local-ui");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "http://127.0.0.1:8797/api/local-ui-session");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "same-origin");
});

test("session bootstrap dedupes concurrent callers but re-posts after settle", async () => {
  const calls = [];
  let resolveFirst;
  const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const fakeFetch = (input) => {
    calls.push(String(input));
    if (calls.length === 1) return firstResponse.then(() => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  };
  const first = ensureEchoPreviewRecordingLocalSession("", fakeFetch);
  const second = ensureEchoPreviewRecordingLocalSession("", fakeFetch);
  assert.equal(first, second, "concurrent bootstrap calls must share one in-flight request");
  assert.equal(calls.length, 1);
  resolveFirst();
  await first;
  await ensureEchoPreviewRecordingLocalSession("", fakeFetch);
  assert.equal(calls.length, 2, "a fresh post must run after the previous one settles (token rotates on service restart)");
  assert.equal(calls[0], "/api/local-ui-session");
});

test("session bootstrap surfaces server failures for the caller to act on", async () => {
  const fakeFetch = () => Promise.resolve({ ok: false, status: 503, json: async () => ({ error: "admin_auth_not_configured", failClosed: true }) });
  await assert.rejects(
    () => ensureEchoPreviewRecordingLocalSession("", fakeFetch),
    /admin_auth_not_configured/,
  );
});

test("recordings UI establishes the trusted local UI session before every admin call", () => {
  assert.match(viewSource, /ensureEchoPreviewRecordingLocalSession,/, "view must import the bootstrap");
  // List, delete, and upload each bootstrap before their admin-gated route.
  const refresh = viewSource.slice(
    viewSource.indexOf("const refreshPreviewRecordings = useCallback(async () => {"),
    viewSource.indexOf("const deletePreviewRecording = useCallback("),
  );
  assert.match(refresh, /await ensureEchoPreviewRecordingLocalSession\(API_BASE\)\.catch\(\(\) => \{\}\);/);
  const del = viewSource.slice(
    viewSource.indexOf("const deletePreviewRecording = useCallback("),
    viewSource.indexOf("const stopPreviewRecording = useCallback(async () => {"),
  );
  assert.match(del, /await ensureEchoPreviewRecordingLocalSession\(API_BASE\)\.catch\(\(\) => \{\}\);/);
  const stop = viewSource.slice(
    viewSource.indexOf("const stopPreviewRecording = useCallback(async () => {"),
    viewSource.indexOf("const startPreviewRecording = useCallback(() => {"),
  );
  assert.match(stop, /await ensureEchoPreviewRecordingLocalSession\(API_BASE\)\.catch\(\(\) => \{\}\);/);
  // And the domain bootstrap must target the local-ui-session endpoint.
  assert.match(domainSource, /\/api\/local-ui-session/);
});

test("recorded signal replay preserves typed spectra, bus aliases, silence, reverse seeks and source identity", async () => {
  const { createEchoPreviewSignalCapture, createEchoPreviewSignalReplay } = await import("../src/domain/echo-preview-recording.js");
  const identity = { songId: "song-a", cutId: "cut-a", audioUri: "/audio/a", graphSha256: "sha256:" + "a".repeat(64), audioSha256: "sha256:" + "b".repeat(64) };
  let now = 0;
  const capture = createEchoPreviewSignalCapture({ identity, clock: () => now });
  const master = { status: "live", rms: 0, fft: new Uint8Array([0, 255]), wave: new Uint8Array([128, 128]) };
  const vocal = { status: "live", rms: .7, fft: new Uint8Array([42, 7]), wave: new Uint8Array([4, 127]) };
  capture.append({ songTime: 10, signalFrames: { master, vocals: vocal, Vocals: vocal } });
  vocal.fft[0] = 99; now = 40;
  capture.append({ songTime: 10.04, signalFrames: { master, vocals: vocal, Vocals: vocal } });
  const saved = JSON.parse(JSON.stringify(capture.finish()));
  assert.equal(saved.status, "complete"); assert.equal(saved.frames[0].buses.length, 2);
  const replay = createEchoPreviewSignalReplay(saved, identity);
  assert.equal(replay.at(10.04).vocals.fft[0], 99);
  assert.equal(replay.at(10.02).vocals.fft[0], 42);
  assert.equal(replay.at(10).master.rms, 0);
  assert.ok(replay.at(10).master.fft instanceof Uint8Array);
  assert.equal(replay.at(10).vocals, replay.at(10).Vocals);
  assert.equal(replay.at(9), null); assert.equal(replay.at(11), null);
  assert.throws(() => createEchoPreviewSignalReplay(saved, { ...identity, audioSha256: "sha256:" + "c".repeat(64) }), /source mismatch/);
  assert.throws(() => createEchoPreviewSignalReplay(saved, { ...identity, cutId: "cut-b" }), /source mismatch/);
});

test("capture budgets and transport changes cannot become complete replay claims", async () => {
  const { createEchoPreviewSignalCapture, createEchoPreviewSignalReplay, validateEchoPreviewSignals } = await import("../src/domain/echo-preview-recording.js");
  const identity = { songId: "s", cutId: "c", audioUri: "/a", graphSha256: "sha256:" + "a".repeat(64), audioSha256: "sha256:" + "b".repeat(64) };
  for (const kind of ["budget", "seek", "pause", "source"]) {
    let now = 0; const capture = createEchoPreviewSignalCapture({ identity, clock: () => now, maxFrames: kind === "budget" ? 1 : 100 });
    capture.append({ songTime: 2, signalFrames: { master: { rms: 0 } } }); now = kind === "pause" ? 300 : 40;
    capture.append({ songTime: kind === "seek" ? 1 : kind === "pause" ? 2 : 2.04, signalFrames: { master: { rms: 0 } }, identity: kind === "source" ? { ...identity, cutId: "changed" } : identity });
    const value = capture.finish(); assert.equal(value.status, "incomplete"); assert.ok(value.reason);
    validateEchoPreviewSignals(value);
    assert.throws(() => createEchoPreviewSignalReplay(value, identity), /incomplete/);
  }
});

test("recording companions persist, verify identity and bytes, resist replacement, and share deletion/retention", async () => {
  const { createEchoPreviewSignalCapture } = await import("../src/domain/echo-preview-recording.js");
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "echo-signal-store-"));
  const identity = { songId: "s", cutId: "c", audioUri: "/a", graphSha256: "sha256:" + "a".repeat(64), audioSha256: "sha256:" + "b".repeat(64) };
  let tick = 0; const capture = createEchoPreviewSignalCapture({ identity, clock: () => tick });
  capture.append({ songTime: 1, signalFrames: { master: { rms: 0 } } }); tick = 40;
  capture.append({ songTime: 1.04, signalFrames: { master: { rms: .7 } } }); const value = capture.finish();
  try {
    let date = 0; const store = createPreviewRecordingStore({ mediaRoot: root, maxRecordings: 1, now: () => new Date(date++) });
    const record = await store.add({ buffer: Buffer.from("video"), metadata: { id: "signal-test-01", songId: "s", captureIdentity: identity } });
    assert.equal(record.signals, null);
    await assert.rejects(store.putSignals(record.id, { ...value, identity: { ...identity, cutId: "wrong" } }), /source mismatch/);
    const attached = await store.putSignals(record.id, value);
    assert.equal(attached.signals.frameCount, 2); assert.equal(attached.signals.status, "complete");
    assert.deepEqual(await store.getSignals(record.id), value);
    assert.equal((await store.putSignals(record.id, value)).signals.sha256, attached.signals.sha256);
    const edited = structuredClone(value); edited.frames[1].buses[0].rms = .9;
    await assert.rejects(store.putSignals(record.id, edited), /cannot be replaced/);
    await fsp.appendFile(path.join(root, record.id + ".signals.json"), " ");
    await assert.rejects(store.getSignals(record.id), /changed on disk/);
    await store.add({ buffer: Buffer.from("new video"), metadata: { id: "signal-test-02" } });
    assert.equal(fs.existsSync(path.join(root, record.id + ".signals.json")), false);
    await store.remove("signal-test-02"); assert.equal((await store.list()).length, 0);
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});

test("recordings CLI retrieves the requested signal companion through the existing authenticated API path", async () => {
  const { createServer } = await import("node:http");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const requests = [];
  const server = createServer((req, res) => { requests.push({ url: req.url, authorization: req.headers.authorization }); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ schemaVersion: "hapa.echo.preview-signals.v1", marker: "stored-companion" })); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ["cli/avatar-builder.mjs", "echo-preview-recordings", "--signals", "capture-123", "--api-url", `http://127.0.0.1:${server.address().port}`], { cwd: path.resolve(import.meta.dirname, ".."), timeout: 10000, env: { ...process.env, HAPA_AVATAR_ADMIN_TOKEN: "test-capture-token" } });
    assert.equal(JSON.parse(stdout).marker, "stored-companion");
    assert.deepEqual(requests, [{ url: "/api/echo/preview-recordings/capture-123/signals", authorization: "Bearer test-capture-token" }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
