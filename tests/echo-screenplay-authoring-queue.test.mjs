import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { projectEchoScreenplayAuthoringQueue } from "../src/domain/echo-screenplay-authoring-queue.js";
import { run } from "../scripts/echo-screenplay-authoring-queue.mjs";

function count(songId, ordinal, { prompt = "missing", screenplayHash = null, imageQuest = "blocked_by_prompt", image = "missing", video = "blocked_by_keyframe" } = {}) {
  const id = `${songId}-count-${String(ordinal).padStart(4, "0")}`;
  return {
    id,
    songId,
    countOrdinal: ordinal,
    timingStatus: "ready",
    lanes: {
      prompt: { artifact: { state: prompt, ...(screenplayHash ? { contentHash: `prompt-${ordinal}`, screenplayRef: { screenplayHash } } : {}) }, quest: { status: prompt === "ready" ? "complete" : "open" } },
      image: { artifact: { state: image }, quest: { status: imageQuest, ...(imageQuest !== "blocked_by_prompt" ? { inputHash: `prompt-${ordinal}` } : {}) } },
      video: { artifact: { state: "missing" }, quest: { status: video } },
    },
  };
}

const ids = (songId, total = 2) => Array.from({ length: total }, (_, index) => `${songId}-count-${String(index + 1).padStart(4, "0")}`);
const fixtureHash = `sha256:${"a".repeat(64)}`;
const packet = (songId, countIds) => ({ kind: "packet", songId, file: `${songId}.packet.json`, payload: { fourCounts: countIds.map((id) => ({ id })) }, readable: true });
const screenplay = (songId, countIds, extra = {}) => ({ kind: "screenplay", songId, file: `${songId}.screenplay.json`, payload: { songId, sequencePlan: [{ counts: countIds.map((countId) => ({ countId })) }], authoringProvenance: extra.authoringProvenance }, readable: true, finalized: Boolean(extra.finalized), screenplayHash: extra.screenplayHash || null, rejected: Boolean(extra.rejected), validationError: extra.validationError || null });

test("projection reports every lifecycle state with exact source-backed coverage", () => {
  const songs = ["missing", "packet", "partial", "finalize", "review", "approved", "staged", "active", "done"];
  const process = { processId: "p", status: "paused", events: [{ type: "song-screenplay-prompts-imported", songId: "staged" }], counts: songs.flatMap((songId) => {
    if (songId === "staged") return [count(songId, 1, { prompt: "ready", screenplayHash: "sha256:staged" }), count(songId, 2, { prompt: "ready", screenplayHash: "sha256:staged" })];
    if (songId === "active") return [count(songId, 1, { prompt: "ready", screenplayHash: "sha256:active", imageQuest: "open" }), count(songId, 2, { prompt: "ready", screenplayHash: "sha256:active" })];
    if (songId === "done") return [count(songId, 1, { image: "keyframe_exists", imageQuest: "complete", video: "held" }), count(songId, 2, { image: "keyframe_exists", imageQuest: "complete", video: "held" })];
    return [count(songId, 1), count(songId, 2)];
  }) };
  const authoring = { artifactHash: "sha256:author", agentTaskName: "writer", attestation: { attestedBy: "writer" } };
  const artifacts = [
    packet("packet", ids("packet")),
    packet("partial", ids("partial")), screenplay("partial", ids("partial", 1)),
    packet("finalize", ids("finalize")), screenplay("finalize", ids("finalize")),
    packet("review", ids("review")), screenplay("review", ids("review"), { finalized: true, screenplayHash: "sha256:review", authoringProvenance: authoring }),
    packet("approved", ids("approved")), screenplay("approved", ids("approved"), { finalized: true, screenplayHash: "sha256:approved", authoringProvenance: authoring }),
    { kind: "approval", file: "approved.review.json", payload: { status: "approved", reviewType: "independent_screenplay_review", reviewedBy: "reviewer", reviewedAt: "2026-01-01T00:00:00Z", screenplayHash: "sha256:approved", authoringArtifactHash: "sha256:author" } },
  ];
  const report = projectEchoScreenplayAuthoringQueue({ process, artifacts, generatedAt: "2026-01-01T00:00:00Z" });
  assert.deepEqual(Object.fromEntries(report.rows.map((row) => [row.songId, row.state])), {
    active: "image_activation_partial",
    approved: "approved",
    done: "complete",
    finalize: "awaiting_finalization",
    missing: "packet_missing",
    packet: "packet_ready",
    partial: "authoring_partial",
    review: "awaiting_review",
    staged: "staged_imported",
  });
  assert.equal(report.process.timingReadySongs, 9);
  assert.equal(report.process.timingReadyCounts, 18);
  assert.equal(report.safeguards.providerCalls, 0);
  assert.equal(report.rows.find((row) => row.songId === "partial").exactCountCoverage.screenplay.matched, 1);
  assert.equal(report.rows.find((row) => row.songId === "partial").exactCountCoverage.screenplay.missing, 1);
});

