import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";

const CLI = path.resolve("cli/song-card-mint.mjs");
const TOKEN = "cli-test-token";

function execute(args, { env = {}, expectedCode = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        assert.equal(code, expectedCode, `stdout:\n${stdout}\nstderr:\n${stderr}`);
        resolve({ stdout, stderr, json: JSON.parse(expectedCode === 0 ? stdout : stderr) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function fixture() {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-cli-"));
  const ledgerRoot = path.join(base, "ledger");
  const projectPath = path.join(base, "project.json");
  const graphPath = path.join(base, "show-graph.json");
  const masterPath = path.join(base, "dear-papa.mp4");
  const posterPath = path.join(base, "dear-papa.jpg");
  const bin = path.join(base, "bin");
  const project = {
    song_id: "dear-papa",
    song_title: "Dear Papa",
    duration: 1,
    revision: "editor-revision-1",
    timed_lyrics: [{ start: 0, end: 1, text: "Dear Papa" }],
    rights: { licensingStatus: "operator-authored", consentStatus: "operator-approved" },
    approvals: { creative: true, technical: true },
    safety: { ok: true },
    rendererTruth: { ok: true, releaseSafe: true, truthStatus: "exact", silentDefaultCount: 0, allStatesVisible: true, cueReceiptCount: 2 },
    cardSnapshots: {
      "tarot:one": { schemaVersion: "hapa.tarot-card.v1", id: "tarot:one", title: "One" },
      "ivf:echo": { schemaVersion: "hapa.visualizer-card.v2", id: "ivf:echo", title: "Echo Shader" },
    },
  };
  const graph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "dear-papa", title: "Dear Papa", durationSeconds: 1 },
    tracks: [
      { id: "A", role: "foundation", cards: [{ id: "cue-a", startSeconds: 0, endSeconds: 0.75, media: { id: "tarot:one", cardId: "tarot:one", contentHash: "media-v1" } }] },
      { id: "B", role: "visualizer", cards: [{ id: "cue-b", startSeconds: 0.5, endSeconds: 1, visualization: { sourceId: "ivf:echo" }, parameters: { opacity: 0.8 } }] },
    ],
    directorV2: { source: { sourceProjectHash: "source-revision-1" }, cameraKeyframes: [], stemBuses: [], visualTimeTrack: { events: [] }, accentTrack: { events: [] }, effects: [] },
  };
  await Promise.all([
    fsp.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`),
    fsp.writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`),
    fsp.writeFile(masterPath, Buffer.from("physical-cli-master")),
    fsp.writeFile(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])),
    fsp.mkdir(bin, { recursive: true }),
  ]);
  const ffprobePath = path.join(bin, "ffprobe");
  await fsp.writeFile(ffprobePath, `#!/bin/sh\nprintf '%s\\n' '{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080},{"codec_type":"audio","codec_name":"aac"}],"format":{"duration":"1.0"}}'\n`);
  await fsp.chmod(ffprobePath, 0o755);
  const ffmpegPath = path.join(bin, "ffmpeg");
  await fsp.writeFile(ffmpegPath, "#!/bin/sh\nexit 0\n");
  await fsp.chmod(ffmpegPath, 0o755);
  const common = ["--root", ledgerRoot, "--song-id", "dear-papa", "--project", projectPath, "--graph", graphPath, "--master", masterPath, "--poster", posterPath];
  const env = { HAPA_SONG_CARD_MINT_TOKEN: TOKEN, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  return { base, ledgerRoot, projectPath, graphPath, masterPath, posterPath, project, graph, common, env };
}

function controllerBody(value, gate = "private-demo") {
  const song = {
    ...(value.project.song || {}),
    id: "dear-papa",
    songId: "dear-papa",
    title: value.project.song?.title || value.project.song_title || value.project.title || value.graph.song?.title || "",
    albumId: value.project.song?.albumId || value.project.album_id || value.graph.song?.albumId || "",
    attribution: value.project.song?.attribution || value.project.attribution,
    authorship: value.project.song?.authorship || value.project.authorship,
  };
  const rights = value.project.rights || value.graph.rights || {};
  const approvals = value.project.approvals || value.graph.approvals || {};
  const safety = value.project.safety || value.project.visualSafety || value.graph.safety || {};
  return {
    song,
    project: value.project,
    showGraph: value.graph,
    render: { ...(value.project.render || {}), ...(value.graph.render || {}) },
    renderMasterPath: value.masterPath,
    posterPath: value.posterPath,
    rendererTruth: value.project.rendererTruth || value.project.renderer_truth || value.graph.rendererTruth || value.graph.truth || null,
    rights,
    approvals,
    safety,
    cardSnapshots: value.project.cardSnapshots || value.project.card_snapshots || value.graph.cardSnapshots || {},
    registry: value.project.registry || value.graph.registry || {},
    context: value.project.context || value.project.songContext || {},
    captions: value.project.captions || value.graph.song?.lyricOverlay || value.project.timed_lyrics || null,
    receipts: value.project.receipts || { approvals, rights, safety },
    gate,
  };
}

