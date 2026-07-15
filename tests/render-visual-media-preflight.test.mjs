import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import {
  probeVisualMediaFile,
  clearRenderVisualMediaProbeCache,
  loadRenderVisualMediaProbeCache,
  preflightProxyAtlasImages,
  preflightResolvedVisualMedia,
  writeRenderVisualMediaProbeCache,
} from "../server/render-visual-media-preflight.mjs";

const execFile = promisify(execFileCallback);

function ffmpegAvailable() {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function generateMedia(outputPath, input, outputArgs = []) {
  return spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error",
    "-f", "lavfi", "-i", input,
    ...outputArgs,
    "-threads", "1", outputPath,
  ], { encoding: "utf8" });
}

test("a hashable plain-text file with a PNG extension cannot pass atlas decode", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-corrupt-atlas-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const atlasPath = path.join(root, "corrupt.png");
  fs.writeFileSync(atlasPath, "deterministic-but-not-an-image");
  const result = await probeVisualMediaFile(atlasPath, { kind: "proxy" });
  assert.equal(result.ok, false);
  assert.ok(["visual-media-probe-failed", "visual-media-metadata-invalid", "visual-media-sample-decode-failed"].includes(result.code));
});

test("a fully transparent atlas cannot pass by hiding non-flat RGB pixels", async (t) => {
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-transparent-atlas-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const atlasPath = path.join(root, "transparent.png");
  const generated = spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi",
    "-i", "testsrc2=size=16x16:rate=1",
    "-vf", "format=rgba,colorchannelmixer=aa=0",
    "-frames:v", "1", "-threads", "1", atlasPath,
  ], { encoding: "utf8" });
  if (generated.error?.code === "ENOENT") return t.skip("ffmpeg is not installed");
  assert.equal(generated.status, 0, generated.stderr);
  const result = await probeVisualMediaFile(atlasPath, { kind: "proxy" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "proxy-atlas-transparent");
  assert.equal(result.pixels.visibleAlpha, false);
});

test("failed or transient probe results are never cached or persisted", async (t) => {
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-visual-probe-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const atlasPath = path.join(root, "corrupt.png");
  const cachePath = path.join(root, "probe-cache.json");
  fs.writeFileSync(atlasPath, "still-not-an-image");
  const first = await probeVisualMediaFile(atlasPath, { kind: "proxy" });
  assert.equal(first.ok, false);
  const written = await writeRenderVisualMediaProbeCache(cachePath);
  assert.equal(written.written, 0);
  clearRenderVisualMediaProbeCache();
  const loaded = loadRenderVisualMediaProbeCache(cachePath);
  assert.equal(loaded.loaded, 0);

  fs.writeFileSync(cachePath, `${JSON.stringify({
    schemaVersion: "hapa.render-visual-media-probe-cache.v4",
    entries: [{
      key: "proxy:/tmp/transient.png:1:1:{}",
      result: {
        ok: false,
        evidence: {
          schemaVersion: "hapa.render-visual-media-probe-evidence.v4",
          deterministic: true,
          fullDecode: true,
          alphaAwareComposite: true,
          signatureKey: "proxy:/tmp/transient.png:1:1:{}",
        },
      },
    }],
  })}\n`);
  assert.equal(loadRenderVisualMediaProbeCache(cachePath).loaded, 0);
});

test("a transient decoder failure is retried for the identical file signature", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-transient-visual-probe-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "visible.png");
  const generated = generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(generated.status, 0, generated.stderr);

  let transientCalls = 0;
  const transient = await probeVisualMediaFile(imagePath, {
    kind: "image",
    runCommand: async () => {
      transientCalls += 1;
      const error = new Error("temporary decoder exhaustion");
      error.stderr = "temporary decoder exhaustion";
      throw error;
    },
  });
  assert.equal(transient.ok, false);
  assert.equal(transientCalls, 1);

  const retried = await probeVisualMediaFile(imagePath, { kind: "image" });
  assert.equal(retried.ok, true);
  assert.equal(retried.evidence.deterministic, true);
});

