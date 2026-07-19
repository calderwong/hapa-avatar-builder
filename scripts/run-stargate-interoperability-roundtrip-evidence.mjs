#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OVERWIND_ROOT = path.resolve(process.env.HAPA_OVERWIND_ROOT || path.join(os.homedir(), "Desktop", "hapa-overwind-node"));
const CATALOG_ROOT = path.resolve(process.env.HAPA_CATALOG_ROOT || path.join(os.homedir(), "Desktop", "hapa-catalog-node"));
const runtimeRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-roundtrip-"));
const database = `hapa_bw_roundtrip_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63);
const overwindToken = `roundtrip-overwind-${process.pid}`;
const catalogToken = `roundtrip-catalog-${process.pid}`;
const avatarToken = `roundtrip-avatar-${process.pid}`;
const serviceChildren = [];
let databaseCreated = false;

function run(command, args, { cwd = ROOT, env = process.env, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; if (!quiet) process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (!quiet) process.stderr.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}\n${stderr.slice(-5000)}`)));
  });
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, { headers = {}, timeoutMs = 30_000, label = url } = {}) {
  const started = Date.now();
  let lastError = "not started";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { headers });
      if (response.ok) return response.json().catch(() => ({}));
      lastError = `${response.status} ${await response.text()}`;
    } catch (error) { lastError = error?.message || String(error); }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function startService(command, args, { cwd, env, label }) {
  const logPath = path.join(runtimeRoot, `${label}.log`);
  const log = await fsp.open(logPath, "w");
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", log.fd, log.fd] });
  child.__hapaLogHandle = log;
  child.__hapaLabel = label;
  serviceChildren.push(child);
  child.once("exit", (code) => { if (code && code !== 0) process.stderr.write(`${label} exited early (${code}); log ${logPath}\n`); });
  return child;
}

async function stopService(child) {
  if (!child) return;
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 4_000);
    await once(child, "exit").catch(() => {});
    clearTimeout(timer);
  }
  await child.__hapaLogHandle?.close().catch(() => {});
}

async function userAppIdentity() {
  try {
    const response = await fetch("http://127.0.0.1:8797/api/health");
    const payload = await response.json();
    return { pid: payload?.runtime?.pid || null, startedAt: payload?.runtime?.startedAt || null, buildSignature: payload?.runtime?.buildSignature || null };
  } catch { return null; }
}

async function seedAvatarStores() {
  const paths = Object.fromEntries(Object.entries({
    avatar: "avatar-store.json", kanban: "kanban.json", scene: "scene-store.json", item: "item-store.json",
    inventory: "inventory-store.json", tarot: "tarot-store.json", songs: "song-store.json"
  }).map(([key, value]) => [key, path.join(runtimeRoot, value)]));
  const seedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152"><rect width="768" height="1152" fill="#020617"/><circle cx="384" cy="480" r="220" fill="none" stroke="#00f3ff" stroke-width="18"/><text x="384" y="870" text-anchor="middle" fill="#f8f3e7" font-family="monospace" font-size="48">BUILD WEEK</text></svg>')}`;
  const writes = [
    [paths.avatar, { schemaVersion: "hapa.avatar-store.v1", avatars: [{ id: "build-week-operator", schemaVersion: "hapa.avatar-card.v1", primaryName: "Build Week Operator", names: [{ name: "Build Week Operator" }], slots: [], assets: [] }], teams: [] }],
    [paths.kanban, { schemaVersion: "hapa.kanban.v1", lanes: [] }],
    [paths.scene, { schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] }],
    [paths.item, { schemaVersion: "hapa.item-manager-store.v1", cards: [] }],
    [paths.inventory, { schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] }],
    [paths.songs, { schemaVersion: "hapa.song-store.v1", songs: [] }],
    [paths.tarot, { schemaVersion: "hapa.tarot-library.v1", cards: [{ schemaVersion: "hapa.tarot-card.v1", id: "build-week-seed", title: "Build Week Seed", cardType: "reference_card", number: "00", suit: "custom", arcana: "custom", orientation: "upright", keywords: ["build-week"], meaning: "A harmless seed Card for isolated product evidence.", reversedMeaning: "", promptNotes: "", status: "draft", deckIds: [], setIds: [], avatarLinks: [], asset: { id: "build-week-seed-face", name: "Build Week Seed", type: "image", mimeType: "image/svg+xml", uri: seedSvg, source: "isolated-evidence-fixture", tags: ["tarot-card"] }, assets: [], primaryAssetId: "build-week-seed-face", enrichment: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }], decks: [], sets: [], spreads: [], updatedAt: "2026-07-18T00:00:00.000Z" }]
  ];
  await Promise.all(writes.map(([target, value]) => fsp.writeFile(target, `${JSON.stringify(value)}\n`)));
  return paths;
}

