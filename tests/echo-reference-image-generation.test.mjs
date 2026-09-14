import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { flattenJobs, selectPilotJobs } = require("../electron/echo-reference-image-generation.cjs");

test("reference image queue flattens one durable job per staged song/reference prompt", () => {
  const payload = { songs: [{ id: "song-one", title: "Miss Infinity", trackNumber: 4, knowledge: { referenceImagePrompts: [
    { id: "prompt-r54", passId: "pass", referenceId: "R54", referenceTitle: "Charon", evidenceClass: "D", prompt: "One auditable source scene", generationPrompt: "One original ferry scene without named figures" },
    { id: "prompt-r21", passId: "pass", referenceId: "R21", referenceTitle: "Ani", evidenceClass: "T", prompt: "One original passage scene" },
  ] } }] };
  const jobs = flattenJobs(payload);
  assert.equal(jobs.length, 2);
  const ferry = jobs.find((job) => job.referenceId === "R54");
  assert.equal(ferry.songId, "song-one");
  assert.equal(ferry.prompt, "One original ferry scene without named figures");
  assert.equal(ferry.reviewPrompt, "One auditable source scene");
  assert.ok(jobs.every((job) => job.status === "queued" && !job.outputPath));
  const pilot = selectPilotJobs(jobs, 1);
  assert.equal(pilot[0].referenceId, "R54");
});