test("AbortSignal reaches every decoder command and progress uses a bounded stage sequence", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-visual-probe-signal-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "visible.png");
  const generated = generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(generated.status, 0, generated.stderr);

  const controller = new AbortController();
  const commandSignals = [];
  const progress = [];
  const result = await probeVisualMediaFile(imagePath, {
    kind: "image",
    signal: controller.signal,
    onProgress: (event) => progress.push(event),
    runCommand: async (command, args, timeout = 30_000, options = {}) => {
      commandSignals.push(options.signal);
      return execFile(command, args, {
        encoding: "utf8",
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        signal: options.signal,
      });
    },
  });
  assert.equal(result.ok, true);
  assert.ok(commandSignals.length >= 2);
  assert.ok(commandSignals.every((signal) => signal === controller.signal));
  assert.deepEqual(progress.map((event) => event.stage), ["start", "metadata", "pixel-samples", "complete"]);
  assert.ok(progress.every((event) => event.stageIndex >= 0 && event.stageIndex < event.stageCount));
  assert.ok(progress.every((event) => event.stageCount === 5));
  assert.equal(new Set(progress.map((event) => event.stage)).size, progress.length);
});

test("one canceled custom probe cannot cancel or replace another caller's in-flight probe", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-isolated-visual-cancel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "visible.png");
  const generated = generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(generated.status, 0, generated.stderr);

  const controller = new AbortController();
  let markFirstStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const canceled = probeVisualMediaFile(imagePath, {
    kind: "image",
    signal: controller.signal,
    runCommand: async (_command, _args, _timeout, { signal } = {}) => new Promise((_resolve, reject) => {
      markFirstStarted();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  await firstStarted;

  const independent = probeVisualMediaFile(imagePath, {
    kind: "image",
    runCommand: (command, args, timeout = 30_000, options = {}) => execFile(command, args, {
      encoding: "utf8",
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
  });
  controller.abort();

  await assert.rejects(canceled, { name: "AbortError" });
  assert.equal((await independent).ok, true);
});

test("preflight helpers pass cancellation and indexed progress through to every unique probe", async () => {
  const controller = new AbortController();
  const mediaCalls = [];
  const atlasCalls = [];
  const onProgress = () => {};
  await preflightResolvedVisualMedia({
    entries: [{ resolvedPath: "/tmp/a.mp4" }, { resolvedPath: "/tmp/b.png" }],
  }, {
    signal: controller.signal,
    onProgress,
    probe: async (filePath, options) => {
      mediaCalls.push({ filePath, options });
      return { ok: true, path: filePath, kind: filePath.endsWith(".png") ? "image" : "video" };
    },
  });
  await preflightProxyAtlasImages({
    checks: { proxyAssets: { entries: [{ resolvedPath: "/tmp/atlas.png" }] } },
  }, {
    signal: controller.signal,
    onProgress,
    probe: async (filePath, options) => {
      atlasCalls.push({ filePath, options });
      return { ok: true, path: filePath, kind: "proxy", width: 8, height: 4 };
    },
  });
  assert.equal(mediaCalls.length, 2);
  assert.equal(atlasCalls.length, 1);
  assert.ok([...mediaCalls, ...atlasCalls].every(({ options }) => options.signal === controller.signal));
  assert.ok([...mediaCalls, ...atlasCalls].every(({ options }) => typeof options.onProgress === "function"));

  const forwarded = [];
  mediaCalls[1].options.onProgress({ stage: "metadata" });
  const replay = await preflightResolvedVisualMedia({ entries: [{ resolvedPath: "/tmp/c.mp4" }] }, {
    onProgress: (event) => forwarded.push(event),
    probe: async (_filePath, options) => {
      options.onProgress({ stage: "metadata" });
      return { ok: true };
    },
  });
  assert.equal(replay.ok, true);
  assert.deepEqual(forwarded, [{ stage: "metadata", inputIndex: 0, inputCount: 1 }]);
});

test("successful deterministic full-decode evidence persists by path, size, mtime, and contract", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-successful-visual-probe-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "visible.png");
  const cachePath = path.join(root, "probe-cache.json");
  const generated = generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(generated.status, 0, generated.stderr);

  const first = await probeVisualMediaFile(imagePath, { kind: "image" });
  assert.equal(first.ok, true);
  const written = await writeRenderVisualMediaProbeCache(cachePath);
  assert.equal(written.written, 1);
  const persisted = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.equal(persisted.entries.length, 1);
  assert.equal(persisted.entries[0].result.ok, true);
  assert.equal(persisted.entries[0].result.evidence.fullDecode, true);
  assert.equal(persisted.entries[0].result.evidence.decodeScope, "single-still-frame");
  assert.equal(persisted.entries[0].result.evidence.temporalValidation, false);
  assert.equal(persisted.entries[0].result.evidence.blackIntervalScan, false);
  assert.deepEqual(Object.keys(persisted.entries[0].result.evidence.fileIdentity).sort(), [
    "ctimeMs", "dev", "ino", "mtimeMs", "readable", "size",
  ]);

  clearRenderVisualMediaProbeCache();
  const loaded = loadRenderVisualMediaProbeCache(cachePath);
  assert.equal(loaded.loaded, 1);
  const cached = await probeVisualMediaFile(imagePath, {
    kind: "image",
    runCommand: async () => { throw new Error("the persisted success should be reused"); },
  });
  assert.deepEqual(cached, first);
});

test("persistent evidence cannot survive a same-size same-mtime inode replacement", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-replaced-visual-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "media.bmp");
  const replacementPath = path.join(root, "replacement.bmp");
  const cachePath = path.join(root, "probe-cache.json");
  const visible = generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]);
  const black = generateMedia(replacementPath, "color=c=black:size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(visible.status, 0, visible.stderr);
  assert.equal(black.status, 0, black.stderr);
  assert.equal(fs.statSync(imagePath).size, fs.statSync(replacementPath).size);

  const fixedTime = new Date("2026-01-02T03:04:05.000Z");
  fs.utimesSync(imagePath, fixedTime, fixedTime);
  fs.utimesSync(replacementPath, fixedTime, fixedTime);
  const verified = await probeVisualMediaFile(imagePath, { kind: "image" });
  assert.equal(verified.ok, true);
  assert.equal((await writeRenderVisualMediaProbeCache(cachePath)).written, 1);
  const before = fs.statSync(imagePath);

  fs.renameSync(replacementPath, imagePath);
  fs.utimesSync(imagePath, fixedTime, fixedTime);
  const after = fs.statSync(imagePath);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.notEqual(String(after.ino), String(before.ino));

  clearRenderVisualMediaProbeCache();
  assert.equal(loadRenderVisualMediaProbeCache(cachePath).loaded, 0);
  const reprobed = await probeVisualMediaFile(imagePath, { kind: "image" });
  assert.equal(reprobed.ok, false);
  assert.equal(reprobed.code, "visual-media-black");
});

