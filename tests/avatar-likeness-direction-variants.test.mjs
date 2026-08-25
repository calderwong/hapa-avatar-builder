import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "append-avatar-likeness-echo-direction-variants.mjs");

const HEX_1 = "1".repeat(64);
const HEX_2 = "2".repeat(64);

function runScript(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function videoRecord(id, hex, { sourcePath } = {}) {
  return {
    id,
    name: `${id}.mp4`,
    mediaType: "video",
    uri: `/media/${id}.mp4`,
    sourcePath,
    contentFingerprint: hex,
    width: 1280,
    height: 720,
    duration: 4,
    fps: 30,
    tags: [],
    relationships: [{ ownerType: "avatar", ownerId: "avatar-1", ownerName: "Mara" }],
  };
}

async function buildFixture(temp) {
  const data = path.join(temp, "data");
  const media = path.join(data, "media");
  await mkdir(media, { recursive: true });
  await mkdir(path.join(data, "avatar-likeness"), { recursive: true });
  await mkdir(path.join(data, "music-video-projects"), { recursive: true });
  await mkdir(path.join(temp, "playlist"), { recursive: true });
  for (const name of ["v1.mp4", "v2.mp4", "mara-1.mp4", "mara-2.mp4", "mara-3.mp4"]) {
    await writeFile(path.join(media, name), Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]));
  }
  const write = async (relative, value) => {
    const filePath = path.join(data, relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  };

  await write("avatar-store.json", { schemaVersion: "hapa.avatar-store.v1", avatars: [{ id: "avatar-1", name: "Mara", role: "Protagonist" }] });
  await write("tarot-store.json", { schemaVersion: "v1", cards: [] });
  await write("scene-store.json", { schemaVersion: "v1", scenes: [] });
  await write("item-manager-store.json", { schemaVersion: "v1", cards: [] });
  await write("hapa-songs-store.json", { schemaVersion: "v1", songs: [{ id: "song-1", title: "Test Song" }] });
  await write("human-video-enrichments.json", { schemaVersion: "v1", records: [] });
  await write("human-video-agent-reviews.json", { schemaVersion: "v1", reviews: [] });
  await write("human-video-reference-reviews.json", { schemaVersion: "v1", reviews: [] });
  await write("human-video-visual-enrichments.json", { schemaVersion: "v1", records: [] });
  await write("media-library.json", {
    schemaVersion: "v1",
    records: [
      videoRecord("folder-video-1", HEX_1, { sourcePath: path.join(media, "v1.mp4") }),
      videoRecord("folder-video-2", HEX_2, { sourcePath: path.join(media, "v2.mp4") }),
      { id: "avatar-asset-1", name: "mara-1.mp4", mediaType: "video", uri: "/media/mara-1.mp4", sourcePath: path.join(media, "mara-1.mp4"), contentFingerprint: "a".repeat(64), width: 512, height: 512, duration: 3, relationships: [{ ownerType: "avatar", ownerId: "avatar-1", ownerName: "Mara" }] },
      { id: "avatar-asset-2", name: "mara-2.mp4", mediaType: "video", uri: "/media/mara-2.mp4", sourcePath: path.join(media, "mara-2.mp4"), contentFingerprint: "b".repeat(64), width: 512, height: 512, duration: 3, relationships: [{ ownerType: "avatar", ownerId: "avatar-1", ownerName: "Mara" }] },
      { id: "avatar-asset-3", name: "mara-3.mp4", mediaType: "video", uri: "/media/mara-3.mp4", sourcePath: path.join(media, "mara-3.mp4"), contentFingerprint: "c".repeat(64), width: 512, height: 512, duration: 3, relationships: [{ ownerType: "avatar", ownerId: "avatar-1", ownerName: "Mara" }] },
    ],
  });
  await write("human-video-quick-sort-decisions.json", {
    schemaVersion: "hapa.human-video-quick-sort-store.v1",
    decisions: [
      { id: "qs-1", videoKey: `fingerprint:${HEX_1}`, videoId: "folder-video-1", videoName: "folder-video-1.mp4", aliases: [`fingerprint:${HEX_1}`, `uri:/media/folder-video-1.mp4`], state: "accepted", origin: "human-enricher-quick-sort", actorId: "calder", revision: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
      { id: "qs-2", videoKey: `fingerprint:${HEX_2}`, videoId: "folder-video-2", videoName: "folder-video-2.mp4", aliases: [`fingerprint:${HEX_2}`, `uri:/media/folder-video-2.mp4`], state: "accepted", origin: "human-enricher-quick-sort", actorId: "calder", revision: 1, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
    ],
  });
  await write("human-video-likeness-decisions.json", {
    schemaVersion: "hapa.human-video-likeness-decisions-store.v1",
    decisions: [
      {
        id: `fingerprint:${HEX_1}:avatar-likeness`,
        videoKey: `fingerprint:${HEX_1}`,
        videoId: "folder-video-1",
        videoName: "folder-video-1.mp4",
        aliases: [`fingerprint:${HEX_1}`, `uri:/media/folder-video-1.mp4`],
        state: "accepted",
        origin: "avatar-likeness",
        decisionAvatarId: "avatar-1",
        decisionAvatarName: "Mara",
        receipt: { verdict: "assigned", gate: { assignedScore: 0.71, assignedMargin: 0.21, secondaryScore: 0.5 }, contentFingerprint: HEX_1, primary: { avatarId: "avatar-1", name: "Mara", score: 0.71, channels: { palette: 0.8, dHash: 0.7, text: 0.4, colorWords: 0.3 }, active: ["palette"] } },
        actorId: "calder",
        revision: 2,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T01:00:00.000Z",
      },
      {
        id: `fingerprint:${HEX_2}:avatar-likeness`,
        videoKey: `fingerprint:${HEX_2}`,
        videoId: "folder-video-2",
        videoName: "folder-video-2.mp4",
        aliases: [`fingerprint:${HEX_2}`, `uri:/media/folder-video-2.mp4`],
        state: "rejected",
        origin: "avatar-likeness",
        decisionAvatarId: "avatar-2",
        decisionAvatarName: "Blue",
        receipt: { verdict: "unresolved", reasons: ["too_close"], contentFingerprint: HEX_2 },
        actorId: "calder",
        revision: 1,
        createdAt: "2026-08-25T00:30:00.000Z",
        updatedAt: "2026-08-25T00:30:00.000Z",
      },
    ],
  });
  await write("avatar-likeness/profiles.json", {
    schemaVersion: "hapa.avatar-likeness-profile-store.v1",
    profiles: {
      "avatar-1": {
        schemaVersion: "hapa.avatar-likeness-profile.v1",
        avatarId: "avatar-1",
        name: "Mara",
        status: "profiled",
        sourceAssets: [
          { assetId: "avatar-asset-1", kind: "video", fileName: "mara-1.mp4", weight: 1, status: "signed" },
          { assetId: "avatar-asset-2", kind: "video", fileName: "mara-2.mp4", weight: 1, status: "signed" },
          { assetId: "avatar-asset-3", kind: "video", fileName: "mara-3.mp4", weight: 1, status: "signed" },
        ],
        sampling: { usable: 3, attempted: 3, signed: 3, sampledOut: 0 },
      },
    },
  });
  await write("dear-papa-songbook.json", {
    schemaVersion: "v1",
    album: { id: "album-1", title: "Test Album" },
    songCards: [{ id: "card-1", title: "Test Song", registryTrackId: "song-1", status: "matched", trackNumber: 1 }],
  });
  const project = {
    song_id: "song-1",
    song_title: "Test Song",
    duration: 6,
    timeline: [
      { start_sec: 0, end_sec: 2, media_id: "legacy-1", media_uri: "/media/legacy-1.mp4", section_type: "intro" },
      { start_sec: 2, end_sec: 4, media_id: "legacy-2", media_uri: "/media/legacy-2.mp4", section_type: "chorus" },
      { start_sec: 4, end_sec: 6, media_id: "legacy-3", media_uri: "/media/legacy-3.mp4", section_type: "outro" },
    ],
    visualizer_timeline: [{ visualizer_id: "ivf-1", start_sec: 0, end_sec: 6 }],
  };
  await write("music-video-projects/card-1-video-project.json", { music_video_project: project });
  await writeFile(
    path.join(temp, "playlist", "manifest.hapa-avatar-builder.json"),
    `${JSON.stringify({ id: "903148b6-5709-4511-9cfd-d34b23799da6", songs: [{ id: "song-1", title: "Test Song", index: 1 }], counts: { songs: 1 } }, null, 2)}\n`,
  );
  return { data, manifest: path.join(temp, "playlist", "manifest.hapa-avatar-builder.json"), projectPath: path.join(data, "music-video-projects", "card-1-video-project.json") };
}

test("source contract: append-only, gated, audited, never mutating originals", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.match(source, /likeness-accepted-v1/);
  assert.match(source, /LIKENESS_CAST_AUTHORITY/);
  assert.match(source, /likenessAuthority: LIKENESS_CAST_AUTHORITY/);
  assert.match(source, /Acceptance is the boundary; likeness is the placement\./);
  assert.match(source, /requireAllSourceGroups/);
  assert.match(source, /HAPA_AVATAR_LIKENESS_DATA_DIR/);
  assert.match(source, /human-video-likeness-decisions\.json/);
  assert.match(source, /"avatar-likeness", "profiles\.json"/);
  assert.match(source, /--resume/);
  assert.match(source, /atomicWrite\(variantPath, variant\)/);
  assert.match(source, /safeMediaShotMask/);
  assert.match(source, /copyFile\(INDEX_PATH/);
  assert.doesNotMatch(source, /writeFile\(projectPath/);
  const domain = await readFile(path.join(ROOT, "src", "domain", "avatar-likeness-director-cast.js"), "utf8");
  assert.match(domain, /Acceptance is the boundary; likeness is the placement\./);
});

test("empty decisions store appends nothing and reports honestly", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "avatar-likeness-variants-"));
  t.after(async () => await rm(temp, { recursive: true, force: true }));
  const fixture = await buildFixture(temp);
  await rm(path.join(fixture.data, "human-video-likeness-decisions.json"));
  const result = await runScript([], {
    HAPA_AVATAR_LIKENESS_DATA_DIR: fixture.data,
    HAPA_DEAR_PAPA_MANIFEST: fixture.manifest,
  });
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.validation.note, "no-accepted-likeness-decisions-yet");
  assert.equal(parsed.variants.projects, 0);
  await assert.rejects(readFile(path.join(fixture.data, "music-video-project-variants", "song-1", "avatar-likeness-v1.json")));
});

