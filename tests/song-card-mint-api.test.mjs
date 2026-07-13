import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const exec = promisify(execFile);

async function waitFor(url, child, output) {
  for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`API did not start: ${output.join("").slice(-3000)}`);
}

test("Song Card mint API is authenticated, restart-safe, range-correct, private-split, and timestamp printable", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-api-"));
  const sourceRoot = path.join(base, "renders"); const mintRoot = path.join(base, "mint"); const exportRoot = path.join(base, "exports"); await fsp.mkdir(sourceRoot);
  const avatarStorePath = path.join(base, "avatar-store.json");
  const sceneStorePath = path.join(base, "scene-store.json");
  const itemStorePath = path.join(base, "item-store.json");
  await Promise.all([
    fsp.writeFile(avatarStorePath, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [{ id: "avatar-card", schemaVersion: "hapa.avatar-card.v1", primaryName: "Canonical API Avatar", names: [{ name: "Canonical API Avatar" }], assets: [], slots: [], revision: 3 }] })),
    fsp.writeFile(sceneStorePath, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [{ id: "scene-card", schemaVersion: "hapa.scene.v1", title: "Canonical API Scene", assets: [], revision: 2 }], timelines: [] })),
    fsp.writeFile(itemStorePath, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [{ id: "item-card", schemaVersion: "hapa.item-card.v1", title: "Canonical API Item", kind: "object", assets: [], revision: 1 }] })),
  ]);
  const master = path.join(sourceRoot, "master.mp4");
  const poster = path.join(sourceRoot, "poster.jpg");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x102040:s=320x180:r=12", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", master]);
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x102040:s=320x180", "-frames:v", "1", poster]);
  const port = 19400 + Math.floor(Math.random() * 300);
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, HAPA_AVATAR_ADMIN_TOKEN: "mint-api-token", HAPA_SONG_CARD_MINT_ROOT: mintRoot, HAPA_SONG_CARD_EXPORT_ROOT: exportRoot, HAPA_SONG_CARD_SOURCE_ROOTS: sourceRoot, HAPA_AVATAR_STORE: avatarStorePath, HAPA_SCENE_STORE: sceneStorePath, HAPA_ITEM_STORE: itemStorePath, HAPA_AVATAR_OVERWIND_OUTBOX: path.join(base, "outbox.sqlite3"), HAPA_OVERWIND_DIR: path.join(base, "overwind") }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => output.push(String(chunk))); child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit").catch(() => {}); } async function writable(target) { const stat = await fsp.lstat(target).catch(() => null); if (!stat) return; await fsp.chmod(target, stat.isDirectory() ? 0o755 : 0o644).catch(() => {}); if (stat.isDirectory()) for (const name of await fsp.readdir(target)) await writable(path.join(target, name)); } await writable(base); await fsp.rm(base, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${port}`; await waitFor(`${api}/api/health`, child, output);
  const showGraph = { song: { id: "api-song", title: "API Song", durationSeconds: 1 }, tracks: [{ id: "a", role: "foundation", cards: [
    { id: "a0", startSeconds: 0, endSeconds: 1, media: { id: "media:item", title: "Item Motion", cardId: "item-card", cardKind: "item", cardRef: "data/item-manager-store.json#cards/item-card", cardTitle: "Canonical API Item", contentHash: "a" } },
    { id: "a1", startSeconds: 0, endSeconds: 1, media: { id: "media:scene", title: "Scene Motion", cardId: "scene-card", cardKind: "scene", cardRef: "data/scene-store.json#scenes/scene-card", cardTitle: "Canonical API Scene", contentHash: "b" } },
    { id: "a2", startSeconds: 0, endSeconds: 1, media: { id: "media:avatar", title: "Avatar Motion", cardId: "avatar-card", cardKind: "avatar", cardRef: "data/avatar-store.json#avatars/avatar-card", cardTitle: "Canonical API Avatar", contentHash: "c" } },
  ] }, { id: "b", role: "visualizer", cards: [{ id: "b0", startSeconds: 0, endSeconds: 1, visualization: { sourceId: "isf:api", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:api", title: "API Shader" } } }] }], directorV2: { treatmentId: "treatment:api", variantId: "variant:api", variantHash: "api" } };
  const body = { project: { song_id: "api-song", song_title: "API Song", duration: 1 }, showGraph, renderMasterPath: master, posterPath: poster, rendererTruth: { ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 1 }, rights: { licensingStatus: "operator-authored", consentStatus: "operator-approved" }, approvals: { technical: true, creative: true }, safety: { ok: true } };
  const unauthorized = await fetch(`${api}/api/song-cards/api-song/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); assert.equal(unauthorized.status, 401);
  const auth = { authorization: "Bearer mint-api-token", "content-type": "application/json" };
  const planResponse = await fetch(`${api}/api/song-cards/api-song/plan`, { method: "POST", headers: auth, body: JSON.stringify(body) }); assert.equal(planResponse.status, 200); const planPayload = await planResponse.json(); const plan = planPayload.plan; assert.equal(plan.predictedEdition, 1); assert.equal(plan.hardBlockers.length, 0);
  assert.equal(typeof planPayload.renderExecutor.available, "boolean");
  if (planPayload.renderExecutor.available) {
    assert.equal(planPayload.renderExecutor.status, "ready");
    assert.equal(planPayload.renderExecutor.executionModel, "builder-managed-local");
    assert.equal(planPayload.renderExecutor.builtIn, true);
  } else {
    assert.equal(planPayload.renderExecutor.executionModel, "planner-only");
    assert.ok(planPayload.renderExecutor.builtInRenderer);
  }
  assert.equal(planPayload.remintCandidate.status, "awaiting-approval");
  assert.equal(planPayload.remintCandidate.predictedEdition, 1);
  assert.equal((await fetch(`${api}/api/song-card-remints`)).status, 401);
  const remintsBeforeMint = await fetch(`${api}/api/song-card-remints`, { headers: { authorization: "Bearer mint-api-token" } }).then((response) => response.json());
  assert.equal(remintsBeforeMint.renderExecutor.available, planPayload.renderExecutor.available);
  assert.deepEqual(remintsBeforeMint.localRenderJobs, []);
  assert.equal(remintsBeforeMint.candidates.length, 1);
  assert.equal(remintsBeforeMint.candidates[0].autoMint, false);
  assert.equal((await fetch(`${api}/api/song-card-remints/executor-status`)).status, 401);
  const incompleteExecutorHeartbeat = await fetch(`${api}/api/song-card-remints/executor-heartbeat`, { method: "POST", headers: auth, body: JSON.stringify({ executorId: "preview-only-worker", adapter: "test", capabilities: ["preview"] }) }).then((response) => response.json());
  if (planPayload.renderExecutor.available) {
    assert.equal(incompleteExecutorHeartbeat.available, true, "an incompatible external heartbeat cannot suppress the built-in renderer");
    assert.equal(incompleteExecutorHeartbeat.status, "ready");
    assert.equal(incompleteExecutorHeartbeat.externalExecutor.connected, true);
    assert.equal(incompleteExecutorHeartbeat.externalExecutor.status, "incompatible");
  } else {
    assert.equal(incompleteExecutorHeartbeat.connected, true);
    assert.equal(incompleteExecutorHeartbeat.available, false);
    assert.equal(incompleteExecutorHeartbeat.status, "incompatible");
  }
  const executorHeartbeat = await fetch(`${api}/api/song-card-remints/executor-heartbeat`, { method: "POST", headers: auth, body: JSON.stringify({ executorId: "test-render-worker", adapter: "test", capabilities: ["release-export"] }) }).then((response) => response.json());
  assert.equal(executorHeartbeat.available, true);
  assert.equal(executorHeartbeat.status, "connected");
  assert.equal(executorHeartbeat.executorId, "test-render-worker");
  const candidatePath = encodeURIComponent(remintsBeforeMint.candidates[0].id);
  for (const endpoint of [
    `/api/song-card-remints/${candidatePath}/approve`,
    `/api/song-card-remints/${candidatePath}/cancel`,
    `/api/song-card-remints/${candidatePath}/render-local`,
    `/api/song-card-remints/${candidatePath}/bind-render-plan`,
    `/api/song-card-remints/${candidatePath}/jobs/fake/result`,
    "/api/song-card-remints/enqueue",
    "/api/song-card-remints/claim",
    "/api/song-card-playback/activity",
  ]) assert.equal((await fetch(`${api}${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401, endpoint);
  const playbackSession = "api-test-playback";
  const playbackActive = await fetch(`${api}/api/song-card-playback/activity`, { method: "POST", headers: auth, body: JSON.stringify({ sessionId: playbackSession, active: true }) }).then((response) => response.json());
  assert.equal(playbackActive.activeSessionCount, 1);
  const protectedClaim = await fetch(`${api}/api/song-card-remints/claim`, { method: "POST", headers: auth, body: JSON.stringify({ activePlayback: false }) }).then((response) => response.json());
  assert.equal(protectedClaim.playbackPolicy.serverObservedActive, true);
  assert.equal(protectedClaim.playbackPolicy.activePlayback, true);
  await fetch(`${api}/api/song-card-playback/activity`, { method: "POST", headers: auth, body: JSON.stringify({ sessionId: playbackSession, active: false }) });
  assert.equal((await fetch(`${api}/api/song-card-mint-jobs/${plan.planId}`)).status, 401);
  const publicJob = await fetch(`${api}/api/song-card-mint-jobs/${plan.planId}`, { headers: { authorization: "Bearer mint-api-token" } }).then((response) => response.json()); assert.equal(JSON.stringify(publicJob).includes(base), false);
  const mintResponse = await fetch(`${api}/api/song-cards/api-song/mint`, { method: "POST", headers: { ...auth, "idempotency-key": "api-e1", "if-match": "0" }, body: JSON.stringify({ planId: plan.planId, renderMasterPath: master, gate: "private-demo", expectedEdition: 1 }) }); assert.equal(mintResponse.status, 201); const minted = await mintResponse.json(); assert.equal(minted.latestEdition, 1); assert.equal(minted.edition.edition, 1);
  assert.equal((await fetch(`${api}/api/song-cards/api-song/editions/1/export`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "video" }) })).status, 401);
  const videoExportResponse = await fetch(`${api}/api/song-cards/api-song/editions/1/export`, { method: "POST", headers: auth, body: JSON.stringify({ format: "video" }) });
  assert.equal(videoExportResponse.status, 201);
  const videoExport = await videoExportResponse.json();
  assert.equal(videoExport.format, "video");
  assert.equal(path.dirname(videoExport.destination), await fsp.realpath(exportRoot));
  assert.equal((await fsp.stat(videoExport.destination)).isFile(), true);
  const bundleExportResponse = await fetch(`${api}/api/song-cards/api-song/editions/1/export`, { method: "POST", headers: auth, body: JSON.stringify({ format: "bundle" }) });
  assert.equal(bundleExportResponse.status, 201);
  const bundleExport = await bundleExportResponse.json();
  assert.equal(bundleExport.format, "bundle");
  assert.equal(path.dirname(bundleExport.destination), await fsp.realpath(exportRoot));
  assert.equal((await fsp.stat(path.join(bundleExport.destination, "export-manifest.json"))).isFile(), true);
  const remintsAfterMint = await fetch(`${api}/api/song-card-remints`, { headers: { authorization: "Bearer mint-api-token" } }).then((response) => response.json());
  assert.equal(remintsAfterMint.candidates[0].status, "minted");
  assert.equal(remintsAfterMint.candidates[0].mintedEdition, 1);
  const root = await fetch(`${api}/api/song-cards/api-song`).then((response) => response.json()); assert.equal(root.editions.length, 1); assert.equal(JSON.stringify(root).includes(base), false);
  const at = await fetch(`${api}/api/song-cards/api-song/editions/1/cards-at-time?timeMs=500`).then((response) => response.json()); assert.equal(at.active.length, 4); assert.equal(at.primary.sourceCardId, "isf:api");
  assert.equal(at.active.find((appearance) => appearance.sourceCardId === "item-card").snapshot.title, "Canonical API Item");
  assert.equal(at.active.find((appearance) => appearance.sourceCardId === "scene-card").snapshot.title, "Canonical API Scene");
  assert.equal(at.active.find((appearance) => appearance.sourceCardId === "avatar-card").snapshot.primaryName, "Canonical API Avatar");
  const printed = await fetch(`${api}/api/song-cards/api-song/editions/1/print`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeMs: 500, appearanceId: at.primary.appearanceId, surface: "test" }) }).then((response) => response.json()); assert.equal(printed.card.songCardPrint.edition, 1); assert.equal(printed.card.songCardPrint.sourceDigest, at.primary.sourceDigest);
  const avatarAppearance = at.active.find((appearance) => appearance.sourceCardId === "avatar-card");
  const printedAvatar = await fetch(`${api}/api/song-cards/api-song/editions/1/print`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeMs: 500, appearanceId: avatarAppearance.appearanceId, surface: "test" }) }).then((response) => response.json()); assert.equal(printedAvatar.card.primaryName, "Canonical API Avatar");
  const privateDenied = await fetch(`${api}/api/song-cards/api-song/editions/1/private-manifest`); assert.equal(privateDenied.status, 401);
  const privateManifest = await fetch(`${api}/api/song-cards/api-song/editions/1/private-manifest`, { headers: { authorization: "Bearer mint-api-token" } }).then((response) => response.json()); assert.equal(privateManifest.sourceAbsolutePath, await fsp.realpath(master));
  const artifactUrl = `${api}/api/song-cards/api-song/editions/1/artifact/master`;
  assert.equal((await fetch(artifactUrl, { method: "HEAD" })).status, 401);
  const ticketResponse = await fetch(`${api}/api/song-cards/api-song/editions/1/artifact-ticket`, { method: "POST", headers: auth, body: JSON.stringify({ role: "master" }) }); assert.equal(ticketResponse.status, 201); const ticket = (await ticketResponse.json()).ticket;
  const authorizedArtifactUrl = `${artifactUrl}?ticket=${encodeURIComponent(ticket)}`;
  const head = await fetch(authorizedArtifactUrl, { method: "HEAD" }); assert.equal(head.status, 200); assert.match(head.headers.get("etag"), /^"sha256-/); const size = Number(head.headers.get("content-length")); assert.ok(size > 32);
  const suffix = await fetch(authorizedArtifactUrl, { headers: { range: "bytes=-32" } }); assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 32); assert.equal(suffix.headers.get("content-range"), `bytes ${size - 32}-${size - 1}/${size}`);
  const invalid = await fetch(authorizedArtifactUrl, { headers: { range: `bytes=${size + 10}-` } }); assert.equal(invalid.status, 416);
  const raceGraphA = structuredClone(showGraph);
  raceGraphA.song = { id: "race-song", title: "Race Song", durationSeconds: 1 };
  raceGraphA.tracks[0].cards[0].media = { id: "card:race-a", title: "Race A", contentHash: "race-a" };
  const raceBodyA = { ...body, project: { song_id: "race-song", song_title: "Race Song", duration: 1 }, showGraph: raceGraphA };
  const racePlanA = (await fetch(`${api}/api/song-cards/race-song/plan`, { method: "POST", headers: auth, body: JSON.stringify(raceBodyA) }).then((response) => response.json())).plan;
  const raceGraphB = structuredClone(raceGraphA);
  raceGraphB.tracks[0].cards[0].media = { id: "card:race-b", title: "Race B", contentHash: "race-b" };
  const raceBodyB = { ...raceBodyA, showGraph: raceGraphB };
  const racePlanBResponse = await fetch(`${api}/api/song-cards/race-song/plan`, { method: "POST", headers: auth, body: JSON.stringify(raceBodyB) });
  assert.equal(racePlanBResponse.status, 200);
  const staleRaceMint = await fetch(`${api}/api/song-cards/race-song/mint`, { method: "POST", headers: { ...auth, "idempotency-key": "race-plan-a", "if-match": "0" }, body: JSON.stringify({ planId: racePlanA.planId, renderMasterPath: master, gate: "private-demo", expectedEdition: 1 }) });
  assert.equal(staleRaceMint.status, 409);
  assert.equal((await staleRaceMint.json()).error, "remint_plan_superseded");
  const raceHead = await fetch(`${api}/api/song-cards/race-song`).then((response) => response.json());
  assert.equal(raceHead.latestEdition, 0, "a superseded reviewed plan must not create an immutable edition");
  const replay = await fetch(`${api}/api/song-cards/api-song/mint`, { method: "POST", headers: { ...auth, "idempotency-key": "api-e1", "if-match": "1" }, body: JSON.stringify({ planId: plan.planId, renderMasterPath: master, gate: "private-demo", expectedEdition: 1 }) }); assert.equal(replay.status, 200); assert.equal((await replay.json()).latestEdition, 1);
});