test("a file replaced during decoding cannot produce stable reusable evidence", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-changing-visual-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "media.bmp");
  const replacementPath = path.join(root, "replacement.bmp");
  assert.equal(generateMedia(imagePath, "testsrc2=size=32x32:rate=1", ["-frames:v", "1"]).status, 0);
  assert.equal(generateMedia(replacementPath, "testsrc=size=32x32:rate=1", ["-frames:v", "1"]).status, 0);
  assert.equal(fs.statSync(imagePath).size, fs.statSync(replacementPath).size);

  let replaced = false;
  const runCommand = async (command, args, timeout = 30_000) => {
    const result = await execFile(command, args, { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
    if (!replaced && command === "ffprobe") {
      fs.renameSync(replacementPath, imagePath);
      replaced = true;
    }
    return result;
  };
  const result = await probeVisualMediaFile(imagePath, { kind: "image", runCommand });
  assert.equal(replaced, true);
  assert.equal(result.ok, false);
  assert.equal(result.code, "visual-media-file-changed-during-probe");
  assert.notEqual(result.initialIdentity.ino, result.currentIdentity.ino);
});

test("proxy atlas preflight deduplicates files and rejects decoded dimension drift", async () => {
  const readiness = {
    checks: {
      proxyAssets: {
        entries: [
          { resolvedPath: "/tmp/atlas-a.png", expectedWidth: 8, expectedHeight: 4 },
          { resolvedPath: "/tmp/atlas-a.png", expectedWidth: 8, expectedHeight: 4 },
          { resolvedPath: "/tmp/atlas-b.png", expectedWidth: 16, expectedHeight: 9 },
        ],
      },
    },
  };
  const calls = [];
  const report = await preflightProxyAtlasImages(readiness, {
    probe: async (filePath, options) => {
      calls.push({ filePath, options });
      return { ok: true, code: "proxy-atlas-decoded", path: filePath, kind: "proxy", width: 8, height: 4 };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(report.ok, false);
  assert.equal(report.uniqueInputCount, 2);
  assert.equal(report.blockedInputCount, 1);
  assert.equal(report.failures[0].code, "proxy-atlas-dimensions-mismatch");
});

test("visual media decode preflight probes each resolved file once and propagates failures", async () => {
  const calls = [];
  const report = await preflightResolvedVisualMedia({
    entries: [
      { resolvedPath: "/tmp/a.mp4" },
      { resolvedPath: "/tmp/a.mp4" },
      { resolvedPath: "/tmp/b.png" },
      { resolvedPath: null },
    ],
  }, {
    probe: async (filePath) => {
      calls.push(filePath);
      return filePath.endsWith(".png")
        ? { ok: false, code: "visual-media-sample-decode-failed", path: filePath, kind: "image", message: "corrupt" }
        : { ok: true, code: "video-samples-decoded", path: filePath, kind: "video", width: 1920, height: 1080, durationSeconds: 4 };
    },
  });
  assert.deepEqual(calls.sort(), ["/tmp/a.mp4", "/tmp/b.png"]);
  assert.equal(report.ok, false);
  assert.equal(report.verifiedInputCount, 1);
  assert.equal(report.failures[0].code, "visual-media-sample-decode-failed");
});

test("ordinary black and transparent images fail closed unless every usage explicitly allows blank media", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-blank-image-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blackPath = path.join(root, "black.png");
  const transparentPath = path.join(root, "transparent.png");
  const black = generateMedia(blackPath, "color=c=black:size=32x32:rate=1", ["-frames:v", "1"]);
  assert.equal(black.status, 0, black.stderr);
  const transparent = generateMedia(transparentPath, "testsrc2=size=32x32:rate=1", [
    "-vf", "format=rgba,colorchannelmixer=aa=0", "-frames:v", "1",
  ]);
  assert.equal(transparent.status, 0, transparent.stderr);

  const blackResult = await probeVisualMediaFile(blackPath, { kind: "image" });
  const transparentResult = await probeVisualMediaFile(transparentPath, { kind: "image" });
  assert.equal(blackResult.ok, false);
  assert.equal(blackResult.code, "visual-media-black");
  assert.equal(transparentResult.ok, false);
  assert.equal(transparentResult.code, "visual-media-transparent");

  const allowed = await preflightResolvedVisualMedia({
    entries: [
      { resolvedPath: transparentPath, allowBlank: true },
      { resolvedPath: transparentPath, visualContract: { allowBlank: true } },
    ],
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.entries[0].blankAllowed, true);

  const mixedContract = await preflightResolvedVisualMedia({
    entries: [
      { resolvedPath: transparentPath, allowBlank: true },
      { resolvedPath: transparentPath },
    ],
  });
  assert.equal(mixedContract.ok, false);
  assert.equal(mixedContract.failures[0].code, "visual-media-transparent");
});

test("an animated GIF with a visible first frame and black later frames cannot inherit a still-image certificate", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-animated-image-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const animatedPath = path.join(root, "visible-then-black.gif");
  const generated = generateMedia(
    animatedPath,
    "color=c=black:size=64x64:rate=2:duration=4,drawbox=x=8:y=8:w=32:h=32:color=white:t=fill:enable='lt(t,1)'",
    ["-loop", "0"],
  );
  assert.equal(generated.status, 0, generated.stderr);

  const auto = await probeVisualMediaFile(animatedPath);
  assert.equal(auto.ok, false);
  assert.equal(auto.kind, "image");
  assert.equal(auto.code, "visual-media-animated-image-requires-video-contract");
  assert.ok(auto.observedFrameCount > 1);

  const proxy = await probeVisualMediaFile(animatedPath, { kind: "proxy" });
  assert.equal(proxy.ok, false);
  assert.equal(proxy.code, "visual-media-animated-image-requires-video-contract");

  const temporal = await probeVisualMediaFile(animatedPath, { kind: "video" });
  assert.equal(temporal.ok, false);
  assert.equal(temporal.code, "visual-media-prolonged-black-interval");
  assert.ok(temporal.excessiveBlackSpans.some((span) => span.durationSeconds >= 2));
});

test("animated WebP and AVIF metadata fail closed even when the first-frame decoder would look healthy", async (t) => {
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-animated-modern-image-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const fixture of [
    { extension: "webp", codec: "webp", declaredFrames: null, countedFrames: 12 },
    { extension: "avif", codec: "av1", declaredFrames: 9, countedFrames: null },
  ]) {
    const imagePath = path.join(root, `animated.${fixture.extension}`);
    fs.writeFileSync(imagePath, "stable-placeholder");
    const result = await probeVisualMediaFile(imagePath, {
      kind: "image",
      runCommand: async (command, args) => {
        assert.equal(command, "ffprobe");
        if (args.includes("-count_frames")) {
          return { stdout: JSON.stringify({ streams: [{ nb_read_frames: String(fixture.countedFrames) }] }), stderr: "" };
        }
        return {
          stdout: JSON.stringify({
            streams: [{
              codec_name: fixture.codec,
              pix_fmt: "yuv420p",
              width: 64,
              height: 64,
              duration: "6.0",
              nb_frames: fixture.declaredFrames === null ? "N/A" : String(fixture.declaredFrames),
              avg_frame_rate: "2/1",
            }],
            format: { duration: "6.0" },
          }),
          stderr: "",
        };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "visual-media-animated-image-requires-video-contract");
    assert.ok(result.observedFrameCount > 1);
  }
});

test("cancellation during animation frame counting is propagated instead of becoming reusable failure evidence", async (t) => {
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-animated-image-cancel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "animated.webp");
  fs.writeFileSync(imagePath, "stable-placeholder");
  const controller = new AbortController();
  const observedSignals = [];

  const pending = probeVisualMediaFile(imagePath, {
    kind: "image",
    signal: controller.signal,
    runCommand: async (command, args, _timeout, options = {}) => {
      assert.equal(command, "ffprobe");
      observedSignals.push(options.signal);
      if (args.includes("-count_frames")) {
        controller.abort();
        options.signal.throwIfAborted();
      }
      return {
        stdout: JSON.stringify({
          streams: [{ codec_name: "webp", pix_fmt: "yuv420p", width: 64, height: 64, duration: "4", avg_frame_rate: "2/1" }],
          format: { duration: "4" },
        }),
        stderr: "",
      };
    },
  });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(observedSignals.length, 2);
  assert.ok(observedSignals.every((signal) => signal === controller.signal));
});

test("a single-frame GIF remains a still image with non-temporal evidence", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-single-frame-gif-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const imagePath = path.join(root, "single.gif");
  const generated = generateMedia(imagePath, "testsrc2=size=64x64:rate=1", ["-frames:v", "1"]);
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeVisualMediaFile(imagePath, { kind: "image" });
  assert.equal(result.ok, true);
  assert.equal(result.observedFrameCount, 1);
  assert.equal(result.evidence.decodeScope, "single-still-frame");
  assert.equal(result.evidence.temporalValidation, false);
  assert.equal(result.evidence.blackIntervalScan, false);
});

test("every declared video sampling policy gets alpha-aware non-flat evidence after a full decode", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-video-sampling-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "visible.avi");
  const generated = generateMedia(videoPath, "testsrc2=size=64x64:rate=12:duration=1", ["-c:v", "mpeg4", "-q:v", "3", "-an"]);
  assert.equal(generated.status, 0, generated.stderr);

  const result = await preflightResolvedVisualMedia({
    entries: [
      { resolvedPath: videoPath, samplingPolicy: "boundary-midpoint-v1" },
      { resolvedPath: videoPath, samplingPolicy: "interior-three-v1" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.uniqueInputCount, 1);
  assert.equal(result.entries[0].decodeScope, "full-file");
  assert.equal(result.entries[0].evidence.decodeScope, "full-timeline");
  assert.equal(result.entries[0].evidence.temporalValidation, true);
  assert.equal(result.entries[0].evidence.blackIntervalScan, true);
  assert.deepEqual(result.entries[0].samplingPolicies.map((policy) => policy.policyId), [
    "boundary-midpoint-v1",
    "interior-three-v1",
  ]);
  assert.ok(result.entries[0].samplingPolicies.every((policy) => policy.visibleSampleCount > 0));
});

test("a brief authored black opening fade is accepted only with full-file proof and visible later samples", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-brief-opening-fade-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "brief-opening-fade.avi");
  const generated = generateMedia(
    videoPath,
    "testsrc2=size=64x64:rate=30:duration=2,fade=t=in:st=0:d=0.2",
    ["-c:v", "mpeg4", "-q:v", "3", "-an"],
  );
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(result.ok, true);
  assert.equal(result.code, "video-samples-decoded");
  assert.equal(result.samplingPolicies[0].blankSampleCount, 1);
  assert.equal(result.samplingPolicies[0].openingFadeAccepted, true);
  assert.equal(result.openingFade.status, "accepted");
  assert.equal(result.openingFade.policyId, "verified-brief-black-opening-v1");
  assert.ok(result.openingFade.observed.durationSeconds > 0);
  assert.ok(result.openingFade.observed.durationSeconds <= result.openingFade.maxDurationSeconds);
  assert.deepEqual(result.openingFade.laterVisibleSampleTimes, result.samplingPolicies[0].sampleTimes.slice(1));
  assert.deepEqual(result.evidence.visibilityTolerance.openingFade, result.openingFade);
  assert.equal(result.blankAllowed, false, "the measured fade receipt is distinct from an explicit allow-blank contract");
});