function withoutVolatilePlanFields(plan) {
  const copy = structuredClone(plan);
  delete copy.createdAt;
  return copy;
}

test("plan and dry-run expose the controller public plan without private planning payloads", async () => {
  const value = await fixture();
  const planned = await execute(["plan", ...value.common], { env: value.env });
  const dryRun = await execute(["dry-run", ...value.common], { env: value.env });
  assert.equal(Object.hasOwn(planned.json.plan, "snapshot"), false);
  assert.equal(Object.hasOwn(planned.json.plan, "appearanceIndex"), false);
  assert.match(planned.json.plan.semanticFingerprint, /^sha256:/u);
  assert.equal(planned.json.plan.renderMasterBytes, Buffer.byteLength("physical-cli-master"));
  assert.equal(planned.json.plan.appearanceSummary.count, 2);
  assert.equal(planned.json.plan.appearanceSummary.gaps, 0);
  assert.deepEqual(withoutVolatilePlanFields(dryRun.json.plan), withoutVolatilePlanFields(planned.json.plan));
  assert.equal(planned.json.plan.changed, true);
  assert.equal(planned.json.plan.predictedEdition, 1);
});

test("controller and CLI return the same plan, blockers, fingerprint, diff, and idempotent mint result", async () => {
  const value = await fixture();
  const controller = new SongCardMintController({ root: value.ledgerRoot, allowedSourceRoots: [value.base] });
  const directPlan = await controller.plan("dear-papa", controllerBody(value));
  const cliPlan = (await execute(["plan", ...value.common], { env: value.env })).json.plan;
  assert.deepEqual(withoutVolatilePlanFields(cliPlan), withoutVolatilePlanFields(directPlan));
  assert.deepEqual(cliPlan.blockers, directPlan.blockers);
  assert.deepEqual(cliPlan.semanticDiff, directPlan.semanticDiff);
  assert.equal(cliPlan.semanticFingerprint, directPlan.semanticFingerprint);

  const first = await execute(["mint", ...value.common, "--idempotency-key", "parity-e1", "--expected-head", "0", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(first.json.created, true);
  const directReplay = await controller.mint("dear-papa", {
    planId: directPlan.planId,
    renderMasterPath: value.masterPath,
    posterPath: value.posterPath,
    gate: "private-demo",
    expectedEdition: 1,
    idempotencyKey: "parity-e1",
  });
  const cliReplay = await execute(["mint", ...value.common, "--idempotency-key", "parity-e1", "--apply", "--token", TOKEN], { env: value.env });
  assert.deepEqual(
    { created: cliReplay.json.created, reason: cliReplay.json.reason, edition: cliReplay.json.editionNumber },
    { created: directReplay.created, reason: directReplay.reason, edition: directReplay.edition },
  );
  assert.equal(cliReplay.json.songCard.latestEdition, directReplay.head.latestEdition);
  assert.equal(cliReplay.json.plan.semanticFingerprint, directPlan.semanticFingerprint);
  assert.deepEqual(cliReplay.json.plan.blockers, directPlan.blockers);
});

test("every state-changing command fails closed without apply and a matching configured token", async () => {
  const value = await fixture();
  const noApply = await execute(["mint", ...value.common, "--token", TOKEN], { env: value.env, expectedCode: 1 });
  assert.equal(noApply.json.error.code, "APPLY_REQUIRED");

  const badToken = await execute(["mint", ...value.common, "--apply", "--token", "incorrect"], { env: value.env, expectedCode: 1 });
  assert.equal(badToken.json.error.code, "MINT_AUTH_FAILED");

  const noConfiguredToken = await execute(["recover", "--root", value.ledgerRoot, "--apply", "--token", TOKEN], {
    env: { HAPA_SONG_CARD_MINT_TOKEN: "", HAPA_AVATAR_ADMIN_TOKEN: "" },
    expectedCode: 1,
  });
  assert.equal(noConfiguredToken.json.error.code, "MINT_AUTH_NOT_CONFIGURED");
});

test("mint, status, editions, verify, and cards-at share immutable Edition 1 JSON truth", async () => {
  const value = await fixture();
  const minted = await execute(["mint", ...value.common, "--idempotency-key", "dear-papa-revision-1", "--expected-head", "0", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(minted.json.created, true);
  assert.equal(minted.json.latestEdition, 1);
  assert.equal(minted.json.edition.id, "song-card:dear-papa:edition:1");

  const status = await execute(["status", "--root", value.ledgerRoot, "--song-id", "dear-papa"], { env: value.env });
  assert.equal(status.json.songCard.latestEdition, 1);

  const editions = await execute(["editions", "--root", value.ledgerRoot, "--song-id", "dear-papa"], { env: value.env });
  assert.equal(editions.json.editions.length, 1);
  assert.equal(editions.json.editions[0].manifest.render.decodeVerified, true);

  const verified = await execute(["verify", "--root", value.ledgerRoot, "--song-id", "dear-papa", "--edition", "1"], { env: value.env });
  assert.equal(verified.json.ok, true);
  assert.equal(Object.values(verified.json.editions[0].checks).every(Boolean), true);

  const overlap = await execute(["cards-at", "--root", value.ledgerRoot, "--song-id", "dear-papa", "--time-ms", "500"], { env: value.env });
  assert.equal(overlap.json.edition, 1);
  assert.deepEqual(overlap.json.active.map((row) => row.sourceCardId), ["tarot:one", "ivf:echo"]);
  assert.equal(overlap.json.primary.sourceCardId, "ivf:echo");
  assert.equal(overlap.json.primary.pureIvf, true);

  const replay = await execute(["mint", ...value.common, "--idempotency-key", "dear-papa-revision-1", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(replay.json.created, false);
  assert.equal(replay.json.reason, "idempotency-replay");
  assert.equal(replay.json.latestEdition, 1);

  const current = await execute(["plan", ...value.common], { env: value.env });
  assert.equal(current.json.plan.changed, false);
  assert.equal(current.json.plan.status, "up-to-date");
  assert.equal(current.json.plan.predictedEdition, 1);

  const changedGraph = structuredClone(value.graph);
  changedGraph.tracks[0].cards[0].media.contentHash = "media-v2";
  await fsp.writeFile(value.graphPath, `${JSON.stringify(changedGraph, null, 2)}\n`);
  const next = await execute(["plan", ...value.common], { env: value.env });
  assert.equal(next.json.plan.changed, true);
  assert.equal(next.json.plan.predictedEdition, 2);
  assert.ok(next.json.plan.changedFamilies.includes("videos"));

  const edition2 = await execute(["mint", ...value.common, "--idempotency-key", "dear-papa-revision-2", "--expected-head", "1", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(edition2.json.created, true);
  assert.equal(edition2.json.latestEdition, 2);

  const historical = await execute(["cards-at", "--root", value.ledgerRoot, "--song-id", "dear-papa", "--edition", "1", "--time-ms", "500"], { env: value.env });
  assert.equal(historical.json.primary.sourceCardId, "ivf:echo");
});

test("maintenance and governance commands expose explicit JSON receipts", async () => {
  const value = await fixture();
  await execute(["mint", ...value.common, "--apply", "--token", TOKEN], { env: value.env });

  const archived = await execute(["archive", "--root", value.ledgerRoot, "--song-id", "dear-papa", "--edition", "1", "--reason", "cold-storage", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(archived.json.edition.status, "archived");

  const recovered = await execute(["recover", "--root", value.ledgerRoot, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(recovered.json.ok, true);

  const cleaned = await execute(["cleanup-staging", "--root", value.ledgerRoot, "--older-than-ms", "0", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(cleaned.json.editionDirectoriesTouched, 0);
});

test("export/import, backup/restore, revoke, and legacy migration preserve verifiable render custody", async () => {
  const value = await fixture();
  await execute(["mint", ...value.common, "--apply", "--token", TOKEN], { env: value.env });
  const exportPath = path.join(value.base, "edition-export");
  const backupPath = path.join(value.base, "ledger-backup");
  const importRoot = path.join(value.base, "import-ledger");
  const restoreRoot = path.join(value.base, "restore-ledger");
  const migrationRoot = path.join(value.base, "migration-ledger");

  const exported = await execute(["export", "--root", value.ledgerRoot, "--song-id", "dear-papa", "--edition", "1", "--out", exportPath, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(exported.json.edition, 1);

  const imported = await execute(["import", "--root", importRoot, "--source", exportPath, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(imported.json.edition, 1);
  const importVerify = await execute(["verify", "--root", importRoot, "--song-id", "dear-papa"], { env: value.env });
  assert.equal(importVerify.json.ok, true);

  const backedUp = await execute(["backup", "--root", value.ledgerRoot, "--out", backupPath, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(backedUp.json.destination, backupPath);
  const restored = await execute(["restore", "--root", restoreRoot, "--source", backupPath, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(restored.json.headCount, 1);
  const restoreVerify = await execute(["verify", "--root", restoreRoot, "--song-id", "dear-papa"], { env: value.env });
  assert.equal(restoreVerify.json.ok, true);

  const revoked = await execute(["revoke", "--root", restoreRoot, "--song-id", "dear-papa", "--reason", "rights-withdrawn", "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(revoked.json.edition.status, "revoked");

  const legacyPath = path.join(value.base, "legacy-card.json");
  await fsp.writeFile(legacyPath, `${JSON.stringify({ schemaVersion: "hapa.song-card.v1", id: "dear-papa", title: "Dear Papa" })}\n`);
  const migrated = await execute(["migrate", ...value.common.map((entry, index, list) => list[index - 1] === "--root" ? migrationRoot : entry), "--legacy", legacyPath, "--apply", "--token", TOKEN], { env: value.env });
  assert.equal(migrated.json.migrationReceipt.sourceSchema, "hapa.song-card.v1");
  assert.equal(migrated.json.migrationReceipt.targetEdition, 1);
});
test("top-level --help returns the CLI contract", async () => {
  const result = await execute(["--help"]);
  assert.equal(result.json.schemaVersion, "hapa.song-card.cli-help.v1");
  assert.ok(result.json.commands.includes("mint"));
});
