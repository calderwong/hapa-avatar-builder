import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ECHO_CONDENSED_REFERENCE_MAX_BYTES,
  ECHO_CONDENSED_REFERENCE_SCHEMA,
  ECHO_MASTER_REFERENCE_SCHEMA,
  buildEchoAlbumCondensedReference,
  buildEchoAlbumMasterReference,
} from "../src/domain/echo-master-reference-export.js";
import { runEchoMasterReferenceExport } from "../scripts/export-echo-master-reference.mjs";

const FIXED_TIME = "2026-07-29T12:00:00.000Z";

function fixture() {
  const songbook = {
    schemaVersion: "hapa.dear-papa-songbook.v1",
    updatedAt: "2026-07-29T11:00:00.000Z",
    album: { id: "dear-papa-album", title: "Dear Papa", author: "Calder" },
    songCards: [
      {
        id: "song-one",
        title: "First Song",
        trackNumber: 1,
        author: "Calder",
        lyrics: { status: "verified", text: "First line\nSecond line", sha256: "abc123" },
        sections: [{ id: "verse", start: 0, end: 8 }],
        beats: [{ t: 0, strength: 1 }],
        vocalDensity: [{ start: 0, end: 8, vocal_density: "high" }],
        energyCurves: { loudness: [0.2, 0.8] },
        sync: { stemCount: 1, localPath: "/private/source/song-one.mp3" },
        lore: { summary: "A first-song summary." },
      },
      {
        id: "song-two",
        title: "Second Song",
        trackNumber: 2,
        lyrics: { status: "verified", text: "Another lyric", sha256: "def456" },
      },
    ],
  };
  const songStore = {
    schemaVersion: "hapa.songs.store.v1",
    updatedAt: "2026-07-29T11:30:00.000Z",
    album: {
      id: "dear-papa-album",
      title: "Dear Papa",
      aliases: ["Dear Papa", "Echo Album"],
      activeProjection: { id: "echo-album", title: "Echo Album" },
    },
    songs: [
      {
        id: "song-one",
        title: "First Song",
        lyrics: { status: "verified", text: "First line\nSecond line", sha256: "abc123" },
        lyricTimings: [{ line: 1, start: 0, end: 2 }],
        stems: [{ id: "stem-one", kind: "Vocals", localPath: "/private/source/stem-one.wav" }],
        contextLayers: [],
        contextualLayers: [{ id: "context-one", referenceIds: ["reference-one"] }],
        referenceConnectors: [{
          id: "connector-one",
          referenceId: "reference-one",
          relationType: "alludes-to",
          target: { lyricText: "First line", lineStart: 1 },
          evidence: { score: 0.95, classification: "confirmed-direct" },
          provenance: { reviewStatus: "human-reviewed" },
        }],
        attribution: { author: "Calder" },
      },
      { id: "song-two", title: "Second Song", lyrics: { text: "Another lyric", sha256: "def456" } },
    ],
    referenceCatalog: [{
      id: "reference-one",
      title: "Reference One",
      kind: "work",
      source: { url: "https://example.test/reference-one" },
      reviewStatus: "source-backed",
    }],
    referenceGraphEdges: [{
      id: "reference-one:resonates:reference-two",
      fromReferenceId: "reference-one",
      toReferenceId: "reference-two",
      relationType: "resonates-with",
      score: 0.7,
    }],
  };
  const referenceRun = {
    schemaVersion: "hapa.echo-reference-run.v1",
    runId: "reference-run-one",
    runHash: "fnv1a:run",
    generatedAt: "2026-07-29T11:45:00.000Z",
    cards: [{
      id: "reference:reference-two",
      title: "Reference Two",
      occurrences: [{ songId: "song-two", lineStart: 1 }],
      authority: { reviewStatus: "pending-review", canonStatus: "non-canon" },
    }],
    graph: {
      schemaVersion: "hapa.reference-graph.v1",
      graphHash: "fnv1a:graph",
      edges: [{
        id: "reference-two:occurs-in:song-two",
        fromId: "reference:reference-two",
        fromType: "reference-card",
        toId: "song:song-two",
        toType: "song",
        relationType: "occurs-in",
        status: "pending-review",
        confidence: 0.8,
        rationale: "Reference Two occurs in the lyric.",
      }],
    },
    packet: { schemaVersion: "hapa.echo-reference-packet.v1", policy: { publicActivation: false } },
    unresolved: [{ id: "unresolved-one", songId: "song-two" }],
  };
  const observability = {
    schemaVersion: "hapa.echo-reference-observability.v1",
    graph: { nodes: 4, edges: 3 },
    privacy: { privateClueContentExposed: false },
  };
  return { songbook, songStore, referenceRun, observability };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("Master Reference export is self-contained, cross-linked, complete, and deterministic", () => {
  const input = fixture();
  const first = buildEchoAlbumMasterReference(input, { generatedAt: FIXED_TIME });
  const second = buildEchoAlbumMasterReference(input, { generatedAt: FIXED_TIME });

  assert.equal(first.schemaVersion, ECHO_MASTER_REFERENCE_SCHEMA);
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.manifest.counts.songs, 2);
  assert.equal(first.manifest.counts.songsWithLyrics, 2);
  assert.equal(first.manifest.counts.uniqueReferences, 2);
  assert.equal(first.manifest.counts.totalAssociations, 3);
  assert.equal(first.manifest.associationIntegrity.allInternalLinksResolved, true);
  assert.match(first.markdown, /# Echo Album — Master Reference File/);
  assert.match(first.markdown, /<a id="song-song-one"><\/a>/);
  assert.match(first.markdown, /\[First Song\]\(#song-song-one\)/);
  assert.match(first.markdown, /First line\nSecond line/);
  assert.match(first.markdown, /"lyricTimings": \[/);
  assert.match(first.markdown, /"beats": \[/);
  assert.match(first.markdown, /"referenceId": "reference-one"/);
  assert.match(first.markdown, /<a id="reference-reference-one"><\/a>/);
  assert.match(first.markdown, /\[Reference Two\]\(#reference-reference-two\)/);
  assert.match(first.markdown, /Complete association records/);
  assert.match(first.markdown, /"privateClueContentExposed": false/);
  assert.match(first.markdown, /\/private\/source\/stem-one\.wav/);

  const changed = buildEchoAlbumMasterReference({
    ...input,
    songbook: { ...input.songbook, updatedAt: "2026-07-29T12:01:00.000Z" },
  }, { generatedAt: FIXED_TIME });
  assert.notEqual(changed.manifest.inputDigest, first.manifest.inputDigest);
});

test("condensed profile keeps every title and lyric plus curated references under 3 MB", () => {
  const result = buildEchoAlbumCondensedReference(fixture(), { generatedAt: FIXED_TIME });

  assert.equal(result.schemaVersion, ECHO_CONDENSED_REFERENCE_SCHEMA);
  assert.equal(result.manifest.counts.songs, 2);
  assert.equal(result.manifest.counts.songsWithLyrics, 2);
  assert.equal(result.manifest.counts.songReferenceConnectors, 1);
  assert.equal(result.manifest.counts.curatedReferenceEdges, 1);
  assert.ok(result.manifest.bytes < ECHO_CONDENSED_REFERENCE_MAX_BYTES);
  assert.match(result.markdown, /# Echo Album — Lyrics & Main References/);
  assert.match(result.markdown, /First line\nSecond line/);
  assert.match(result.markdown, /Another lyric/);
  assert.match(result.markdown, /\[Reference One\]\(#reference-reference-one\)/);
  assert.match(result.markdown, /reference-two/);
  assert.match(result.markdown, /Reference Atlas candidate cards and mined graph edges/);
  assert.doesNotMatch(result.markdown, /\/private\/source\//);
  assert.doesNotMatch(result.markdown, /"beats": \[/);
  assert.throws(
    () => buildEchoAlbumCondensedReference(fixture(), { generatedAt: FIXED_TIME, maxBytes: 100 }),
    /above the 100-byte limit/
  );
});

test("CLI writes one Markdown snapshot atomically without changing source stores", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echo-master-reference-"));
  const input = fixture();
  const paths = {
    songbook: path.join(root, "songbook.json"),
    songStore: path.join(root, "song-store.json"),
    referenceRun: path.join(root, "reference-run.json"),
    observability: path.join(root, "observability.json"),
    out: path.join(root, "exports", "master.md"),
    condensedOut: path.join(root, "exports", "condensed.md"),
  };
  await Promise.all([
    writeFile(paths.songbook, JSON.stringify(input.songbook)),
    writeFile(paths.songStore, JSON.stringify(input.songStore)),
    writeFile(paths.referenceRun, JSON.stringify(input.referenceRun)),
    writeFile(paths.observability, JSON.stringify(input.observability)),
  ]);
  const before = await Promise.all(Object.values(paths).slice(0, 4).map(async (file) => sha256(await readFile(file))));
  const receipt = await runEchoMasterReferenceExport({
    songbook: paths.songbook,
    "song-store": paths.songStore,
    "reference-run": paths.referenceRun,
    observability: paths.observability,
    out: paths.out,
    "generated-at": FIXED_TIME,
  });
  const markdown = await readFile(paths.out, "utf8");
  const after = await Promise.all(Object.values(paths).slice(0, 4).map(async (file) => sha256(await readFile(file))));

  assert.deepEqual(after, before);
  assert.equal(receipt.destination, paths.out);
  assert.equal(receipt.sha256, sha256(markdown));
  assert.equal(receipt.counts.songs, 2);
  assert.match(markdown, /End of export `echo-master-reference:/);

  const condensedReceipt = await runEchoMasterReferenceExport({
    songbook: paths.songbook,
    "song-store": paths.songStore,
    "reference-run": paths.referenceRun,
    observability: paths.observability,
    out: paths.condensedOut,
    condensed: true,
    "generated-at": FIXED_TIME,
  });
  const condensedMarkdown = await readFile(paths.condensedOut, "utf8");
  assert.ok(condensedReceipt.bytes < ECHO_CONDENSED_REFERENCE_MAX_BYTES);
  assert.match(condensedMarkdown, /Echo Album — Lyrics & Main References/);
  assert.match(condensedMarkdown, /First line\nSecond line/);
});

test("Echo workbench exposes the managed Markdown download route", async () => {
  const [ui, api] = await Promise.all([
    readFile(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /data-testid="echo-master-reference-export"/);
  assert.match(ui, /data-testid="echo-condensed-reference-export"/);
  assert.match(ui, /profile=condensed/);
  assert.match(ui, /\/api\/echos\/master-reference/);
  assert.match(ui, /echo-album-master-reference\.md/);
  assert.match(api, /Content-Type": "text\/markdown; charset=utf-8"/);
  assert.match(api, /buildEchoAlbumMasterReference/);
  assert.match(api, /"Cache-Control": "no-store"/);
  assert.match(api, /buildEchoAlbumCondensedReference/);
  assert.match(api, /"X-Hapa-Export-Profile"/);
  const cli = await readFile(new URL("../scripts/export-echo-master-reference.mjs", import.meta.url), "utf8");
  assert.match(cli, /referenceStore\.currentRun\(\)/);
  assert.match(cli, /buildEchoReferenceObservability\(currentRun/);
});
