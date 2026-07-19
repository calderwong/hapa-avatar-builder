import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const CLI = path.join(ROOT, "cli/avatar-builder.mjs");
const hex = (character) => character.repeat(64);

function executeCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(`CLI failed (${code}): ${stderr || stdout}`)));
  });
}

async function waitForHealth(baseUrl, child, output) {
  for (let attempt = 0; attempt < 140 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Isolated Avatar Builder API did not start: ${output.join("").slice(-2500)}`);
}

test("Context Packet and Result Card have UI, API and CLI parity without a generation claim", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-context-parity-"));
  const port = 23500 + Math.floor(Math.random() * 250);
  const baseUrl = `http://127.0.0.1:${port}`;
  const cardsPath = path.join(base, "cards.json");
  const cards = [
    { id: "hapa-card:parity:one", cardRevisionId: "r3", cardCoreKey: hex("a"), cardRecordDigest: hex("b"), title: "Language Bridge", summary: "Meet a concept from two cultures.", keywords: ["empathy"] },
    { id: "hapa-card:parity:two", cardRevisionId: "r8", cardCoreKey: hex("c"), cardRecordDigest: hex("d"), title: "Wisdom Lens", summary: "Evaluate context without rewriting it.", keywords: ["wisdom"] },
  ];
  const stores = Object.fromEntries(Object.entries({ avatar: "avatar.json", kanban: "kanban.json", scene: "scene.json", item: "item.json", inventory: "inventory.json", tarot: "tarot.json", songs: "songs.json", overwind: "overwind", context: "context", subscribers: "subscribers" }).map(([key, value]) => [key, path.join(base, value)]));
  await Promise.all([
    fsp.writeFile(cardsPath, JSON.stringify(cards)),
    fsp.writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(stores.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    fsp.writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
    fsp.writeFile(stores.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    fsp.writeFile(stores.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", cards: [], decks: [], sets: [], spreads: [] })),
    fsp.writeFile(stores.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
    fsp.mkdir(stores.overwind, { recursive: true }), fsp.mkdir(stores.context, { recursive: true }), fsp.mkdir(stores.subscribers, { recursive: true })
  ]);
  const env = {
    ...process.env,
    HAPA_AVATAR_STORE: stores.avatar, HAPA_KANBAN_STORE: stores.kanban, HAPA_SCENE_STORE: stores.scene,
    HAPA_ITEM_STORE: stores.item, HAPA_INVENTORY_STORE: stores.inventory, HAPA_TAROT_STORE: stores.tarot,
    HAPA_SONG_STORE: stores.songs, HAPA_SUBSCRIBER_DIR: stores.subscribers, HAPA_OVERWIND_DIR: stores.overwind,
    HAPA_AVATAR_OVERWIND_OUTBOX: path.join(stores.overwind, "origin.sqlite3"), HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(stores.overwind, "subscriber.sqlite3"),
    HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0", HAPA_OVERWIND_WARM_FULL: "0", HAPA_AVATAR_CONTEXT_GENERATION_ROOT: stores.context,
  };
  const output = [];
  const server = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit").catch(() => {}); }
    await fsp.rm(base, { recursive: true, force: true });
  });
  await waitForHealth(baseUrl, server, output);

  const frozen = await executeCli(["context-packet-freeze", "--api-url", baseUrl, "--cards-file", cardsPath, "--formation-digest", hex("e"), "--gate-commitment", hex("f"), "--actor", "human-parity", "--display-name", "Human Parity", "--purpose", "Propose one bridge lesson.", "--json"], env);
  assert.equal(frozen.packet.evidence.length, 2);
  assert.equal(frozen.packet.authority.providerInvocation, false);
  const generated = await executeCli(["context-generate", "--api-url", baseUrl, "--packet-id", frozen.packet.packetId, "--mode", "deterministic_scaffold", "--actor", "human-parity", "--instruction", "Propose one bridge lesson.", "--json"], env);
  assert.equal(generated.result.run.generationPerformed, false);
  assert.equal(generated.result.card.contextGenerationResult.generationPerformed, false);
  assert.equal(generated.result.card.minted, false);
  const listed = await (await fetch(`${baseUrl}/api/context-generation`)).json();
  assert.equal(listed.packets[0].packetDigest, frozen.packet.packetDigest);
  assert.equal(listed.cards[0].cardRecordDigest, generated.result.card.cardRecordDigest);
  const fromCli = await executeCli(["context-packets", "--api-url", baseUrl, "--json"], env);
  assert.equal(fromCli.runs[0].runDigest, generated.result.run.runDigest);
});
