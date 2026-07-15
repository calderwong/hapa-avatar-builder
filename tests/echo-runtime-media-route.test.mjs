import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { echoProjectAudioRoute } from "../src/domain/echo-audio-route.js";
import { resolveEchoRuntimeMediaUri } from "../server/echo-runtime-media-route.mjs";
import {
  verifyEchoExecutionInputEvidence,
  verifyEchoExecutionVisualInputEvidence,
} from "../server/echo-director-show-graph-loader.mjs";

function statKey(filePath, prefix) {
  const resolvedPath = path.resolve(filePath);
  const stat = fs.statSync(resolvedPath);
  return [prefix, resolvedPath, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join("\u0000");
}

function audioEvidence(filePath, uri, route = "song-registry-api") {
  return {
    kind: "master",
    inputClass: "master-audio",
    id: "master",
    role: "master",
    path: path.resolve(filePath),
    contentSha256: `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`,
    statIdentityKey: statKey(filePath, "hapa.render-audio-input-cache.v5"),
    routeBindings: [{ uri, route, source: "fixture" }],
  };
}

function visualEvidence(filePath, uri) {
  return {
    kind: "video",
    inputClass: "visual-media",
    path: path.resolve(filePath),
    signatureKey: `fixture:${filePath}`,
    statIdentityKey: statKey(filePath, "hapa.echo.visual-media-input.v1"),
    routeBindings: [{ uri, source: "fixture" }],
  };
}

test("runtime resolver rejects protocol-relative and every nonlocal scheme", () => {
  const context = { root: "/tmp", mediaDir: "/tmp/media" };
  for (const uri of ["//evil.example/media/x.mp4", "ftp://evil.example/media/x.mp4", "ws://evil.example/media/x.mp4"]) {
    const result = resolveEchoRuntimeMediaUri(uri, context);
    assert.equal(result.ok, false, uri);
  }
});

test("visual and master evidence fail closed when runtime roots or registry/songbook mappings drift", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-route-binding-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mediaA = path.join(root, "media-a");
  const mediaB = path.join(root, "media-b");
  fs.mkdirSync(mediaA);
  fs.mkdirSync(mediaB);
  fs.writeFileSync(path.join(mediaA, "clip.mp4"), "visual-a");
  fs.writeFileSync(path.join(mediaB, "clip.mp4"), "visual-b");
  const visual = visualEvidence(path.join(mediaA, "clip.mp4"), "/media/clip.mp4");
  const visualReady = await verifyEchoExecutionVisualInputEvidence({ visualInputs: [visual], proxyInputs: [] }, {
    runtimeRouteContext: { root, mediaDir: mediaA },
  });
  assert.equal(visualReady.ok, true);
  const visualDrift = await verifyEchoExecutionVisualInputEvidence({ visualInputs: [visual], proxyInputs: [] }, {
    runtimeRouteContext: { root, mediaDir: mediaB },
  });
  assert.equal(visualDrift.ok, false);
  assert.equal(visualDrift.findings[0].code, "execution-visual-runtime-route-changed");

  const masterA = path.join(root, "master-a.mp3");
  const masterB = path.join(root, "master-b.mp3");
  fs.writeFileSync(masterA, "master-a");
  fs.writeFileSync(masterB, "master-b");
  const registryPath = path.join(root, "registry.json");
  const songbookPath = path.join(root, "songbook.json");
  fs.writeFileSync(registryPath, JSON.stringify({ songs: [
    { id: "track-a", localPath: masterA },
    { id: "track-b", localPath: masterB },
  ] }));
  fs.writeFileSync(songbookPath, JSON.stringify({ songCards: [{ id: "dear-papa-song-fixture", registryTrackId: "track-a" }] }));
  const context = { root, mediaDir: mediaA, songRegistryPath: registryPath, songbookPath };
  const master = audioEvidence(masterA, "/api/song-registry/audio/dear-papa-song-fixture");
  assert.equal((await verifyEchoExecutionInputEvidence([master], { runtimeRouteContext: context })).ok, true);
  fs.writeFileSync(songbookPath, JSON.stringify({ songCards: [{ id: "dear-papa-song-fixture", registryTrackId: "track-b" }] }));
  const songbookDrift = await verifyEchoExecutionInputEvidence([master], { runtimeRouteContext: context });
  assert.equal(songbookDrift.ok, false);
  assert.equal(songbookDrift.findings[0].code, "execution-audio-runtime-route-changed");

  const unsafe = audioEvidence(masterA, pathToFileURL(masterA).href);
  const routeClassDrift = await verifyEchoExecutionInputEvidence([unsafe], { runtimeRouteContext: context });
  assert.equal(routeClassDrift.ok, false);
  assert.equal(routeClassDrift.findings[0].code, "execution-audio-runtime-route-class-changed");
});

test("shared Preview selector does not fall through after choosing an audio id and prefers hydrated graph truth", () => {
  const project = { song_id: "dear-song", audio_id: "stale-audio", registry_track_id: "valid-track" };
  assert.deepEqual(echoProjectAudioRoute(project), {
    id: "stale-audio",
    uri: "/api/song-registry/audio/stale-audio",
    source: "audio_id",
  });
  assert.deepEqual(echoProjectAudioRoute(project, {
    song: { id: "valid-track", audioPath: "/api/song-registry/audio/valid-track" },
  }), {
    id: "valid-track",
    uri: "/api/song-registry/audio/valid-track",
    source: "show-graph.song.audioPath",
  });
});