test("round trip: typed cast lands in the variant, originals stay immutable", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "avatar-likeness-variants-"));
  t.after(async () => await rm(temp, { recursive: true, force: true }));
  const fixture = await buildFixture(temp);
  const projectBefore = await readFile(fixture.projectPath, "utf8");
  const env = {
    HAPA_AVATAR_LIKENESS_DATA_DIR: fixture.data,
    HAPA_DEAR_PAPA_MANIFEST: fixture.manifest,
  };

  const dry = await runScript(["--video-ratio", "1"], env);
  assert.equal(dry.code, 0, dry.stderr);
  const dryParsed = JSON.parse(dry.stdout);
  assert.equal(dryParsed.ok, true);
  assert.equal(dryParsed.validation.originalProjectsMutated, 0);
  assert.equal(dryParsed.humanEnricher.likeness.acceptedDecisions, 1);
  assert.equal(dryParsed.humanEnricher.likeness.poolSize, 1);
  await assert.rejects(readFile(path.join(fixture.data, "music-video-project-variants", "song-1", "avatar-likeness-v1.json")));

  const apply = await runScript(["--apply", "--video-ratio", "1"], env);
  assert.equal(apply.code, 0, apply.stderr);
  const applyParsed = JSON.parse(apply.stdout);
  assert.equal(applyParsed.ok, true);
  assert.equal(applyParsed.variants.generated, 1);
  assert.equal(applyParsed.variants.typedShots, 1, JSON.stringify(applyParsed.variants));
  assert.equal(applyParsed.variants.mediaShots, 1, "single-candidate pool places exactly one media shot");

  const variantPath = path.join(fixture.data, "music-video-project-variants", "song-1", "avatar-likeness-v1.json");
  const variant = JSON.parse(await readFile(variantPath, "utf8"));
  assert.equal(variant.id, "avatar-likeness-v1");
  assert.equal(variant.parent.immutableLegacyProject, true);
  assert.equal(variant.sourcePolicy.acceptedStateOnly, true);
  assert.equal(variant.sourcePolicy.likenessAuthority, "human-likeness-acceptance-only");
  assert.equal(variant.sourcePolicy.likenessPool, "typed");
  assert.equal(variant.avatarLikenessAudit.ok, true);
  assert.equal(variant.avatarLikenessAudit.typedShots, 1);
  assert.equal(variant.avatarLikenessAudit.visualizerOnlyShots, 2);
  for (const shot of variant.timeline) {
    if (shot.media_id === "none" || !shot.media_uri) {
      assert.equal(shot.decision_evidence.avatarLikeness, undefined, "visualizer-only shot carries no cast");
      continue;
    }
    assert.equal(shot.decision_evidence.avatarLikeness?.evidenceBasis, "likeness-accepted-v1");
    assert.equal(shot.decision_evidence.avatarLikeness.cast.avatarName, "Mara");
    assert.equal(shot.media_cast_label, "Avatar Card | Mara");
    assert.equal(shot.decision_evidence.humanAcceptedIdentity.decisionState, "accepted");
  }
  const index = JSON.parse(await readFile(path.join(fixture.data, "music-video-project-variants", "index.json"), "utf8"));
  assert.equal(index.variants.length, 1);
  assert.equal(index.variants[0].variantId, "avatar-likeness-v1");
  assert.equal(index.variants[0].typedShots, 1);
  assert.match(await readFile(path.join(fixture.data, "merge-reports", `${applyParsed.runId}.json`), "utf8"), /avatar-likeness-direction-report\.v1/);
  assert.equal(await readFile(fixture.projectPath, "utf8"), projectBefore, "original Director project must be untouched");

  const rerun = await runScript(["--apply", "--video-ratio", "1"], env);
  assert.notEqual(rerun.code, 0);
  assert.match(rerun.stderr, /already exists/);
  const resume = await runScript(["--apply", "--resume", "--video-ratio", "1"], env);
  assert.equal(resume.code, 0, resume.stderr);
  assert.equal(JSON.parse(resume.stdout).variants.resumed, 1);

  const allPool = await runScript(["--apply", "--pool", "all", "--video-ratio", "1", "--variant-id", "avatar-likeness-all-v1"], env);
  assert.equal(allPool.code, 0, allPool.stderr);
  const allParsed = JSON.parse(allPool.stdout);
  assert.equal(allParsed.humanEnricher.likeness.poolSize, 2);
  const allVariant = JSON.parse(await readFile(path.join(fixture.data, "music-video-project-variants", "song-1", "avatar-likeness-all-v1.json"), "utf8"));
  const typedInAll = allVariant.timeline.filter((shot) => shot.decision_evidence?.avatarLikeness).length;
  const mediaInAll = allVariant.timeline.filter((shot) => shot.media_id !== "none" && shot.media_uri).length;
  assert.ok(mediaInAll >= 1, "the all pool places media");
  assert.ok(typedInAll > 0, "typed shots appear where decisions exist");
  assert.ok(typedInAll <= mediaInAll, "typed shots are a subset of media shots");
  assert.ok(allParsed.humanEnricher.likeness.candidateSummary.withoutCast > 0, "rejected-decision media remains honestly untyped");
  assert.equal(allVariant.avatarLikenessAudit.ok, true);
  assert.equal(allVariant.sourcePolicy.likenessPool, "all");
});
