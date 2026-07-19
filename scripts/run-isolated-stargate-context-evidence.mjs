#!/usr/bin/env node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--spatial-truth-capture") ? "spatial-truth-capture" : process.argv.includes("--media-comment-capture") ? "media-comment-capture" : process.argv.includes("--gate-pass-capture") ? "gate-pass-capture" : process.argv.includes("--gate-pass") ? "gate-pass" : process.argv.includes("--catalog-return-capture") ? "catalog-return-capture" : process.argv.includes("--catalog-return") ? "catalog-return" : process.argv.includes("--mint-capture") ? "mint-capture" : process.argv.includes("--capture") ? "capture" : process.argv.includes("--smoke") ? "smoke" : process.argv.includes("--core-smoke") ? "core-smoke" : "all";
const runtimeRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-context-evidence-"));
const port = 22600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}/`;
const overwindPort = port + 400;
const catalogPort = port + 800;
const paths = Object.fromEntries(Object.entries({ avatar: "avatar-store.json", kanban: "kanban.json", scene: "scene-store.json", item: "item-store.json", inventory: "inventory-store.json", tarot: "tarot-store.json", songs: "song-store.json", subscribers: "subscribers", overwind: "overwind", mint: "mints", comments: "media-comments", phoneInvites: "phone-bridge-invites" }).map(([key, value]) => [key, path.join(runtimeRoot, value)]));

const seedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152"><rect width="768" height="1152" fill="#020617"/><circle cx="384" cy="480" r="220" fill="none" stroke="#00f3ff" stroke-width="18"/><text x="384" y="870" text-anchor="middle" fill="#f8f3e7" font-family="monospace" font-size="48">BUILD WEEK</text></svg>')}`;
await Promise.all([
  fsp.writeFile(paths.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [{ id: "build-week-operator", schemaVersion: "hapa.avatar-card.v1", primaryName: "Build Week Operator", names: [{ name: "Build Week Operator" }], slots: [], assets: [] }], teams: [] })),
  fsp.writeFile(paths.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
  fsp.writeFile(paths.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
  fsp.writeFile(paths.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
  fsp.writeFile(paths.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
  fsp.writeFile(paths.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", cards: [{ schemaVersion: "hapa.tarot-card.v1", id: "build-week-seed", title: "Build Week Seed", cardType: "reference_card", number: "00", suit: "custom", arcana: "custom", orientation: "upright", keywords: ["build-week"], meaning: "A harmless seed Card for isolated product evidence.", reversedMeaning: "", promptNotes: "", status: "draft", deckIds: [], setIds: [], avatarLinks: [], asset: { id: "build-week-seed-face", name: "Build Week Seed", type: "image", mimeType: "image/svg+xml", uri: seedSvg, source: "isolated-evidence-fixture", tags: ["tarot-card"] }, assets: [{ id: "build-week-seed-face", name: "Build Week Seed", type: "image", mimeType: "image/svg+xml", uri: seedSvg, source: "isolated-evidence-fixture", tags: ["tarot-card"] }], primaryAssetId: "build-week-seed-face", enrichment: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }], decks: [], sets: [], spreads: [], updatedAt: "2026-07-18T00:00:00.000Z" })),
  fsp.writeFile(paths.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
  fsp.mkdir(paths.subscribers, { recursive: true }),
  fsp.mkdir(paths.overwind, { recursive: true }),
  fsp.mkdir(paths.mint, { recursive: true })
]);

const sharedEnv = {
  ...process.env,
  HAPA_AVATAR_STORE: paths.avatar,
  HAPA_KANBAN_STORE: paths.kanban,
  HAPA_SCENE_STORE: paths.scene,
  HAPA_ITEM_STORE: paths.item,
  HAPA_INVENTORY_STORE: paths.inventory,
  HAPA_TAROT_STORE: paths.tarot,
  HAPA_SONG_STORE: paths.songs,
  HAPA_SUBSCRIBER_DIR: paths.subscribers,
  HAPA_OVERWIND_DIR: paths.overwind,
  HAPA_AVATAR_OVERWIND_OUTBOX: path.join(paths.overwind, "origin.sqlite3"),
  HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(paths.overwind, "subscriber.sqlite3"),
  HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
  HAPA_OVERWIND_WARM_FULL: "0",
  HAPA_GATE_PASS_PROFILE_ROOT: path.join(runtimeRoot, "gate-pass-profiles"),
  HAPA_SONG_CARD_MINT_ROOT: paths.mint,
  HAPA_AVATAR_MEDIA_COMMENT_ROOT: paths.comments,
  HAPA_PHONE_BRIDGE_INVITE_DIR: paths.phoneInvites
};

let fixtureLedger = 76;
const overwindFixture = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  const results = (body.events || []).map((event) => ({ event_id: event.event_id, outcome: "accepted", durable: true, overwind_watermark: ++fixtureLedger }));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, results }));
});
const catalogFixture = createServer((req, res) => {
  const expected = Number(new URL(req.url, `http://127.0.0.1:${catalogPort}`).searchParams.get("expected_revision") || 1);
  const cardId = decodeURIComponent(String(req.url).match(/\/v1\/overwind\/cards\/([^/]+)\/projection-status/)?.[1] || "");
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url.startsWith("/v1/overwind/subscriber/sync") ? { ok: true, mode: "isolated-visual-fixture", applied: 1, cursor: fixtureLedger } : {
    ok: true, schemaVersion: "hapa.catalog.card-projection-status.v1", state: "catalog_indexed", card_id: cardId,
    expected_revision: expected, indexed_revision: expected, subscriber_cursor: fixtureLedger, truth_state: "overwind-acknowledged",
    identity: { second_card_head_created: false, projection_owner: ".hapaCatalog", record_owner: "Overwind" },
    commerce: { eligibility: "not_inferred", source_only: true, offer_count: 0, sellable: false }
  }));
});

