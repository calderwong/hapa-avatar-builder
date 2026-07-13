import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { packageHyperFramesAudio } from "../scripts/lib/hyperframes-audio-package.mjs";
import { resolveSongCardMasterAudio } from "../server/song-card-local-renderer.mjs";

const run = promisify(execFile);
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

async function fixture(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-audio-source-truth-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const wavPath = path.join(root, "verified-master.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=0.2",
    "-c:a", "pcm_s16le", wavPath,
  ]);
  return { root, wavPath };
}

test("HyperFrames packages supported master audio under its truthful extension and MIME", { skip: !HAS_FFMPEG }, async (t) => {
  const { root, wavPath } = await fixture(t);
  const packaged = packageHyperFramesAudio({ sourcePath: wavPath, outputDirectory: path.join(root, "package", "assets", "audio") });
  assert.equal(packaged.uri, "assets/audio/full_mix.wav");
  assert.equal(packaged.mimeType, "audio/wav");
  assert.equal(packaged.operation, "copy");
  assert.equal(packaged.sha256, packaged.sourceSha256);
  assert.deepEqual(await fsp.readFile(packaged.destination), await fsp.readFile(wavPath));
});

test("HyperFrames deterministically transcodes an unsupported source suffix instead of mislabeling its bytes as MP3", { skip: !HAS_FFMPEG }, async (t) => {
  const { root, wavPath } = await fixture(t);
  const unknownPath = path.join(root, "verified-master.audio-source");
  await fsp.copyFile(wavPath, unknownPath);
  const first = packageHyperFramesAudio({ sourcePath: unknownPath, outputDirectory: path.join(root, "package-a", "assets", "audio") });
  const second = packageHyperFramesAudio({ sourcePath: unknownPath, outputDirectory: path.join(root, "package-b", "assets", "audio") });
  assert.equal(first.uri, "assets/audio/full_mix.wav");
  assert.equal(first.mimeType, "audio/wav");
  assert.equal(first.operation, "transcode-pcm-s16le-48khz-stereo");
  assert.equal(first.sha256, second.sha256);
  assert.notEqual(first.destination, second.destination);
});

test("Song Card source resolution ignores relative or missing editor paths and falls back to a verified registry master", { skip: !HAS_FFMPEG }, async (t) => {
  const { root, wavPath } = await fixture(t);
  let registryCalls = 0;
  const resolved = await resolveSongCardMasterAudio({
    songId: "song:source-truth",
    storedPlan: { input: { song: { audioPath: "relative/master.wav" }, project: { audioPath: path.join(root, "missing.wav") } } },
    resolveRegistryMaster: async () => {
      registryCalls += 1;
      return { masterPath: wavPath };
    },
  });
  assert.equal(resolved, wavPath);
  assert.equal(registryCalls, 1);

  registryCalls = 0;
  const direct = await resolveSongCardMasterAudio({
    songId: "song:source-truth",
    storedPlan: { input: { song: { audioPath: wavPath } } },
    resolveRegistryMaster: async () => {
      registryCalls += 1;
      return { masterPath: path.join(root, "wrong.wav") };
    },
  });
  assert.equal(direct, wavPath);
  assert.equal(registryCalls, 0);

  await assert.rejects(
    resolveSongCardMasterAudio({
      songId: "song:source-truth",
      storedPlan: { input: { song: { audioPath: "/api/song/audio" } } },
      resolveRegistryMaster: async () => "relative/registry-master.wav",
    }),
    (error) => error?.code === "local_master_audio_missing" && error?.statusCode === 409,
  );
});

test("compiler markup binds the packaged URI and MIME instead of hard-coding full_mix.mp3", () => {
  const compilerSource = spawnSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync('scripts/compile-hyperframes-show-v2.mjs','utf8'))"], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(compilerSource, /assets\/audio\/full_mix\.mp3/u);
  assert.match(compilerSource, /compiledAudio\.uri/u);
  assert.match(compilerSource, /compiledAudio\.mimeType/u);
});