const userAppBefore = await userAppIdentity();
try {
  if (!database.startsWith("hapa_bw_roundtrip_")) throw new Error("Refusing to create an unscoped evidence database");
  const [overwindPort, catalogPort, avatarPort] = await Promise.all([reservePort(), reservePort(), reservePort()]);
  const paths = await seedAvatarStores();
  await Promise.all([
    fsp.mkdir(path.join(runtimeRoot, "avatar-overwind"), { recursive: true }),
    fsp.mkdir(path.join(runtimeRoot, "avatar-subscribers"), { recursive: true }),
    fsp.mkdir(path.join(runtimeRoot, "gate-pass-profiles"), { recursive: true }),
    fsp.mkdir(path.join(runtimeRoot, "mint"), { recursive: true }),
    fsp.mkdir(path.join(runtimeRoot, "catalog-state"), { recursive: true })
  ]);

  await run("/opt/homebrew/bin/createdb", ["-h", "127.0.0.1", database], { cwd: OVERWIND_ROOT, quiet: true });
  databaseCreated = true;
  await run("/opt/homebrew/bin/psql", ["-h", "127.0.0.1", "-d", database, "-v", "ON_ERROR_STOP=1", "-q", "-f", "schema/postgres.sql"], { cwd: OVERWIND_ROOT, quiet: true });
  await run("/opt/homebrew/bin/psql", ["-h", "127.0.0.1", "-d", database, "-v", "ON_ERROR_STOP=1", "-q", "-c", "ALTER SEQUENCE hapa_card_events_ledger_position_seq RESTART WITH 900000001;"], { cwd: OVERWIND_ROOT, quiet: true });

  const overwindUrl = `http://127.0.0.1:${overwindPort}`;
  const catalogUrl = `http://127.0.0.1:${catalogPort}`;
  const avatarUrl = `http://127.0.0.1:${avatarPort}/`;
  const overwindEnv = {
    ...process.env,
    HAPA_OVERWIND_POSTGRES_DB: database,
    HAPA_OVERWIND_DATA_DIR: path.join(runtimeRoot, "overwind"),
    HAPA_OVERWIND_TOKEN: overwindToken,
    HAPA_OVERWIND_HOST: "127.0.0.1",
    HAPA_OVERWIND_PORT: String(overwindPort),
    HAPA_OVERWIND_ALLOWED_ORIGINS: `${avatarUrl.slice(0, -1)},${catalogUrl}`
  };
  await startService("python3", ["-m", "hapa_overwind", "serve", "--host", "127.0.0.1", "--port", String(overwindPort)], { cwd: OVERWIND_ROOT, env: overwindEnv, label: "overwind" });
  await waitFor(`${overwindUrl}/health`, { label: "isolated Overwind" });

  const catalogState = path.join(runtimeRoot, "catalog-state");
  const catalogEnv = {
    ...process.env,
    HAPA_CATALOG_ROOT: CATALOG_ROOT,
    HAPA_CATALOG_STATE_ROOT: catalogState,
    HAPA_CATALOG_DATA_DIR: path.join(catalogState, "data"),
    HAPA_CATALOG_ARTIFACT_DIR: path.join(catalogState, "artifacts"),
    HAPA_CATALOG_RUNTIME_DIR: path.join(catalogState, "runtime"),
    HAPA_CATALOG_BOARD_LOG_PATH: path.join(catalogState, "board-events.ndjson"),
    HAPA_CATALOG_DB_PATH: path.join(catalogState, "data", "hapa-catalog.db"),
    HAPA_CATALOG_TOKEN: catalogToken,
    HAPA_CATALOG_HOST: "127.0.0.1",
    HAPA_CATALOG_PORT: String(catalogPort),
    HAPA_OVERWIND_URL: overwindUrl,
    HAPA_CATALOG_OVERWIND_TOKEN: overwindToken,
    HAPA_CATALOG_OVERWIND_SUBSCRIBER_SYNC: "0"
  };
  await startService(process.execPath, ["src/server.mjs"], { cwd: CATALOG_ROOT, env: catalogEnv, label: "catalog" });
  await waitFor(`${catalogUrl}/health`, { label: "isolated .hapaCatalog" });

  const avatarEnv = {
    ...process.env,
    HAPA_AVATAR_STORE: paths.avatar,
    HAPA_KANBAN_STORE: paths.kanban,
    HAPA_SCENE_STORE: paths.scene,
    HAPA_ITEM_STORE: paths.item,
    HAPA_INVENTORY_STORE: paths.inventory,
    HAPA_TAROT_STORE: paths.tarot,
    HAPA_SONG_STORE: paths.songs,
    HAPA_SUBSCRIBER_DIR: path.join(runtimeRoot, "avatar-subscribers"),
    HAPA_OVERWIND_DIR: path.join(runtimeRoot, "avatar-overwind"),
    HAPA_AVATAR_OVERWIND_OUTBOX: path.join(runtimeRoot, "avatar-overwind", "origin.sqlite3"),
    HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(runtimeRoot, "avatar-overwind", "subscriber.sqlite3"),
    HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
    HAPA_OVERWIND_WARM_FULL: "0",
    HAPA_GATE_PASS_PROFILE_ROOT: path.join(runtimeRoot, "gate-pass-profiles"),
    HAPA_SONG_CARD_MINT_ROOT: path.join(runtimeRoot, "mint"),
    HAPA_AVATAR_ADMIN_TOKEN: avatarToken,
    HAPA_AVATAR_TRUST_LOCAL_UI: "1",
    HAPA_OVERWIND_URL: overwindUrl,
    HAPA_OVERWIND_TOKEN: overwindToken,
    HAPA_CATALOG_URL: catalogUrl,
    HAPA_CATALOG_TOKEN: catalogToken
  };
  await startService(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(avatarPort), "--static", "dist"], { cwd: ROOT, env: avatarEnv, label: "avatar-builder" });
  await waitFor(`${avatarUrl}api/health`, { label: "isolated Hapa Avatar Builder" });

  const electron = path.join(ROOT, "node_modules", ".bin", "electron");
  const capture = await run(electron, ["scripts/capture-stargate-interoperability-roundtrip.cjs"], {
    cwd: ROOT,
    env: {
      ...avatarEnv,
      CAPTURE_AVATAR_URL: avatarUrl,
      CAPTURE_CATALOG_URL: `${catalogUrl}/`,
      CAPTURE_OVERWIND_URL: overwindUrl,
      CAPTURE_OVERWIND_TOKEN: overwindToken,
      CAPTURE_CATALOG_TOKEN: catalogToken,
      CAPTURE_RUNTIME_ROOT: runtimeRoot,
      CAPTURE_DATABASE: database
    }
  });
  const captureOutputObserved = /"ok"\s*:\s*true/.test(capture.stdout);
  if (!captureOutputObserved) throw new Error("The isolated capture process exited without a successful evidence manifest.");
  const userAppAfter = await userAppIdentity();
  if (JSON.stringify(userAppAfter) !== JSON.stringify(userAppBefore)) throw new Error(`User app identity changed during isolated capture: ${JSON.stringify({ userAppBefore, userAppAfter })}`);
  console.log(JSON.stringify({ ok: true, schemaVersion: "hapa.stargate-interoperability-run.v1", isolated: true, database, services: { overwindUrl, catalogUrl, avatarUrl }, userAppBefore, userAppAfter, userAppTouched: false, captureOutputObserved, cleanupPending: true }, null, 2));
} finally {
  for (const child of serviceChildren.reverse()) await stopService(child);
  if (databaseCreated && database.startsWith("hapa_bw_roundtrip_")) await run("/opt/homebrew/bin/dropdb", ["--if-exists", "-h", "127.0.0.1", database], { cwd: OVERWIND_ROOT, quiet: true }).catch((error) => process.stderr.write(`Scoped database cleanup failed: ${error.message}\n`));
  if (runtimeRoot.startsWith(os.tmpdir()) && path.basename(runtimeRoot).startsWith("hapa-stargate-roundtrip-")) await fsp.rm(runtimeRoot, { recursive: true, force: true });
}