test("an opening black interval beyond the fade allowance still fails even when midpoint and end are visible", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-long-opening-black-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "long-opening-black.avi");
  const generated = generateMedia(
    videoPath,
    "testsrc2=size=64x64:rate=30:duration=2,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='lt(t,0.7)'",
    ["-c:v", "mpeg4", "-q:v", "3", "-an"],
  );
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "visual-media-blank-sample");
  assert.equal(result.samplingPolicies[0].visibleSampleCount, 2);
  assert.equal(result.samplingPolicies[0].blankSampleCount, 1);
  assert.equal(result.samplingPolicies[0].openingFadeAccepted, false);
  assert.equal(result.samplingPolicies[0].openingFade, null);
});

test("a black interval between otherwise visible sparse samples is caught by the full timeline scan", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-interior-black-interval-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "visible-around-black.avi");
  const generated = generateMedia(
    videoPath,
    "testsrc2=size=64x64:rate=12:duration=10,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,1,3.5)'",
    ["-c:v", "mpeg4", "-q:v", "3", "-an"],
  );
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "visual-media-prolonged-black-interval");
  assert.equal(result.blackIntervalScan, undefined);
  assert.ok(result.excessiveBlackSpans.some((span) => span.startSeconds < 1.2 && span.durationSeconds >= 2));
});

