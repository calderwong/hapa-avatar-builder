import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

async function waitForHealth(baseUrl, child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Isolated Avatar Builder API did not start: ${output.join("").slice(-2_500)}`);
}

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["cli/avatar-builder.mjs", ...args], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`CLI failed (${code}): ${stderr || stdout}`));
      else resolve(JSON.parse(stdout));
    });
  });
}

test("UI/API/CLI custody spine creates one core lazily and returns the same receipt", async (t) => {
  // Spawn graph: this test owns one isolated API child and at most one sequential
  // CLI child. Both use fixed file entry points, shell=false, depth=1, and the API
  // is terminated in the test cleanup boundary.
  const root = await mkdtemp(path.join(tmpdir(), "hapa-card-custody-parity-"));
  const cardPath = path.join(root, "card.json");
  const overwind = path.join(root, "overwind");
  const custody = path.join(root, "card-custody");
  await mkdir(overwind, { recursive: true });
  await writeFile(cardPath, JSON.stringify({ id: "parity-card", title: "Parity Card", summary: "Created only when explicitly used." }));
  const stores = {
    avatar: path.join(root, "avatar-store.json"),
    kanban: path.join(root, "kanban.json"),
    scene: path.join(root, "scene-store.json"),
    item: path.join(root, "item-store.json"),
    inventory: path.join(root, "inventory-store.json"),
    tarot: path.join(root, "tarot-store.json"),
    songs: path.join(root, "song-store.json"),
  };
  await Promise.all([
    writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    writeFile(stores.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
    writeFile(stores.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    writeFile(stores.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", cards: [], decks: [], sets: [], spreads: [] })),
    writeFile(stores.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
  ]);

  const port = 22200 + Math.floor(Math.random() * 250);
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = "card-custody-parity-test-token";
  const env = {
    ...process.env,
    HAPA_AVATAR_ADMIN_TOKEN: adminToken,
    HAPA_AVATAR_STORE: stores.avatar,
    HAPA_KANBAN_STORE: stores.kanban,
    HAPA_SCENE_STORE: stores.scene,
    HAPA_ITEM_STORE: stores.item,
    HAPA_INVENTORY_STORE: stores.inventory,
    HAPA_TAROT_STORE: stores.tarot,
    HAPA_SONG_STORE: stores.songs,
    HAPA_OVERWIND_DIR: overwind,
    HAPA_AVATAR_OVERWIND_OUTBOX: path.join(overwind, "origin.sqlite3"),
    HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(overwind, "subscriber.sqlite3"),
    HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
    HAPA_OVERWIND_WARM_FULL: "0",
    HAPA_AVATAR_CARD_CUSTODY_ROOT: custody,
  };
  const output = [];
  const api = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", (chunk) => output.push(String(chunk)));
  api.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (api.exitCode === null) {
      const exited = once(api, "exit").catch(() => {});
      api.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
      if (api.exitCode === null) {
        api.kill("SIGKILL");
        await once(api, "exit").catch(() => {});
      }
    }
    await rm(root, { recursive: true, force: true });
  });

  await waitForHealth(baseUrl, api, output);
  const empty = await fetch(`${baseUrl}/api/cards/custody`).then((response) => response.json());
  assert.equal(empty.cardCount, 0);

  const first = await runCli([
    "card-custody-ensure", "--file", cardPath, "--actor", "calder", "--api-url", baseUrl, "--json",
  ], env);
  assert.equal(first.created, true);
  assert.equal(first.card.custody.hypercoreAppended, true);
  assert.equal(first.card.custody.minted, false);

  const status = await runCli([
    "card-custody-status", "--card-id", "parity-card", "--api-url", baseUrl, "--json",
  ], env);
  assert.deepEqual(status.receipt, first.receipt);

  const replay = await runCli([
    "card-custody-ensure", "--file", cardPath, "--actor", "calder", "--api-url", baseUrl, "--json",
  ], env);
  assert.equal(replay.created, false);
  assert.deepEqual(replay.receipt, first.receipt);
});