test("rejected and unreadable screenplay artifacts cannot advance beyond authoring_partial", () => {
  const process = { status: "paused", counts: [count("song", 1), count("song", 2)], events: [] };
  const artifacts = [packet("song", ids("song")), screenplay("song", ids("song"), { rejected: true, finalized: true, screenplayHash: "sha256:x" })];
  const report = projectEchoScreenplayAuthoringQueue({ process, artifacts });
  assert.equal(report.rows[0].state, "authoring_partial");
  assert.ok(report.rows[0].blockers.includes("best_coverage_screenplay_rejected"));
});

test("exact count coverage cannot bypass failed screenplay validation", () => {
  const process = { status: "paused", counts: [count("song", 1), count("song", 2)], events: [] };
  const artifacts = [
    packet("song", ids("song")),
    screenplay("song", ids("song"), { validationError: "Enhanced screenplay authoringMethodAudit is required." }),
  ];
  const report = projectEchoScreenplayAuthoringQueue({ process, artifacts });
  assert.equal(report.rows[0].state, "authoring_partial");
  assert.ok(report.rows[0].blockers.includes("screenplay_validation_failed"));
});

test("CLI defaults to read-only and --out --apply writes only the report", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-authoring-queue-"));
  const processFile = path.join(root, "process.json");
  const artifactsRoot = path.join(root, "screenplays");
  fs.mkdirSync(artifactsRoot);
  const state = { processId: "fixture", status: "paused", events: [], counts: [count("song", 1), count("song", 2)] };
  fs.writeFileSync(processFile, JSON.stringify(state));
  fs.writeFileSync(path.join(artifactsRoot, "song.packet.json"), JSON.stringify({ packet: {
    schemaVersion: "hapa.echo.screenplay-source-packet.v1",
    song: { id: "song" },
    fourCounts: ids("song").map((id) => ({ id, continuity: { current: { id } } })),
    referenceEvidence: [],
    resolvedSongReferences: [],
    albumContextReservoir: [],
    authoringInstruction: {},
    qualityPolicy: {},
    approvedAvatarSeeds: { assets: [] },
    castAttribution: { primary: { avatarId: "avatar-fixture" }, additional: [] },
    sourceRevision: {
      songContextHash: fixtureHash,
      lyricsHash: fixtureHash,
      timingHash: fixtureHash,
      referenceGraphHash: fixtureHash,
      seedSetHash: fixtureHash,
      directorTreatmentHash: fixtureHash,
      promptPolicyHash: fixtureHash,
    },
  } }));
  const beforeProcess = fs.readFileSync(processFile, "utf8");
  const beforeFiles = fs.readdirSync(root).sort();
  const dry = run(["--process", processFile, "--screenplay-root", artifactsRoot], { generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(dry.report.rows[0].state, "packet_ready");
  assert.equal(dry.applied, false);
  assert.deepEqual(fs.readdirSync(root).sort(), beforeFiles);
  assert.equal(fs.readFileSync(processFile, "utf8"), beforeProcess);
  assert.throws(() => run(["--process", processFile, "--screenplay-root", artifactsRoot, "--out", path.join(root, "report.json")]), /requires --apply/);
  assert.throws(() => run(["--process", processFile, "--screenplay-root", artifactsRoot, "--apply"]), /requires --out/);
  assert.throws(() => run(["--process", processFile, "--screenplay-root", artifactsRoot, "--out", processFile, "--apply"]), /must not overwrite process/);
  assert.throws(() => run(["--process", processFile, "--screenplay-root", artifactsRoot, "--out", path.join(artifactsRoot, "song.packet.json"), "--apply"]), /must not overwrite a screenplay/);
  const out = path.join(root, "report.json");
  const written = run(["--process", processFile, "--screenplay-root", artifactsRoot, "--out", out, "--apply"], { generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(written.applied, true);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).report.rows[0].state, "packet_ready");
  assert.equal(fs.readFileSync(processFile, "utf8"), beforeProcess);
  assert.deepEqual(fs.readdirSync(root).sort(), ["process.json", "report.json", "screenplays"]);
});

test("malformed in-progress candidate is counted from observed count ids without being treated as finalized", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-authoring-partial-"));
  const processFile = path.join(root, "process.json");
  const artifactsRoot = path.join(root, "screenplays");
  fs.mkdirSync(artifactsRoot);
  fs.writeFileSync(processFile, JSON.stringify({ status: "paused", events: [], counts: [count("song", 1), count("song", 2)] }));
  fs.writeFileSync(path.join(artifactsRoot, "song.screenplay.direct-llm.candidate.json"), '{"songId":"song","sequencePlan":[{"counts":[{"countId":"song-count-0001"}');
  const result = run(["--process", processFile, "--screenplay-root", artifactsRoot]);
  assert.equal(result.report.rows[0].state, "authoring_partial");
  assert.equal(result.report.rows[0].exactCountCoverage.screenplay.matched, 1);
  assert.ok(result.report.rows[0].blockers.includes("screenplay_json_incomplete_or_unreadable"));
});

