import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_DEAR_PAPA_GRAPH,
  DEFAULT_DEAR_PAPA_SOURCE,
  buildDeterministicEditorSwap,
  editionTwoFfmpegArgs,
  parseCliArgs,
  runDearPapaSongCardMintDemo,
} from "../scripts/build-dear-papa-song-card-mint-demo.mjs";

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
  && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function syntheticGraph() {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: {
      id: "dear-papa-synthetic-gate",
      title: "Dear Papa Synthetic Gate",
      durationSeconds: 2,
      lyricOverlay: { lines: [{ start: 0.1, end: 0.8, text: "Dear Papa" }] },
    },
    directorV2: { variantId: "variant:synthetic", variantHash: "synthetic-hash" },
    tracks: [
      {
        id: "track-a",
        role: "foundation",
        cards: [
          { id: "card:a:0", trackId: "track-a", startSeconds: 0, endSeconds: 1, media: { id: "media:a", title: "A" }, parameters: { opacity: 1 }, provenance: { sourceSlotId: "slot:a" } },
          { id: "card:a:1", trackId: "track-a", startSeconds: 1, endSeconds: 2, media: { id: "media:b", title: "B" }, parameters: { opacity: 1 }, provenance: { sourceSlotId: "slot:b" } },
        ],
      },
      {
        id: "track-b",
        role: "visualizer",
        cards: [
          { id: "card:b:0", trackId: "track-b", startSeconds: 0, endSeconds: 2, visualization: { sourceId: "isf:test", card: { id: "isf:test", title: "Synthetic IVF" } }, parameters: { opacity: 0.4 }, provenance: { sourceSlotId: "slot:ivf" } },
        ],
      },
    ],
  };
}

test("CLI is dry-run by default and accepts output, mint-root, and apply", () => {
  const defaults = parseCliArgs([]);
  assert.equal(defaults.apply, false);
  assert.equal(defaults.sourceVideoPath, DEFAULT_DEAR_PAPA_SOURCE);
  assert.equal(defaults.graphPath, DEFAULT_DEAR_PAPA_GRAPH);
  assert.match(defaults.sourceVideoPath, /outputs\/hyperframes-dear-papa-v2-foundation-demo\/renders\/dear-papa-foundation-production\.mp4$/u);
  assert.match(defaults.graphPath, /work\/dear-papa-stem-telemetry\/native-show-graph\.json$/u);
  assert.match(defaults.output, /outputs\/dear-papa-song-card-mint-demo$/u);
  const explicit = parseCliArgs(["--output", "./out", "--mint-root=./ledger", "--apply"]);
  assert.equal(explicit.apply, true);
  assert.equal(explicit.output, path.resolve("./out"));
  assert.equal(explicit.mintRoot, path.resolve("./ledger"));
});

test("editor edit mutates exactly one cue and ffmpeg gates visuals while stream-copying audio", () => {
  const graph = syntheticGraph();
  const before = structuredClone(graph);
  const { editedGraph, edit } = buildDeterministicEditorSwap(graph);
  assert.deepEqual(graph, before, "source graph remains untouched");
  const changed = editedGraph.tracks[0].cards.filter((card, index) => JSON.stringify(card) !== JSON.stringify(before.tracks[0].cards[index]));
  assert.equal(changed.length, 1);
  assert.equal(edit.creativeDecisionRun, false);
  assert.equal(changed[0].media.id, "media:b");
  assert.ok(changed[0].endSeconds < before.tracks[0].cards[0].endSeconds);
  const args = editionTwoFfmpegArgs({ sourceVideoPath: "e1.mp4", outputVideoPath: "e2.mp4", startSeconds: 0, endSeconds: 0.95 });
  assert.equal(args[args.indexOf("-c:a") + 1], "copy");
  assert.match(args[args.indexOf("-vf") + 1], /enable='between\(t\\,0\\,0\.95\)'/u);
});

test("dry-run performs no output or ledger writes", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-demo-dry-"));
  const source = path.join(root, "source.mp4");
  const graphPath = path.join(root, "graph.json");
  const output = path.join(root, "must-not-exist");
  const mintRoot = path.join(root, "must-not-mint");
  await fsp.writeFile(source, "dry-run only");
  await fsp.writeFile(graphPath, JSON.stringify(syntheticGraph()));
  const result = await runDearPapaSongCardMintDemo({ sourceVideoPath: source, graphPath, output, mintRoot });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.applied, false);
  await assert.rejects(fsp.access(output));
  await assert.rejects(fsp.access(mintRoot));
});

test("tiny real A/V fixture mints, retries, edits, and verifies Dear Papa Editions 1 and 2", { skip: !HAS_FFMPEG, timeout: 60_000 }, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-song-card-demo-apply-"));
  const source = path.join(root, "source.mp4");
  const graphPath = path.join(root, "graph.json");
  const output = path.join(root, "output");
  const mintRoot = path.join(root, "ledger");
  const generated = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source,
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  await fsp.writeFile(graphPath, `${JSON.stringify(syntheticGraph(), null, 2)}\n`);

  const report = await runDearPapaSongCardMintDemo({ apply: true, sourceVideoPath: source, graphPath, output, mintRoot });
  assert.equal(report.ok, true);
  assert.equal(report.head.latestEdition, 2);
  assert.equal(report.head.editionCount, 2);
  assert.equal(report.editions[0].retry.created, false);
  assert.equal(report.editions[0].retry.reason, "idempotency-replay");
  assert.notEqual(report.editions[0].sha256, report.editions[1].sha256);
  assert.equal(report.checks.editionOneImmutableAfterEditionTwo, true);
  assert.equal(report.checks.historicalTimestampPrintsPinned, true);
  assert.equal(report.historicalPrints.edition1.edition, 1);
  assert.equal(report.historicalPrints.edition2.edition, 2);
  assert.notEqual(report.historicalPrints.edition1.sourceDigest, report.historicalPrints.edition2.sourceDigest);
  assert.equal(report.checks.tamperDetectedWithoutEditionMutation, true);
  assert.equal(report.checks.staleRevisionFailsClosed, true);
  assert.equal(report.checks.invalidMediaFailsClosed, true);
  assert.equal(report.screenshots.captured, false);
  assert.equal(report.screenshots.placeholdersWritten, false);
  assert.equal(JSON.parse(await fsp.readFile(path.join(output, "production-gate-report.json"), "utf8")).ok, true);
});