function run(command, args, env = sharedEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}\n${stderr}`)));
  });
}

async function waitForHealth(child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(`${baseUrl}api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Isolated Avatar Builder API did not start: ${output.join("").slice(-3000)}`);
}

const serverOutput = [];
await Promise.all([
  new Promise((resolve) => overwindFixture.listen(overwindPort, "127.0.0.1", resolve)),
  new Promise((resolve) => catalogFixture.listen(catalogPort, "127.0.0.1", resolve))
]);
const evidenceEnv = { ...sharedEnv, HAPA_AVATAR_ADMIN_TOKEN: "isolated-avatar-token", HAPA_OVERWIND_TOKEN: "isolated-overwind-token", HAPA_OVERWIND_URL: `http://127.0.0.1:${overwindPort}`, HAPA_CATALOG_URL: `http://127.0.0.1:${catalogPort}`, HAPA_CATALOG_TOKEN: "isolated-catalog-token" };
const server = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port), "--static", "dist"], { cwd: ROOT, env: evidenceEnv, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));
try {
  await waitForHealth(server, serverOutput);
  const electron = path.join(ROOT, "node_modules", ".bin", "electron");
  const results = [];
  if (["all", "core-smoke"].includes(mode)) results.push(await run("npm", ["run", "smoke:tarot"], { ...sharedEnv, SMOKE_URL: baseUrl }));
  if (["all", "smoke"].includes(mode)) results.push(await run(electron, ["scripts/tarot-stargate-context-smoke.cjs"], { ...sharedEnv, SMOKE_URL: baseUrl }));
  if (["all", "capture"].includes(mode)) results.push(await run(electron, ["scripts/capture-tarot-stargate-context-card.cjs"], { ...sharedEnv, CAPTURE_URL: baseUrl }));
  if (mode === "mint-capture") results.push(await run(electron, ["scripts/capture-tarot-stargate-mint.cjs"], { ...evidenceEnv, CAPTURE_URL: baseUrl }));
  if (mode === "catalog-return") results.push(await run(electron, ["scripts/tarot-stargate-catalog-return-smoke.cjs"], { ...evidenceEnv, SMOKE_URL: baseUrl }));
  if (mode === "catalog-return-capture") results.push(await run(electron, ["scripts/capture-tarot-stargate-catalog-return.cjs"], { ...evidenceEnv, CAPTURE_URL: baseUrl }));
  if (mode === "gate-pass") results.push(await run(electron, ["scripts/tarot-stargate-gate-pass-smoke.cjs"], { ...evidenceEnv, SMOKE_URL: baseUrl }));
  if (mode === "gate-pass-capture") results.push(await run(electron, ["scripts/capture-tarot-stargate-gate-pass.cjs"], { ...evidenceEnv, CAPTURE_URL: baseUrl }));
  if (mode === "media-comment-capture") results.push(await run(electron, ["scripts/capture-tarot-stargate-comment-card.cjs"], { ...evidenceEnv, CAPTURE_URL: baseUrl }));
  if (mode === "spatial-truth-capture") results.push(await run(electron, ["scripts/capture-tarot-spatial-truth-constellation.cjs"], { ...evidenceEnv, CAPTURE_URL: baseUrl }));
  console.log(JSON.stringify({ ok: true, mode, isolated: true, userAppTouched: false, baseUrl, runtimeRootDeleted: true, runs: results.length }, null, 2));
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
  await fsp.rm(runtimeRoot, { recursive: true, force: true });
  await Promise.all([new Promise((resolve) => overwindFixture.close(resolve)), new Promise((resolve) => catalogFixture.close(resolve))]);
}