test("explicit resumable direct-LLM draft reports exact partial coverage without becoming a candidate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-authoring-resumable-draft-"));
  const processFile = path.join(root, "process.json");
  const artifactsRoot = path.join(root, "screenplays");
  fs.mkdirSync(artifactsRoot);
  fs.writeFileSync(processFile, JSON.stringify({ status: "paused", events: [], counts: [count("song", 1), count("song", 2), count("song", 3)] }));
  fs.writeFileSync(path.join(artifactsRoot, "song.screenplay.INCOMPLETE.json"), JSON.stringify({
    nonCandidateStatus: "incomplete-direct-llm-authoring-draft",
    schemaTarget: "hapa.echo.full-song-visual-screenplay.v1",
    songId: "song",
    requiredAuthoringStillOutstanding: { countTotal: 3, authoredCompleteCountRecords: 2 },
    sourceRevision: {
      songContextHash: fixtureHash, lyricsHash: fixtureHash, timingHash: fixtureHash,
      referenceGraphHash: fixtureHash, seedSetHash: fixtureHash,
      directorTreatmentHash: fixtureHash, promptPolicyHash: fixtureHash,
    },
    authoringAttestation: { method: "direct_llm_analysis", subagentsSpawned: 0, scriptsOrTemplatesUsedForAuthoredFields: "none" },
    authoringMethodAudit: { soleAuthorTaskName: "/root/writer", subagentsSpawned: 0, authoredFieldAutomationUsed: false, authoredFieldTools: [] },
    partialScreenplay: { openingCounts: [{ countId: "song-count-0001", ordinal: 1 }, { countId: "song-count-0002", ordinal: 2 }] },
  }));
  const result = run(["--process", processFile, "--screenplay-root", artifactsRoot]);
  const row = result.report.rows[0];
  assert.equal(row.state, "authoring_partial");
  assert.equal(row.exactCountCoverage.screenplay.matched, 2);
  assert.equal(row.exactCountCoverage.screenplay.missing, 1);
  assert.equal(row.selectedArtifacts.screenplay.draft, true);
  assert.equal(row.selectedArtifacts.screenplay.nonCandidateStatus, "incomplete-direct-llm-authoring-draft");
  assert.equal(row.selectedArtifacts.screenplay.draftIntegrity.ok, true);
  assert.ok(row.blockers.includes("screenplay_validation_failed"));
});

test("resumable draft fails closed when its tranche is non-contiguous", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-authoring-broken-draft-"));
  const processFile = path.join(root, "process.json");
  const artifactsRoot = path.join(root, "screenplays");
  fs.mkdirSync(artifactsRoot);
  fs.writeFileSync(processFile, JSON.stringify({ status: "paused", events: [], counts: [count("song", 1), count("song", 2), count("song", 3)] }));
  fs.writeFileSync(path.join(artifactsRoot, "song.screenplay.INCOMPLETE.json"), JSON.stringify({
    nonCandidateStatus: "incomplete-direct-llm-authoring-draft",
    schemaTarget: "hapa.echo.full-song-visual-screenplay.v1",
    songId: "song",
    requiredAuthoringStillOutstanding: { countTotal: 3, authoredCompleteCountRecords: 2 },
    sourceRevision: {
      songContextHash: fixtureHash, lyricsHash: fixtureHash, timingHash: fixtureHash,
      referenceGraphHash: fixtureHash, seedSetHash: fixtureHash,
      directorTreatmentHash: fixtureHash, promptPolicyHash: fixtureHash,
    },
    authoringAttestation: { method: "direct_llm_analysis", subagentsSpawned: 0, scriptsOrTemplatesUsedForAuthoredFields: "none" },
    authoringMethodAudit: { soleAuthorTaskName: "/root/writer", subagentsSpawned: 0, authoredFieldAutomationUsed: false, authoredFieldTools: [] },
    partialScreenplay: { openingCounts: [{ countId: "song-count-0001", ordinal: 1 }, { countId: "song-count-0003", ordinal: 3 }] },
  }));
  const row = run(["--process", processFile, "--screenplay-root", artifactsRoot]).report.rows[0];
  assert.equal(row.state, "authoring_partial");
  assert.equal(row.selectedArtifacts.screenplay.draftIntegrity.ok, false);
  assert.ok(row.blockers.includes("screenplay_draft_integrity_failed"));
});
