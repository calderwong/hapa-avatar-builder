import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateEchoMediaEligibility, mergeEchoMediaConstraints, inspectEchoTimelineMediaEligibility, inheritEchoTimelineMediaConstraints } from "../src/domain/echo-media-eligibility.js";
import { rankSemanticMediaCandidates, prepareSemanticMediaCandidate } from "../src/domain/semantic-media-ranker-v2.js";
import { validateEchoForkMedia } from "../server/echo-media-eligibility.mjs";
import { buildEchoDirectionForkRequest, createEchoDirectionWorkingFork } from "../src/domain/echo-direction-variants.js";
import { compileHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";

const asset = extra => ({ id: "a", uri: "/media/a.mp4", title: "a", tokens: [], objects: [], actions: [],
  availability: { exists: true, bytes: 4096 }, ...extra });

test("pins never bypass bans, absent URL, unavailable bytes, source exclusions, cast, scene, or crop", () => {
  for (const [candidate, constraints, reason] of [
    [asset(), { bans: ["a"] }, "operator-ban"],
    [asset({ uri: "" }), {}, "missing-runtime-uri"],
    [asset({ availability: { exists: false, bytes: 0 } }), {}, "missing-source-bytes"],
    [asset({ origin: { sourceSystem: "hapa-dev-proto" } }), {}, "invalid-source-policy"],
    [asset({ sourceAllowed: false }), {}, "invalid-source-policy"],
    [asset({ characterIds: ["blue"] }), { requiredCharacterIds: ["red"] }, "required-character"],
    [asset({ sceneIds: ["ship"] }), { requiredSceneIds: ["garden"] }, "required-scene"],
    [asset({ cropCoverage: { minWidth: 500, minHeight: 300 } }), { outputProfile: { width: 1920, height: 1080 } }, "incompatible-output-crop"],
    [asset({ cropCoverage: { protectedRegionsSafe: false } }), {}, "incompatible-output-crop"],
  ]) {
    const result = evaluateEchoMediaEligibility(candidate, { ...constraints, pins: ["a"] });
    assert.equal(result.eligible, false, reason);
    assert.ok(result.hardFilters.includes(reason));
    assert.ok(result.alternatives.every(item => item.action));
  }
});

test("only repetition is relaxed; unknown evidence is explicit and strict preparation rejects it", () => {
  assert.equal(evaluateEchoMediaEligibility(asset(), { previous: ["a"] }).eligible, false);
  const pinned = evaluateEchoMediaEligibility(asset(), { previous: ["a"], pins: ["a"] });
  assert.equal(pinned.eligible, true);
  assert.deepEqual(pinned.relaxedPreferences, ["recent-repeat-window"]);
  const unknown = asset({ availability: undefined, technical: { status: "verified-source-file", contentHash: { value: "old-hash" } } });
  assert.deepEqual(evaluateEchoMediaEligibility(unknown).pendingEvidence, ["source-bytes-unverified"]);
  assert.equal(evaluateEchoMediaEligibility(unknown, { requireVerifiedBytes: true }).eligible, false);
  const inherited = mergeEchoMediaConstraints({ bans: ["a"], requiredCharacterIds: ["red"], requireVerifiedBytes: true }, { bans: [], requiredCharacterIds: [], requireVerifiedBytes: false });
  assert.equal(evaluateEchoMediaEligibility(unknown, inherited).eligible, false);
  assert.deepEqual(inherited.requiredCharacterIds, ["red"]);
});

test("ranker returns typed failure with repair actions instead of selecting an invalid pinned candidate", () => {
  const candidates = [asset({ id: "banned" }), asset({ id: "absent", uri: "" })];
  const result = rankSemanticMediaCandidates({ slot: {}, candidates, pins: ["banned", "absent"], bans: ["banned"] });
  assert.equal(result.selected, null);
  assert.equal(result.status, "unsatisfied");
  assert.equal(result.unsatisfied.code, "echo_media_constraints_unsatisfied");
  assert.deepEqual(new Set(result.unsatisfied.reasons), new Set(["operator-ban", "missing-runtime-uri"]));
  const prepared = prepareSemanticMediaCandidate(asset({ origin: { sourceSystem: "Hell Week" } }));
  assert.equal(evaluateEchoMediaEligibility(prepared).eligible, false, "normalization must retain origin ownership and exclusions");
});

test("working fork and HyperFrames compile share the same rejection before emitting a cut", () => {
  const timeline = [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "a", media_uri: "/media/a.mp4", mediaConstraints: { pins: ["a"] } }];
  const project = { song_id: "s", timeline, mediaConstraints: { bans: ["a"] } };
  const fork = createEchoDirectionWorkingFork(project, { id: "parent", timeline });
  for (const run of [
    () => buildEchoDirectionForkRequest(fork, project),
    () => compileHyperFramesShow({ project, showGraph: { schemaVersion: "hapa.music-viz.native-show-graph.v2" } }),
  ]) assert.throws(run, error => error.code === "echo_media_constraints_unsatisfied" && error.result.reasons.includes("operator-ban"));
  assert.equal(inspectEchoTimelineMediaEligibility([{ ...timeline[0], media_id: "none" }], project.mediaConstraints).length, 0);
});

