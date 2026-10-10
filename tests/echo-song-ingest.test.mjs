import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildProvisionalLyricTiming, createEchoSongIngestService } from "../server/echo-song-ingest.mjs";

test("provisional timing is monotonic, bounded, and explicitly unmatched", () => {
  const rows = buildProvisionalLyricTiming("First short line\nA longer second line here\n\nFinal line", 30);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].section_id, rows[1].section_id);
  assert.notEqual(rows[1].section_id, rows[2].section_id);
  assert.ok(rows[0].start >= 0 && rows.at(-1).end <= 30);
  for (let index = 0; index < rows.length; index += 1) {
    assert.ok(rows[index].end > rows[index].start);
    if (index) assert.ok(rows[index].start >= rows[index - 1].end);
    assert.ok(rows[index].words.every((word) => word.matched === false));
  }
});

test("inspect and register add one idempotent song with source, timing, references, prompts, and stems", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "echo-song-ingest-test-"));
  const root = path.join(temporary, "builder");
  const sourceDir = path.join(temporary, "source");
  const runtimeRoot = path.join(temporary, "runtime");
  fs.mkdirSync(path.join(root, "data", "backups"), { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "Pilot.wav"), "wav");
  fs.writeFileSync(path.join(sourceDir, "Pilot.mp3"), "mp3");
  fs.writeFileSync(path.join(sourceDir, "Pilot Stems.zip"), "zip");
  fs.writeFileSync(path.join(root, "data", "hapa-songs-store.json"), JSON.stringify({ schemaVersion: "test", songs: [{ id: "old", trackNumber: 4, lyrics: { text: "old" }, stems: [] }], audit: {} }));
  fs.writeFileSync(path.join(root, "data", "dear-papa-songbook.json"), JSON.stringify({ schemaVersion: "test", songCards: [{ id: "old", trackNumber: 4, lyrics: { text: "old" } }], summary: {} }));
  const exec = (command) => {
    if (command === "unzip") return "Pilot (Vocals).wav\nPilot (Drums).wav\nPilot (Vocals).mp3\n";
    if (command === "ffprobe") return JSON.stringify({ streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "48000", channels: 2 }], format: { duration: "42", tags: { title: "Pilot", comment: "id=891fb5e0-116d-4c18-889b-3aa514d7f971", "lyrics-eng": "Line one\nLine two" } } });
    throw new Error(`unexpected command ${command}`);
  };
  const spawn = (_command, _args, options) => {
    fs.writeSync(options.stdio[1], Buffer.from("stem"));
    return { status: 0, stderr: "" };
  };
  const service = createEchoSongIngestService({ root, runtimeRoot, exec, spawn, now: () => new Date("2026-09-16T00:00:00.000Z") });
  const inspected = service.inspect({
    sourceDir,
    songUrl: "https://suno.com/song/891fb5e0-116d-4c18-889b-3aa514d7f971",
    title: "Pilot",
    style: "spoken word, 92 BPM",
    references: [{ title: "A reference", body: "A bounded interpretation." }],
    imagePrompts: [{ referenceTitle: "A reference", generationPrompt: "Create one original full-bleed vertical card with no text." }],
  });
  assert.equal(inspected.song.trackNumber, 5);
  assert.equal(inspected.source.files.stemsZip.entries.length, 3);
  const registered = service.register(inspected.runId);
  assert.equal(registered.state, "registered");
  assert.equal(registered.outputs.stemCount, 2);
  assert.equal(registered.stages.find((stage) => stage.id === "images").status, "ready");
  const store = JSON.parse(fs.readFileSync(path.join(root, "data", "hapa-songs-store.json"), "utf8"));
  const song = store.songs.find((row) => row.title === "Pilot");
  assert.equal(store.songs.length, 2);
  assert.equal(song.stems.length, 2);
  assert.equal(song.knowledge.referenceImagePrompts.length, 1);
  assert.equal(song.lyricTimingSource.quality.qualityStatus, "provisional-needs-forced-alignment");
  service.register(inspected.runId);
  const after = JSON.parse(fs.readFileSync(path.join(root, "data", "hapa-songs-store.json"), "utf8"));
  assert.equal(after.songs.length, 2);
  fs.rmSync(temporary, { recursive: true, force: true });
});
