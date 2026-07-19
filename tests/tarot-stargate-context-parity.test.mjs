import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STARGATE_FORMATION_SCHEMA,
  STARGATE_PROTOCOL_VERSION,
  STARGATE_PUBLIC_DEMO_SECRET,
  buildPublicDemoGateCards,
  deriveStargate,
  resolveStargateCardIdentity
} from "../src/domain/tarot-stargate-derivation.js";

function sourceFixture() {
  const cards = buildPublicDemoGateCards();
  const formation = {
    schemaVersion: STARGATE_FORMATION_SCHEMA,
    purposeCode: "build-week-domino",
    members: cards.map((card, index) => resolveStargateCardIdentity(card, { flipped: false }, index).member)
  };
  const stargate = deriveStargate({ formation, protocolVersion: STARGATE_PROTOCOL_VERSION, privacyScope: "invite_only", cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET });
  const snapshot = {
    schemaVersion: "hapa.tarot-draw.scene-snapshot.v1",
    id: "parity-return-scene",
    title: "Parity Return Scene",
    createdAt: "2026-07-18T00:00:00.000Z",
    avatarName: "Hapa",
    settings: { layoutId: "bella" },
    camera: { position: { x: 0, y: 3.18, z: 6.42 }, target: { x: 0, y: 0.86, z: -0.58 }, fov: 46 },
    counts: { cards: cards.length, locked: 0, field: cards.length, skippedTransient: 0 },
    cards: cards.map((card, index) => ({ index, zone: "field", cardId: card.id, title: card.title, card, position: { x: index - 1.5, y: 0.46, z: 0.24 }, rotation: { pitch: 0.58, yaw: 0, roll: 0, pitchOffset: 0, angleOffset: 0 }, stackLayer: 0, placedAt: index, focusProgress: 0, scale: 1, locked: false }))
  };
  const sceneCard = { id: snapshot.id, title: snapshot.title, cardType: "reference_card", status: "draft", drawScene: { schemaVersion: "hapa.tarot-draw.scene-card.v1", snapshotId: snapshot.id }, sceneSnapshot: snapshot, enrichment: { media: { sceneSnapshot: snapshot } } };
  return { sceneCard, stargate };
}

function executeCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["cli/avatar-builder.mjs", ...args], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`CLI failed (${code}): ${stderr || stdout}`));
      else resolve(JSON.parse(stdout));
    });
  });
}

async function waitForHealth(url, child, output) {
  for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(`${url}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Isolated API did not start: ${output.join("").slice(-2500)}`);
}

test("UI contract core, API, and CLI project the same safe proposed Card and disconnected restore", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-context-parity-"));
  const scenePath = path.join(base, "scene-card.json");
  const gatePath = path.join(base, "derived-gate.json");
  const cardPath = path.join(base, "context-card.json");
  const stores = {
    avatar: path.join(base, "avatar-store.json"),
    kanban: path.join(base, "kanban.json"),
    scene: path.join(base, "scene-store.json"),
    item: path.join(base, "item-store.json"),
    inventory: path.join(base, "inventory-store.json"),
    tarot: path.join(base, "tarot-store.json"),
    songs: path.join(base, "song-store.json"),
    overwind: path.join(base, "overwind")
  };
  const fixture = sourceFixture();
  await Promise.all([
    fsp.writeFile(scenePath, JSON.stringify(fixture.sceneCard)),
    fsp.writeFile(gatePath, JSON.stringify(fixture.stargate)),
    fsp.writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(stores.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    fsp.writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
    fsp.writeFile(stores.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    fsp.writeFile(stores.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", cards: [], decks: [], sets: [], spreads: [] })),
    fsp.writeFile(stores.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
    fsp.mkdir(stores.overwind, { recursive: true })
  ]);
  const cliCard = await executeCli(["stargate-context-card", "--scene-file", scenePath, "--stargate-file", gatePath, "--actor", "api-client", "--json"]);
  await fsp.writeFile(cardPath, JSON.stringify(cliCard));
  const cliRestore = await executeCli(["stargate-context-restore", "--file", cardPath, "--json"]);
  assert.equal(cliRestore.connected, false);
  assert.equal(cliRestore.requiresFreshGatePass, true);

  const port = 21900 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_STORE: stores.avatar,
      HAPA_KANBAN_STORE: stores.kanban,
      HAPA_SCENE_STORE: stores.scene,
      HAPA_ITEM_STORE: stores.item,
      HAPA_INVENTORY_STORE: stores.inventory,
      HAPA_TAROT_STORE: stores.tarot,
      HAPA_SONG_STORE: stores.songs,
      HAPA_OVERWIND_DIR: stores.overwind,
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(stores.overwind, "origin.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(stores.overwind, "subscriber.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
      HAPA_OVERWIND_WARM_FULL: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
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
  await waitForHealth(baseUrl, child, output);
  const previewResponse = await fetch(`${baseUrl}/api/tarot/stargate/context-card/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...fixture, origin: { nodeId: "hapa-avatar-builder", actorId: "api-client" } })
  });
  const previewText = await previewResponse.text();
  assert.equal(previewResponse.status, 200, previewText);
  const preview = JSON.parse(previewText);
  assert.equal(preview.card.id, cliCard.id);
  assert.equal(preview.card.enrichment.media.stargateContext.contextDigest, cliCard.enrichment.media.stargateContext.contextDigest);
  assert.equal(preview.persisted, false);
  assert.equal(preview.connected, false);
  const restoreResponse = await fetch(`${baseUrl}/api/tarot/stargate/context-card/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card: preview.card })
  });
  assert.equal(restoreResponse.status, 200);
  const apiRestore = await restoreResponse.json();
  assert.deepEqual(apiRestore, cliRestore);
});
