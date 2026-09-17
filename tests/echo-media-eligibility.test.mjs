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

test("fork save resolves Reference Media API routes through immutable local run bindings", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echo-reference-fork-save-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputPath = path.join(root, "reference-runs", "loop-run", "outputs", "loop.mp4");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, "completed-reference-loop-bytes");
  const calls = [];
  const receipt = await validateEchoForkMedia([{
    media_id: "reference:loop-run:loop:job-one",
    media_uri: "/api/echos/reference-media/assets/loop/loop-run/loop%3Ajob-one",
    media_source_group: "reference",
  }], {}, {
    root,
    resolveReferenceAsset: async (kind, runId, jobId) => {
      calls.push({ kind, runId, jobId });
      return { filePath: outputPath, mimeType: "video/mp4" };
    },
  });
  assert.deepEqual(calls, [{ kind: "loop", runId: "loop-run", jobId: "loop:job-one" }]);
  assert.equal(receipt.sourcesChecked, 1);
  assert.equal(receipt.byteAvailabilityVerified, true);
  assert.equal(receipt.preparedTimeline[0].availability.exists, true);
  assert.equal(receipt.preparedTimeline[0].availability.bytes, 30);
});

test('generated, removed and absent media cannot claim required characters or scenes from old metadata', async () => {
  const constraints={requiredCharacterIds:['red'],requiredSceneIds:['garden'],pins:['none']};
  for(const shot of [
    {media_id:'none',characterIds:['red'],sceneIds:['garden']},
    {media_id:'a',media_uri:'/media/a.mp4',knockedOut:true,characterIds:['red'],sceneIds:['garden']},
    {media_id:'a',media_contract:{type:'generated-visualizer',characterIds:['red'],sceneIds:['garden']}},
    {start_sec:0,end_sec:4},
  ]){
    const results=inspectEchoTimelineMediaEligibility([shot],constraints);
    assert.equal(results.length,1);assert.equal(results[0].eligible,false);
    assert.ok(results[0].reasons.includes('required-character'));assert.ok(results[0].reasons.includes('required-scene'));
    await assert.rejects(validateEchoForkMedia([shot],constraints),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('required-character'));
  }
  assert.equal(inspectEchoTimelineMediaEligibility([{media_id:'none'}]).length,0,'unconstrained generated pictures remain valid');
});

test('graph-only generated and absent media reject cast requirements while matching real media remains eligible', () => {
  const project={mediaConstraints:{requiredCharacterIds:['red']},telemetry:{}};
  const graph=cards=>({schemaVersion:'hapa.music-viz.native-show-graph.v2',song:{durationSeconds:4},tracks:[{id:'media',role:'media',cards}]});
  const card={id:'cue',startSeconds:0,endSeconds:4,media:{id:'none',characterIds:['red']}};
  for(const cards of [[card],[]])assert.throws(()=>compileHyperFramesShow({project,showGraph:graph(cards)}),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('required-character'));
  assert.doesNotThrow(()=>compileHyperFramesShow({project,telemetry:{},showGraph:graph([{...card,media:{id:'red',localPath:'/media/red.mp4',characterIds:['red']}}])}));
});

test('a constrained parent interval cannot disappear through a gap or shortened child', () => {
  const parent=[{media_id:'red',start_sec:4,end_sec:8,mediaConstraints:{requiredCharacterIds:['red']}}];
  for(const child of [[],[{start_sec:0,end_sec:5},{start_sec:6,end_sec:10}],[{start_sec:0,end_sec:7}]]){
    assert.throws(()=>inheritEchoTimelineMediaConstraints(child,parent),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('required-media-coverage')&&error.result.alternatives.every(row=>row.action));
  }
  const covered=inheritEchoTimelineMediaConstraints([{start_sec:0,end_sec:5},{start_sec:5,end_sec:10}],parent);
  assert.ok(covered.every(shot=>shot.mediaConstraints.requiredCharacterIds.includes('red')));
});

test('null or smaller child output settings do not relax explicitly inherited crop limits', () => {
  const parent={outputProfile:{width:1920,height:1080},requireVerifiedCrop:true};
  for(const outputProfile of [null,{width:640,height:360}]){
    const constraints=mergeEchoMediaConstraints(parent,{outputProfile,requireVerifiedCrop:false,pins:['a']});
    const result=evaluateEchoMediaEligibility(asset({cropCoverage:{minWidth:1280,minHeight:720}}),constraints);
    assert.equal(result.eligible,false);assert.ok(result.reasons.includes('incompatible-output-crop'));
  }
});

test('unavailable canonical evidence cannot make an aliased operator exclusion safe to save', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-ban-evidence-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'source.bin');await fs.writeFile(file,'read-only-fixture');
  await assert.rejects(validateEchoForkMedia([{media_id:'new-alias',media_uri:pathToFileURL(file).href}],{bans:['original-id']},{root}),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('source-policy-evidence-unverified'));
  await assert.rejects(validateEchoForkMedia([{media_id:'new-alias',media_uri:pathToFileURL(file).href,mediaConstraints:{bans:['original-id'],requireVerifiedPolicyForBans:false}}],{},{root}),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('source-policy-evidence-unverified'));
});

test('resolved source paths retain source-policy exclusions when request metadata omits origin', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-policy-path-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'hell-week-source.bin');await fs.writeFile(file,'availability-fixture');
  await assert.rejects(validateEchoForkMedia([{media_id:'renamed-source',media_uri:pathToFileURL(file).href,sourceAllowed:true}],{pins:['renamed-source']},{root}),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes('invalid-source-policy'));
});
