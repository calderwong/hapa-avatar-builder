import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROJECTION_VERSION = "hapa.overwind.avatar-builder-bootstrap.v5.avatar-loadout-mind-spines";

async function waitFor(url, child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API did not start: ${output.join("").slice(-3000)}`);
}

async function createFixture(t, { largeAvatar = false, invalidCanonicalCore = false, withProjection = false } = {}) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-api-cold-load-"));
  const paths = Object.fromEntries(Object.entries({
    avatar: "avatar-store.json",
    kanban: "kanban.json",
    scene: "scene-store.json",
    item: "item-store.json",
    inventory: "inventory-store.json",
    tarot: "tarot-store.json",
    songs: "songs.json",
    songbook: "songbook.json",
    hellWeek: "hell-week.sqlite3",
    overwind: "overwind",
    mint: "mint",
  }).map(([key, name]) => [key, path.join(base, name)]));
  const avatar = {
    id: "cold-avatar",
    schemaVersion: "hapa.avatar-card.v1",
    primaryName: "Cold Avatar",
    names: [{ name: "Cold Avatar" }],
    slots: [],
    assets: [],
    ...(largeAvatar ? { operatorNotes: "x".repeat(8 * 1024 * 1024) } : {}),
  };
  await Promise.all([
    fsp.writeFile(paths.avatar, invalidCanonicalCore ? "{invalid-avatar" : JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [avatar], teams: [] })),
    fsp.writeFile(paths.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    fsp.writeFile(paths.scene, invalidCanonicalCore ? "{invalid-scene" : JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(paths.item, invalidCanonicalCore ? "{invalid-item" : JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
    fsp.writeFile(paths.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    fsp.writeFile(paths.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-store.v1", cards: [], decks: [], sets: [] })),
    fsp.writeFile(paths.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
    fsp.writeFile(paths.songbook, JSON.stringify({ schemaVersion: "hapa.dear-papa-songbook.v1", songs: [] })),
    fsp.mkdir(paths.overwind, { recursive: true }),
    fsp.mkdir(paths.mint, { recursive: true }),
  ]);
  execFileSync("/usr/bin/sqlite3", [paths.hellWeek, `CREATE TABLE cards (
    id TEXT PRIMARY KEY, core_name TEXT, parent_id TEXT, name TEXT, media_local_path TEXT,
    thumbnail TEXT, created_at TEXT, updated_at TEXT, lore TEXT, content_text TEXT,
    metadata_json TEXT, media_kind TEXT, hellweek_run_id TEXT, is_deleted INTEGER DEFAULT 0
  );`]);

  if (withProjection) {
    const sourceFiles = [paths.avatar, paths.kanban, paths.scene, paths.item, paths.inventory];
    const files = await Promise.all(sourceFiles.map(async (filePath) => {
      const fileStat = await fsp.stat(filePath);
      return [path.resolve(filePath), fileStat.mtimeMs, fileStat.size];
    }));
    const sourceSignature = JSON.stringify({ projectionVersion: PROJECTION_VERSION, selectedAvatarId: "", includeSelectedAvatar: false, files });
    await fsp.writeFile(path.join(paths.overwind, "avatar-builder-bootstrap.json"), JSON.stringify({
      schemaVersion: "hapa.overwind.avatar-builder-bootstrap.v1",
      generatedAt: "2026-07-13T00:00:00.000Z",
      sourceSignature,
      avatars: [{ id: "compact-avatar", schemaVersion: "hapa.avatar-card.v1", primaryName: "Compact Avatar", assets: [] }],
      items: { cards: [{ id: "compact-item", schemaVersion: "hapa.item-card.v1", title: "Compact Item" }] },
      world: { scenes: [{ id: "compact-scene", title: "Compact Scene" }] },
    }));
  }

  const port = 20700 + Math.floor(Math.random() * 400);
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_STORE: paths.avatar,
      HAPA_KANBAN_STORE: paths.kanban,
      HAPA_SCENE_STORE: paths.scene,
      HAPA_ITEM_STORE: paths.item,
      HAPA_INVENTORY_STORE: paths.inventory,
      HAPA_TAROT_STORE: paths.tarot,
      HAPA_SONG_STORE: paths.songs,
      HAPA_DEAR_PAPA_SONGBOOK: paths.songbook,
      HAPA_DEV_PROTO_DB: paths.hellWeek,
      HAPA_OVERWIND_DIR: paths.overwind,
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(paths.overwind, "origin.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(paths.overwind, "subscriber.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
      HAPA_OVERWIND_WARM_FULL: "0",
      HAPA_SONG_CARD_MINT_ROOT: paths.mint,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => {});
    }
    await fsp.rm(base, { recursive: true, force: true });
  });
  const api = `http://127.0.0.1:${port}`;
  await waitFor(`${api}/api/health`, child, output);
  return { api, paths };
}

test("concurrent cold readers share one raw parse and one normalized Avatar build", async (t) => {
  const fixture = await createFixture(t, { largeAvatar: true });
  const before = await fetch(`${fixture.api}/api/health`).then((response) => response.json());
  assert.equal(before.runtime.jsonStores.rawDiskReads, 0, "startup must not preempt Echos with a full ledger/store scan");
  // Startup may legitimately warm the Avatar cache. Change the source revision
  // so every request below observes the same genuinely cold revision.
  await fsp.appendFile(fixture.paths.avatar, " ");
  const responses = await Promise.all(Array.from({ length: 16 }, () => fetch(`${fixture.api}/api/avatars?mode=index&limit=1`)));
  assert.equal(responses.every((response) => response.status === 200), true);
  await Promise.all(responses.map((response) => response.arrayBuffer()));
  const after = await fetch(`${fixture.api}/api/health`).then((response) => response.json());
  const start = before.runtime.jsonStores;
  const end = after.runtime.jsonStores;
  assert.equal(end.rawDiskReads - start.rawDiskReads, 1, JSON.stringify({ start, end }));
  assert.equal(end.normalizedBuilds - start.normalizedBuilds, 1, JSON.stringify({ start, end }));
  assert.ok(end.rawInflightHits - start.rawInflightHits >= 1, JSON.stringify({ start, end }));
});

test("Overcard catalog uses a current signed compact projection without opening canonical core stores", async (t) => {
  const fixture = await createFixture(t, { invalidCanonicalCore: true, withProjection: true });
  const response = await fetch(`${fixture.api}/api/overcard/catalog?limit=20`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hapa-catalog-core-sources"), "current-signed-overwind-projection");
  const catalog = await response.json();
  for (const entityId of ["compact-avatar", "compact-item", "compact-scene"]) {
    assert.ok(catalog.entities.some((row) => row.ref.entityId === entityId));
  }
  assert.equal(await fsp.readFile(fixture.paths.avatar, "utf8"), "{invalid-avatar");
  assert.equal(await fsp.readFile(fixture.paths.scene, "utf8"), "{invalid-scene");
  assert.equal(await fsp.readFile(fixture.paths.item, "utf8"), "{invalid-item");
});