test("a fully black video is rejected after complete decode while an explicit allowBlank contract is honored", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-black-video-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "black.avi");
  const generated = generateMedia(videoPath, "color=c=black:size=64x64:rate=12:duration=1", ["-c:v", "mpeg4", "-q:v", "3", "-an"]);
  assert.equal(generated.status, 0, generated.stderr);

  const blocked = await probeVisualMediaFile(videoPath, {
    kind: "video",
    samplingPolicies: ["boundary-midpoint-v1", "interior-three-v1"],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "visual-media-black");
  assert.equal(blocked.decodeScope, "full-file");
  assert.equal(blocked.samplingPolicies.length, 2);
  assert.ok(blocked.samplingPolicies.every((policy) => policy.visibleSampleCount === 0));

  const allowed = await probeVisualMediaFile(videoPath, { kind: "video", allowBlank: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.blankAllowed, true);
  assert.equal(allowed.evidence.allowBlankContract, true);
  assert.equal(allowed.evidence.fullDecode, true);
});

test("a mostly black video cannot pass from one isolated visible sample", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-mostly-black-video-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "mostly-black.avi");
  const generated = generateMedia(
    videoPath,
    "color=c=black:size=64x64:rate=12:duration=4,drawbox=x=8:y=8:w=24:h=24:color=white:t=fill:enable='between(t,1.5,2.5)'",
    ["-c:v", "mpeg4", "-q:v", "3", "-an"],
  );
  assert.equal(generated.status, 0, generated.stderr);

  const blocked = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "visual-media-blank-sample");
  assert.equal(blocked.samplingPolicies[0].visibleSampleCount, 1);
  assert.equal(blocked.samplingPolicies[0].blankSampleCount, 2);

  const allowed = await probeVisualMediaFile(videoPath, { kind: "video", allowBlank: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.blankAllowed, true);
  assert.equal(allowed.samplingPolicies[0].blankAllowed, true);
});

