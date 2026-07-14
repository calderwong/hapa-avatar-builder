import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  formatEchoMediaPreflightFailure,
  preflightEchoAlbum,
  preflightEchoDirectionCut,
  preflightEchoProjectAndSavedCuts,
} from "../scripts/preflight-echo-director-media.mjs";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function mediaShot(index, uri, { mediaId = `media-${index}`, type = "video", originalUri = uri } = {}) {
  return {
    shot_index: index,
    start_sec: index,
    end_sec: index + 1,
    media_id: mediaId,
    media_title: `Cue ${index}`,
    media_uri: originalUri,
    runtime_media_uri: uri,
    media_contract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type,
      originalUri,
      runtimeUri: uri,
      contentHash: type === "generated-visualizer" ? null : `${index}`.repeat(64).slice(0, 64),
    },
  };
}

function generatedShot(index) {
  return mediaShot(index, "", {
    mediaId: "none",
    type: "generated-visualizer",
    originalUri: "",
  });
}

function project(timeline, songId = "song-preflight") {
  return {
    song_id: songId,
    song_title: "Preflight Song",
    duration: Math.max(1, timeline.length),
    timeline,
    visualizer_timeline: [],
    timed_lyrics: [],
    stems_available: [],
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-echo-preflight-"));
  fs.mkdirSync(path.join(root, "data/media"), { recursive: true });
  fs.mkdirSync(path.join(root, "data/music-video-project-variants"), { recursive: true });
  const appMedia = path.join(root, "data/media/app.mp4");
  const external = path.join(root, "external video.mp4");
  const fileUriMedia = path.join(root, "file-uri video.mp4");
  const absolute = path.join(root, "absolute.mp4");
  fs.writeFileSync(appMedia, "app-media");
  fs.writeFileSync(external, "external-media");
  fs.writeFileSync(fileUriMedia, "file-uri-media");
  fs.writeFileSync(absolute, "absolute-media");
  return { root, appMedia, external, fileUriMedia, absolute };
}

test("preflight resolves every supported local URI form and accepts intentional IVF blanks", () => {
  const fx = fixture();
  try {
    const payload = project([
      mediaShot(0, "/media/app.mp4"),
      mediaShot(1, `/api/local-file?path=${encodeURIComponent(fx.external)}`),
      mediaShot(2, pathToFileURL(fx.fileUriMedia).href),
      mediaShot(3, fx.absolute),
      generatedShot(4),
    ]);
    const report = preflightEchoDirectionCut({ project: payload, avatarRoot: fx.root });
    assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
    assert.equal(report.declaredCount, 5);
    assert.equal(report.resolvedCount, 4);
    assert.equal(report.generatedCount, 1);
    assert.equal(report.unresolvedCount, 0);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("album-style project preflight checks every saved cut and identifies the exact unresolved cue", () => {
  const fx = fixture();
  try {
    const songId = "song-with-cuts";
    const projectPath = path.join(fx.root, "data/music-video-projects/song.json");
    const variantsRoot = path.join(fx.root, "data/music-video-project-variants");
    const cutDirectory = path.join(variantsRoot, songId);
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.mkdirSync(cutDirectory, { recursive: true });
    const payload = project([mediaShot(0, "/media/app.mp4")], songId);
    fs.writeFileSync(projectPath, JSON.stringify({ music_video_project: payload }));
    fs.writeFileSync(path.join(cutDirectory, "good.json"), JSON.stringify({
      id: "good-cut",
      title: "Good cut",
      timeline: [generatedShot(0)],
    }));
    fs.writeFileSync(path.join(cutDirectory, "bad.json"), JSON.stringify({
      id: "bad-cut",
      title: "Bad cut",
      timeline: [mediaShot(0, "/media/missing.mp4")],
    }));

    const report = preflightEchoProjectAndSavedCuts({
      payload,
      projectPath,
      avatarRoot: fx.root,
      variantsRoot,
    });
    assert.equal(report.ok, false);
    assert.equal(report.cutCount, 3);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].songId, songId);
    assert.equal(report.failures[0].cutId, "bad-cut");
    assert.equal(report.failures[0].cueId, "legacy:media:0");
    assert.equal(report.failures[0].runtimeUri, "/media/missing.mp4");
    assert.ok(report.failures[0].attemptedPaths.includes(path.join(fx.root, "data/media/missing.mp4")));
    assert.match(report.failures[0].reason, /missing|not-found|unresolved|unavailable/i);
    assert.match(formatEchoMediaPreflightFailure(report), /No media was substituted and rendering did not start/);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight rejects zero-byte media before render work begins", () => {
  const fx = fixture();
  try {
    fs.writeFileSync(path.join(fx.root, "data/media/empty.mp4"), "");
    const report = preflightEchoDirectionCut({
      project: project([mediaShot(0, "/media/empty.mp4")]),
      avatarRoot: fx.root,
    });
    assert.equal(report.ok, false);
    assert.equal(report.unresolvedCount, 1);
    assert.equal(report.failures[0].runtimeUri, "/media/empty.mp4");
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("album preflight fails closed when the project source directory is empty", () => {
  const fx = fixture();
  try {
    const projectsRoot = path.join(fx.root, "empty-projects");
    fs.mkdirSync(projectsRoot, { recursive: true });
    const report = preflightEchoAlbum({
      projectsRoot,
      variantsRoot: path.join(fx.root, "data/music-video-project-variants"),
      avatarRoot: fx.root,
    });
    assert.equal(report.ok, false);
    assert.equal(report.projectCount, 0);
    assert.equal(report.failures[0].reason, "projects-directory-empty");
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("single-cut compiler fails on its selected media before manifest loading without scanning unrelated sidecars", () => {
  const fx = fixture();
  try {
    const songId = "selected-cut-only";
    const projectPath = path.join(fx.root, "selected.json");
    const outputPath = path.join(fx.root, "output");
    const unrelatedCutDir = path.join(fx.root, "data/music-video-project-variants", songId);
    fs.mkdirSync(unrelatedCutDir, { recursive: true });
    fs.writeFileSync(path.join(unrelatedCutDir, "broken-old-cut.json"), JSON.stringify({
      id: "broken-old-cut",
      timeline: [mediaShot(0, "/media/old-missing.mp4")],
    }));

    fs.writeFileSync(projectPath, JSON.stringify({
      music_video_project: project([mediaShot(0, "/media/selected-missing.mp4")], songId),
    }));
    const result = spawnSync(process.execPath, [
      path.join(REPO, "scripts/compile-echo-director-v2.mjs"),
      "--project", projectPath,
      "--output", outputPath,
      "--avatarRoot", fx.root,
      "--manifest", path.join(fx.root, "manifest-does-not-exist.json"),
    ], { cwd: REPO, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Echo media preflight failed/);
    assert.match(result.stderr, /selected-missing\.mp4/);
    assert.doesNotMatch(result.stderr, /old-missing\.mp4/);
    assert.doesNotMatch(result.stderr, /Missing JSON input: .*manifest-does-not-exist/);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("single-cut compiler does not let an unrelated broken saved cut block a valid selected project", () => {
  const fx = fixture();
  try {
    const songId = "valid-selected-cut";
    const projectPath = path.join(fx.root, "selected.json");
    const outputPath = path.join(fx.root, "output");
    const unrelatedCutDir = path.join(fx.root, "data/music-video-project-variants", songId);
    fs.mkdirSync(unrelatedCutDir, { recursive: true });
    fs.writeFileSync(path.join(unrelatedCutDir, "broken-old-cut.json"), JSON.stringify({
      id: "broken-old-cut",
      timeline: [mediaShot(0, "/media/old-missing.mp4")],
    }));
    fs.writeFileSync(projectPath, JSON.stringify({
      music_video_project: project([mediaShot(0, "/media/app.mp4")], songId),
    }));

    const result = spawnSync(process.execPath, [
      path.join(REPO, "scripts/compile-echo-director-v2.mjs"),
      "--project", projectPath,
      "--output", outputPath,
      "--avatarRoot", fx.root,
      "--manifest", path.join(fx.root, "manifest-does-not-exist.json"),
    ], { cwd: REPO, encoding: "utf8" });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing JSON input: .*manifest-does-not-exist/);
    assert.doesNotMatch(result.stderr, /Echo media preflight failed/);
    assert.doesNotMatch(result.stderr, /old-missing\.mp4/);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("preflight CLI accepts equals-style arguments and persists its report", () => {
  const fx = fixture();
  try {
    const projectPath = path.join(fx.root, "project.json");
    const variantsRoot = path.join(fx.root, "data/music-video-project-variants");
    const reportPath = path.join(fx.root, "reports/preflight.json");
    fs.writeFileSync(projectPath, JSON.stringify({
      music_video_project: project([mediaShot(0, "/media/app.mp4")]),
    }));
    const result = spawnSync(process.execPath, [
      path.join(REPO, "scripts/preflight-echo-director-media.mjs"),
      `--project=${projectPath}`,
      `--avatar-root=${fx.root}`,
      `--variants=${variantsRoot}`,
      `--report=${reportPath}`,
    ], { cwd: REPO, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(reportPath), true);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.ok, true);
    assert.equal(report.unresolvedCount, 0);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test("ambiguous basename aliases are normalized into fail-closed diagnostics", () => {
  const fx = fixture();
  try {
    const first = path.join(fx.root, "first/shared.mp4");
    const second = path.join(fx.root, "second/shared.mp4");
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.mkdirSync(path.dirname(second), { recursive: true });
    fs.writeFileSync(first, "first-media");
    fs.writeFileSync(second, "second-media");
    const payload = project([
      mediaShot(0, first, { originalUri: first }),
      mediaShot(1, second, { originalUri: second }),
    ]);
    payload.director_show_graph = {
      schemaVersion: "hapa.music-viz.native-show-graph.v2",
      song: { id: payload.song_id, title: payload.song_title, durationSeconds: 1 },
      tracks: [{
        id: "media-a",
        role: "media",
        cards: [{
          id: "ambiguous-cue",
          trackId: "media-a",
          startSeconds: 0,
          endSeconds: 1,
          media: { id: "ambiguous", title: "Ambiguous media", localPath: "shared.mp4" },
          provenance: { rendererRoute: "video" },
        }],
      }],
    };

    const report = preflightEchoDirectionCut({ project: payload, avatarRoot: fx.root });
    assert.equal(report.ok, false);
    assert.equal(report.failures[0].cueId, "ambiguous-cue");
    assert.ok(report.failures[0].aliasConflicts.length > 0 || /ambiguous|conflict/i.test(report.failures[0].reason));
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});
