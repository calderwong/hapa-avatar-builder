import assert from "node:assert/strict";
import test from "node:test";
import { buildReferenceLoopDirectorCandidates } from "../src/domain/echo-reference-loop-director.js";

test("projects completed local-H3 loops from one immutable image run", () => {
  const library = { items: [
    { id: "a", referenceKey: "song:truth", title: "Truth", summary: "A mirror reveals the truth", prompt: "Silver mirror under rain", retrievalTags: ["mirror", "truth"], songs: [{ id: "song:one", title: "One Song" }], image: { uri: "/image/a" }, loopVideo: { uri: "/loop/a", hash: `sha256:${"a".repeat(64)}`, runId: "loop-a", provider: "fal", model: "minimax/h3-max-turbo/image-to-video" }, source: { runId: "run-a", jobId: "job-a", promptHash: "sha256:prompt" } },
    { id: "b", referenceKey: "song:cave", title: "Cave", image: { uri: "/image/b" }, loopVideo: null, source: { runId: "run-a", jobId: "job-b" } },
    { id: "c", referenceKey: "other", title: "Other", image: { uri: "/image/c" }, loopVideo: { uri: "/loop/c", hash: `sha256:${"c".repeat(64)}` }, source: { runId: "run-b", jobId: "job-c" } },
  ] };
  const candidates = buildReferenceLoopDirectorCandidates(library, { sourceImageRunId: "run-a" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceGroup, "reference");
  assert.equal(candidates[0].uri, "/loop/a");
  assert.equal(candidates[0].posterUri, "/image/a");
  assert.equal(candidates[0].technicalIdentity, `sha256:${"a".repeat(64)}`);
  assert.equal(candidates[0].availability.exists, true);
  assert.equal(candidates[0].origin.sourceRunId, "run-a");
  assert.deepEqual(candidates[0].sourceSongIds, ["song:one"]);
  assert.match(candidates[0].visualDescription.text, /Silver mirror under rain/u);
  assert.equal(candidates[0].visualDescription.sourceClass, "reference-card-enriched-prompt");
  assert.equal(candidates[0].loopPipeline.provider, "fal");
  assert.equal(candidates[0].origin.loopRunId, "loop-a");
});
