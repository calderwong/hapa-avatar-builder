import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, imageRefProblem, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { validateSectionEdits } from "../src/domain/echo-score-dust-sections.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>').toString("base64")}`;

test("text and inline SVG logos are valid picture motifs that need no asset lookup", () => {
  const [a, b] = [timeline.sections[0].repeatGroup, timeline.sections[1].repeatGroup];
  const direction = { images: { [a]: { assetId: `text:${a}`, kind: "text", text: "HAPA", font: "serif" }, [b]: { assetId: `svg:${b}:logo.svg`, kind: "svg", url: svg, label: "logo.svg" } } };
  assert.equal(validateEchoScoreDirection(direction).ok, true);
  const score = composeEchoVisualScore(timeline, direction);
  assert.equal(score.motifs.find((m) => m.repeatGroup === a).imageRef.text, "HAPA");
  const check = validateEchoVisualScore(score, { timeline, assets: [] });
  assert.equal(check.ok, true, "an empty asset list does not reject self-contained logos");
  assert.ok(!check.errors.some((e) => e.code === "absent-asset"));
  // An Avatar picture still has to be resolvable.
  const avatar = composeEchoVisualScore(timeline, { images: { [a]: { assetId: "avatar:x:y", url: "/x.png" } } });
  assert.ok(validateEchoVisualScore(avatar, { timeline, assets: [] }).errors.some((e) => e.code === "absent-asset"));
});

test("logo references are checked strictly", () => {
  assert.equal(imageRefProblem({ assetId: "a", url: "/media/a.png" }), null);
  assert.match(imageRefProblem({ assetId: "t", kind: "text", text: "" }), /1–24/);
  assert.match(imageRefProblem({ assetId: "t", kind: "text", text: "x".repeat(25) }), /1–24/);
  assert.match(imageRefProblem({ assetId: "s", kind: "svg", url: "https://evil.example/logo.svg" }), /inline/);
  assert.match(imageRefProblem({ assetId: "s", kind: "svg", url: `data:image/svg+xml,${"x".repeat(33 * 1024)}` }), /32 KiB/);
  assert.match(imageRefProblem({ assetId: "v", kind: "video" }), /unknown kind/);
  assert.match(imageRefProblem({}), /assetId/);
  assert.ok(validateEchoScoreDirection({ images: { g: { assetId: "t", kind: "text", text: "" } } }).errors.some((e) => e.code === "images"));
  assert.deepEqual(validateSectionEdits({ cues: { c: { image: { assetId: "t", kind: "text", text: "HI" } } } }), []);
});

test("logo sampling keeps dark colours but treats near-black as a hole", async () => {
  const { sampleDustTargetsFromPixels } = await import("../src/domain/echo-dust-swarm.js");
  const data = new Uint8ClampedArray(30 * 10 * 4);
  for (let x = 0; x < 30; x++) for (let y = 0; y < 10; y++) {
    const colour = x < 10 ? [20, 30, 120] : x < 20 ? [0, 0, 0] : [255, 255, 255];
    data.set([...colour, 255], (y * 30 + x) * 4);
  }
  const points = sampleDustTargetsFromPixels({ width: 30, height: 10, data }, { count: 600, seed: 1, mode: "logo" });
  const xs = Array.from({ length: points.count }, (_, i) => points.position[i * 3]);
  const span = 1.4 / 30;
  assert.ok(xs.some((x) => x < -0.25), "the navy third forms");
  assert.ok(xs.every((x) => x < -0.25 + span || x > 0.2 - span), "the black third stays empty");
});