test("graph-only HyperFrames cards cannot evade bans by omitting a project timeline", () => {
  const showGraph = { schemaVersion: "hapa.music-viz.native-show-graph.v2", song: { durationSeconds: 4 },
    tracks: [{ id: "media", role: "media", cards: [{ id: "cue", startSeconds: 0, endSeconds: 4, media: { id: "banned", localPath: "/media/banned.mp4" }, mediaConstraints: { pins: ["banned"] } }] }] };
  assert.throws(() => compileHyperFramesShow({ showGraph, project: { mediaConstraints: { bans: ["banned"] } } }),
    error => error.code === "echo_media_constraints_unsatisfied" && error.result.stage === "hyperframes-graph-compile");
});

test("balanced recast cannot fall back to a different required character", () => {
  const project = { song_id: "s", timeline: [{ start_sec: 0, end_sec: 4, media_id: "prior", media_uri: "/media/prior.mp4", mediaConstraints: { requiredCharacterIds: ["red"] } }] };
  const candidates = [asset({ sourceGroup: "avatar", characterIds: ["blue"], duration: 6 })];
  assert.throws(() => recastBalancedEchoDirectorProject(project, candidates, { allowedSourceGroups: ["avatar"] }),
    error => error.code === "echo_media_constraints_unsatisfied" && error.result.reasons.includes("required-character"));
});

test("renumbered and split forks preserve required cast across the parent's time range", () => {
  const parent = [{ start_sec: 0, end_sec: 4, mediaConstraints: { requiredCharacterIds: ["red"], bans: ["banned"] } }];
  const child = [{ shot_index: 99, start_sec: 0, end_sec: 2, media_id: "blue", media_uri: "/media/blue.mp4", characterIds: ["blue"], mediaConstraints: { requiredCharacterIds: [], bans: [], pins: ["blue"] } },
    { shot_index: 11, start_sec: 2, end_sec: 4, media_id: "red", media_uri: "/media/red.mp4", characterIds: ["red"] }];
  const inherited = inheritEchoTimelineMediaConstraints(child, parent);
  const results = inspectEchoTimelineMediaEligibility(inherited);
  assert.equal(results[0].eligible, false);
  assert.ok(results[0].reasons.includes("required-character"));
  assert.equal(results[1].eligible, true);
  assert.deepEqual(child[0].mediaConstraints.requiredCharacterIds, [], "request payload remains unchanged");
});

test("fork server checks actual bytes, ignores forged availability and bounds work without rewriting sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echo-media-eligibility-"));
  try {
    const file = path.join(root, "source.bin");
    await fs.writeFile(file, "byte-availability-fixture-not-decoded");
    const uri = pathToFileURL(file).href;
    const timeline = [{ media_id: "a", media_uri: uri }];
    const receipt = await validateEchoForkMedia([...timeline, ...timeline], {}, { root });
    assert.equal(receipt.sourcesChecked, 1);
    assert.equal(receipt.decodeVerified, false);
    assert.equal(receipt.byteAvailabilityVerified, true);
    const before = await fs.readFile(file);
    await assert.rejects(validateEchoForkMedia(timeline, { pins: ["a"], bans: ["a"] }, { root }), { code: "echo_media_constraints_unsatisfied" });
    assert.deepEqual(await fs.readFile(file), before);
    await fs.unlink(file);
    await assert.rejects(validateEchoForkMedia([{ ...timeline[0], availability: { exists: true, bytes: 5000 } }], { pins: ["a"] }, { root }),
      error => error.statusCode === 422 && error.result.reasons.includes("missing-source-bytes"));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