test("a fully transparent alpha video is rejected by composited samples", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-transparent-video-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "transparent.mov");
  const generated = generateMedia(videoPath, "testsrc2=size=64x64:rate=12:duration=1", [
    "-vf", "format=argb,colorchannelmixer=aa=0",
    "-c:v", "qtrle", "-pix_fmt", "argb", "-an",
  ]);
  if (generated.status !== 0 && /Unknown encoder|not found/iu.test(generated.stderr)) return t.skip("qtrle alpha video encoding is unavailable");
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "visual-media-transparent");
  assert.ok(result.samplingPolicies[0].samples.every((sample) => sample.visibleAlpha === false));
});

test("full-file xerror decoding catches corruption between otherwise valid sample points", async (t) => {
  if (!ffmpegAvailable()) return t.skip("ffmpeg is not installed");
  clearRenderVisualMediaProbeCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-interior-corrupt-video-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "interior-corrupt.avi");
  const generated = generateMedia(videoPath, "testsrc2=size=128x128:rate=30:duration=6", ["-c:v", "mpeg4", "-q:v", "2", "-an"]);
  assert.equal(generated.status, 0, generated.stderr);

  const bytes = fs.readFileSync(videoPath);
  const offset = Math.floor(bytes.length / 3);
  bytes.fill(0xff, offset, Math.floor(bytes.length * 2 / 3));
  fs.writeFileSync(videoPath, bytes);

  const result = await probeVisualMediaFile(videoPath, { kind: "video" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "visual-media-full-decode-failed");
  assert.equal(result.decodeScope, "full-file");
});
