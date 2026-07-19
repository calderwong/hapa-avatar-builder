import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const CLI = path.join(ROOT, "cli/avatar-builder.mjs");

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

test("Comment Card UI, API, and CLI share exact consent, source, and proposed-card custody", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-media-comment-parity-"));
  const port = 23200 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;
  const sourcePath = path.join(base, "source-card.json");
  const videoPath = path.join(base, "comment.webm");
  const stores = Object.fromEntries(Object.entries({ avatar: "avatar.json", kanban: "kanban.json", scene: "scene.json", item: "item.json", inventory: "inventory.json", tarot: "tarot.json", songs: "songs.json", overwind: "overwind", comments: "comments", phoneInvites: "phone-invites", subscribers: "subscribers" }).map(([key, value]) => [key, path.join(base, value)]));
  const sourceCard = {
    id: "hapa-card:test:source", cardId: "hapa-card:test:source", title: "Exact Source Card",
    cardCoreKey: "a".repeat(64), cardRevisionId: "r7", cardRecordDigest: "b".repeat(64),
    status: "published", truthStatus: "fixture"
  };
  await Promise.all([
    fsp.writeFile(sourcePath, JSON.stringify(sourceCard)),
    fsp.writeFile(videoPath, Buffer.concat([Buffer.from("1a45dfa3", "hex"), Buffer.from("hapa-comment-parity")])),
    fsp.writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(stores.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    fsp.writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [] })),
    fsp.writeFile(stores.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    fsp.writeFile(stores.tarot, JSON.stringify({ schemaVersion: "hapa.tarot-library.v1", cards: [], decks: [], sets: [], spreads: [] })),
    fsp.writeFile(stores.songs, JSON.stringify({ schemaVersion: "hapa.song-store.v1", songs: [] })),
    fsp.mkdir(stores.overwind, { recursive: true }), fsp.mkdir(stores.comments, { recursive: true }), fsp.mkdir(stores.phoneInvites, { recursive: true }), fsp.mkdir(stores.subscribers, { recursive: true })
  ]);
  const output = [];
  const server = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HAPA_AVATAR_STORE: stores.avatar, HAPA_KANBAN_STORE: stores.kanban, HAPA_SCENE_STORE: stores.scene,
      HAPA_ITEM_STORE: stores.item, HAPA_INVENTORY_STORE: stores.inventory, HAPA_TAROT_STORE: stores.tarot,
      HAPA_SONG_STORE: stores.songs, HAPA_SUBSCRIBER_DIR: stores.subscribers, HAPA_OVERWIND_DIR: stores.overwind,
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(stores.overwind, "origin.sqlite3"), HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(stores.overwind, "subscriber.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0", HAPA_OVERWIND_WARM_FULL: "0", HAPA_AVATAR_MEDIA_COMMENT_ROOT: stores.comments,
      HAPA_PHONE_BRIDGE_INVITE_DIR: stores.phoneInvites
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => output.push(String(chunk)));
  server.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit").catch(() => {}); }
    await fsp.rm(base, { recursive: true, force: true });
  });
  await waitForHealth(baseUrl, server, output);

  const created = await executeCli([
    "media-comment-create", "--api-url", baseUrl, "--source-file", sourcePath,
    "--formation-digest", "c".repeat(64), "--gate-commitment", "d".repeat(64), "--redacted-address", "hapa-gate:v1:test…withheld",
    "--actor", "human-test", "--display-name", "Human Test", "--device-id", "cli-webcam", "--consent", "--json"
  ]);
  assert.equal(created.capture.status, "consented");
  assert.equal(created.capture.sourceRef.cardId, sourceCard.cardId);
  const finalized = await executeCli([
    "media-comment-upload", "--api-url", baseUrl, "--capture-id", created.capture.captureId, "--file", videoPath,
    "--actor", "human-test", "--device-id", "cli-webcam", "--duration", "1", "--width", "16", "--height", "16", "--json"
  ]);
  assert.equal(finalized.result.card.cardType, "comment_card");
  assert.notEqual(finalized.result.card.id, sourceCard.id);
  assert.equal(finalized.result.card.minted, false);
  assert.equal(finalized.result.originUnchanged, true);
  assert.equal(finalized.result.lessonCard.cardType, "lesson_card");
  assert.equal(finalized.result.resultCard.cardType, "result_card");
  const listed = await executeCli(["media-comments", "--api-url", baseUrl, "--json"]);
  assert.equal(listed.captures[0].status, "finalized");
  assert.equal(listed.captures[0].finalized.cardId, finalized.result.card.id);

  const phoneInviteResponse = await fetch(`${baseUrl}/api/phone-bridge/invites`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session: "media-comment-parity-phone",
      cardId: "media-comment-parity-phone-card",
      title: "Physical Phone Comment",
      avatarName: "Human Test",
      sceneSnapshot: { schemaVersion: "hapa.tarot-draw.scene-snapshot.v1", id: "phone-parity-scene", title: "Phone parity scene", cards: [] },
      commentCapture: {
        sourceCard,
        context: { timecode: { startSeconds: 0, endSeconds: 8 }, formationDigest: "c".repeat(64), gateCommitment: "d".repeat(64), redactedAddress: "hapa-gate:v1:test…withheld" },
        actor: { actorId: "human-test", actorType: "human", displayName: "Human Test" },
        device: { kind: "physical_phone", deviceId: "physical-phone-parity", displayLabel: "Phone native camera" }
      }
    })
  });
  const phoneInvite = await phoneInviteResponse.json();
  assert.equal(phoneInviteResponse.status, 201, JSON.stringify(phoneInvite));
  assert.equal(phoneInvite.invite.links.certificateUrl, null);
  assert.match(phoneInvite.invite.links.nativeCaptureUrl, /^http:\/\//);
  const phoneHtmlResponse = await fetch(phoneInvite.invite.links.desktopHtmlUrl);
  const phoneHtml = await phoneHtmlResponse.text();
  assert.equal(phoneHtmlResponse.status, 200, phoneHtml.slice(0, 400));
  assert.match(phoneHtml, /accept="[^"]*video\/\*[^"]*" capture="user"/);
  assert.match(phoneHtml, /I consent to record one bounded video Comment/);
  assert.match(phoneHtml, /zero-certificate|needs no certificate/i);
  assert.doesNotMatch(phoneHtml, /install and trust|download certificate/i);

  const ui = await fsp.readFile(path.join(ROOT, "src/components/TarotDraw3DView.jsx"), "utf8");
  assert.match(ui, /Comment Card Bridge/);
  assert.match(ui, /Phone · No Certificate/);
  assert.match(ui, /Reveal Card in 3D/);
  assert.match(ui, /Source stays unchanged/);
  assert.match(ui, /spawnMediaCommentCard/);
});
