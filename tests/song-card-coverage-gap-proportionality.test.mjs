import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";
import { SongCardMintLedger } from "../server/song-card-mint-ledger.mjs";
import { compileSongCardAppearanceIndex } from "../src/domain/song-card-mint.js";

const PROBE = { durationSeconds: 10, hasVideo: true, hasAudio: true, decodeOk: true, videoCodec: "h264", audioCodec: "aac", width: 1280, height: 720 };
const truth = { ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 1 };

function graph({ durationSeconds, cardEndSeconds }) {
  return {
    song: { id: "dear-papa", title: "Dear Papa", durationSeconds },
    tracks: [
      { id: "a", role: "foundation", cards: [{ id: "a0", startSeconds: 0, endSeconds: cardEndSeconds, media: { id: "media-a", title: "media-a", contentHash: "media-a" } }] },
    ],
    directorV2: { treatmentId: "treatment:one", variantId: "variant:one", variantHash: "media-a" },
  };
}

async function openController(t, base, { durationSeconds, cardEndSeconds }) {
  await fsp.mkdir(path.join(base, "renders"), { recursive: true });
  const master = path.join(base, "renders/master.mp4");
  await fsp.writeFile(master, "physical-master");
  const poster = path.join(base, "renders/poster.jpg");
  await fsp.writeFile(poster, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  const root = path.join(base, "mint");
  const controller = new SongCardMintController({ root, ledger: new SongCardMintLedger({ root, allowedSourceRoots: [path.join(base, "renders")], mediaProbe: async () => PROBE }) });
  await controller.initialize();
  return {
    controller,
    master,
    poster,
    plan: await controller.plan("dear-papa", {
      project: { song_id: "dear-papa", song_title: "Dear Papa", duration: durationSeconds },
      showGraph: graph({ durationSeconds, cardEndSeconds }),
      renderMasterPath: master,
      posterPath: poster,
      rendererTruth: truth,
    }),
  };
}

test("a sub-beat coverage sliver (duration rounding) is recorded as non-blocking evidence, not a mint blocker", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-coverage-sliver-"));
  t.after(async () => { await fsp.rm(base, { recursive: true, force: true }); });
  // Card coverage ends at 10.000s while the song runs to 10.040s: a 40ms tail
  // that no card covers, exactly the shape of the Green mint preflight failure.
  const { plan } = await openController(t, base, { durationSeconds: 10.04, cardEndSeconds: 10 });
  assert.equal(plan.hardBlockers.length, 0, `small slivers must not block minting: ${JSON.stringify(plan.hardBlockers)}`);
  assert.equal(plan.status, "ready");
  assert.equal(plan.coverageGapsNonBlocking.length, 1);
  assert.equal(plan.coverageGapsNonBlocking[0].endMs - plan.coverageGapsNonBlocking[0].startMs, 40);
  assert.equal(plan.appearanceSummary.gaps, 1, "the sliver remains visible as evidence in the plan");
});

test("a genuine coverage hole over the sliver threshold still blocks minting", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-coverage-hole-"));
  t.after(async () => { await fsp.rm(base, { recursive: true, force: true }); });
  // Card coverage ends one full second before the song: a real missing-provenance
  // window must keep failing closed.
  const { plan } = await openController(t, base, { durationSeconds: 10, cardEndSeconds: 9 });
  const gapBlocker = plan.hardBlockers.find((row) => row.code === "temporal-card-coverage-gap");
  assert.ok(gapBlocker, "a 1s coverage hole remains a hard blocker");
  assert.equal(gapBlocker.ranges.length, 1);
  assert.equal(gapBlocker.ranges[0].endMs - gapBlocker.ranges[0].startMs, 1000);
  assert.equal(plan.coverageGapsNonBlocking.length, 0);
});

async function openLedger(t, base, probeDurationSeconds) {
  const renders = path.join(base, "renders");
  await fsp.mkdir(renders, { recursive: true });
  const master = path.join(renders, "master.mp4");
  await fsp.writeFile(master, "physical-master");
  const poster = path.join(renders, "poster.jpg");
  await fsp.writeFile(poster, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]));
  const root = path.join(base, "mint");
  const probe = { ...PROBE, durationSeconds: probeDurationSeconds };
  const ledger = new SongCardMintLedger({ root, allowedSourceRoots: [renders], mediaProbe: async () => probe });
  await ledger.initialize();
  return { ledger, master, poster, renders };
}

test("ledger preflight records a sub-beat tail as non-blocking evidence instead of sealing failure", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-ledger-sliver-"));
  t.after(async () => { await fsp.rm(base, { recursive: true, force: true }); });
  // The rendered master probes to 10.040s while the final appearance ends at
  // 10.000s: a 40ms tail, exactly the shape that blocked the Green mint.
  const { ledger, master, poster } = await openLedger(t, base, 10.04);
  const showGraph = graph({ durationSeconds: 10.04, cardEndSeconds: 10 });
  const preflight = await ledger.preflight({
    headId: "song-card:dear-papa",
    sourceRevision: "sha256:test",
    sourceVideoPath: master,
    posterPath: poster,
    rendererTruth: truth,
    publishStatus: "private-demo",
    timestampIndex: compileSongCardAppearanceIndex({ showGraph }),
  });
  assert.ok(preflight, "a 40ms rendered tail must not fail the immutable sealer");
});

test("ledger preflight still fails closed on a genuine multi-second coverage hole", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-ledger-hole-"));
  t.after(async () => { await fsp.rm(base, { recursive: true, force: true }); });
  const { ledger, master, poster } = await openLedger(t, base, 10);
  const showGraph = graph({ durationSeconds: 10, cardEndSeconds: 9 });
  await assert.rejects(ledger.preflight({
    headId: "song-card:dear-papa",
    sourceRevision: "sha256:test",
    sourceVideoPath: master,
    posterPath: poster,
    rendererTruth: truth,
    publishStatus: "private-demo",
    timestampIndex: compileSongCardAppearanceIndex({ showGraph }),
  }), (error) => error.code === "TEMPORAL_COVERAGE_FAILED" || String(error.message).includes("TEMPORAL_COVERAGE_FAILED"));
});
