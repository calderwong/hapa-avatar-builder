import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPreviewRecordingStore } from "../server/preview-recording-store.mjs";
import { attachScoreDustLoop, parseLoopAttachment } from "../server/echo-score-dust-loops.mjs";
import { addTarotCard, createTarotStore, normalizeTarotStore } from "../src/domain/tarot.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048, 7)]);

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-loop-"));
  const mediaDir = path.join(root, "media"), recordings = createPreviewRecordingStore({ mediaRoot: path.join(mediaDir, "echo-preview-recordings") });
  const record = await recordings.add({ buffer: webm, mimeType: "video/webm", metadata: { songId: "song-trip", projectTitle: "Score Dust · 8 s seamless loop from playhead" } });
  let tarot = addTarotCard(createTarotStore(), { title: "The Signal", asset: { id: "img-1", type: "image", uri: "/media/signal.png", name: "signal.png" } });
  let songs = { songs: [{ id: "song-card-trip", songId: "song-trip", title: "Trip", media: [] }] };
  const deps = { recordings, mediaDir, tarot: { read: async () => tarot, write: async (v) => { tarot = v; } }, songs: { read: async () => songs, write: async (v) => { songs = v; } } };
  return { root, mediaDir, record, deps, state: () => ({ tarot, songs }) };
}

test("a loop export attaches to a Tarot card's loop videos and to a Song Card's media", async () => {
  const f = await fixture();
  try {
    const cardId = f.state().tarot.cards[0].id, receipt = { scoreFingerprint: "fnv1a:1", seed: 4, loopBridgeSeconds: 1.5, durationSeconds: 8, media: { drawn: 3 } };
    const tarot = await attachScoreDustLoop(f.deps, { recordingId: f.record.id, target: { kind: "tarot", cardId }, receipt });
    assert.equal(tarot.loops, 1);
    assert.equal(tarot.asset.uri, `/media/score-dust-loops/${f.record.id}.webm`);
    assert.ok(tarot.asset.tags.includes("tarot-loop") && tarot.asset.tags.includes("score-dust-loop"));
    assert.equal(tarot.asset.metadata.loopBridgeSeconds, 1.5);
    assert.equal(tarot.asset.metadata.media, undefined, "only flat receipt fields are kept");
    assert.deepEqual(fs.readFileSync(path.join(f.mediaDir, "score-dust-loops", `${f.record.id}.webm`)), webm, "the file is copied into the public media root");
    const card = normalizeTarotStore(f.state().tarot).cards.find((c) => c.id === cardId);
    assert.equal(card.assets.filter((a) => a.type === "video").length, 1);
    assert.equal(card.asset.type, "image", "the card face stays the image");
    assert.equal((await attachScoreDustLoop(f.deps, { recordingId: f.record.id, target: { kind: "tarot", cardId } })).loops, 1, "attaching again replaces, never duplicates");
    const song = await attachScoreDustLoop(f.deps, { recordingId: f.record.id, target: { kind: "song", songId: "song-trip" } });
    assert.equal(song.asset.role, "score-dust-loop");
    assert.equal(f.state().songs.songs[0].media.length, 1);
    await assert.rejects(attachScoreDustLoop(f.deps, { recordingId: f.record.id, target: { kind: "tarot", cardId: "nope" } }), (e) => e.statusCode === 404);
    await assert.rejects(attachScoreDustLoop(f.deps, { recordingId: "missing-recording-1", target: { kind: "song", songId: "song-trip" } }), (e) => e.statusCode === 404);
    assert.throws(() => parseLoopAttachment({ recordingId: "../../etc", target: { kind: "song", songId: "x" } }), (e) => e.statusCode === 400);
    assert.throws(() => parseLoopAttachment({ recordingId: f.record.id, target: { kind: "deck" } }), (e) => e.statusCode === 400);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("the CLI attaches through the same module and backs up the store first", async () => {
  const f = await fixture();
  try {
    const tarotPath = path.join(f.root, "tarot-store.json");
    fs.writeFileSync(tarotPath, JSON.stringify(f.state().tarot));
    const cardId = f.state().tarot.cards[0].id;
    const env = { ...process.env, HAPA_MEDIA_DIR: f.mediaDir, HAPA_TAROT_STORE: tarotPath, HAPA_SONG_STORE: path.join(f.root, "songs.json") };
    const before = fs.existsSync(path.join(repo, "data/backups")) ? fs.readdirSync(path.join(repo, "data/backups")) : [];
    const out = JSON.parse(execFileSync(process.execPath, [path.join(repo, "cli/score-dust.mjs"), "attach-loop", f.record.id, `--tarot=${cardId}`, "--title=Signal loop"], { env, encoding: "utf8" }));
    assert.equal(out.ok, true);
    assert.equal(out.data.asset.name, "Signal loop");
    const written = normalizeTarotStore(JSON.parse(fs.readFileSync(tarotPath, "utf8")));
    assert.equal(written.cards[0].assets.filter((a) => a.type === "video").length, 1);
    const added = fs.readdirSync(path.join(repo, "data/backups")).filter((name) => !before.includes(name));
    assert.equal(added.length, 1);
    for (const name of added) fs.rmSync(path.join(repo, "data/backups", name));
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
