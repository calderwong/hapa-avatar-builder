import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { rankSemanticMediaCandidates } from "../src/domain/semantic-media-ranker-v2.js";

const candidate = (id, values = {}) => ({ id, title: id, uri: `/media/${id}.mp4`, posterUri: "", tokens: values.tokens || [], objects: values.objects || [], actions: values.actions || [], motion: values.motion || "progressive-motion", flowType: "progression", technical: { status: "verified-source-file", width: 1280, height: 720, contentHash: { value: id.padEnd(64, "0") } }, semantic: { status: "inferred-unreviewed", artifactId: `artifact:${id}` } });

test("semantic ranker decomposes evidence, honors hard filters, and caps inferred confidence", () => {
  const result = rankSemanticMediaCandidates({
    slot: { sectionLabel: "memory bridge", sectionType: "bridge", editReason: "hold", energy: 0.7, preferredAspect: "landscape" },
    lyricText: "remember the bridge",
    canon: { motifs: [{ token: "memory" }] },
    candidates: [candidate("best", { tokens: ["memory", "bridge", "remember"], objects: ["bridge"] }), candidate("recent"), candidate("banned")],
    previous: ["recent"],
    bans: ["banned"],
  });
  assert.equal(result.selected.mediaId, "best");
  assert.ok(result.selected.confidence <= 0.55);
  assert.ok(result.selected.components.lyricMotif.evidence.includes("memory"));
  assert.deepEqual(new Set(result.rejected.flatMap((item) => item.hardFilters)), new Set(["operator-ban", "recent-repeat-window"]));
});

test("all album shots retain proposed decomposed rankings without claiming review victory", () => {
  const root = path.resolve("data/music-video-projects");
  const files = fs.readdirSync(root).filter((file) => file.endsWith("-video-project.json"));
  let shots = 0;
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const project = payload.music_video_project || payload;
    for (const shot of project.timeline || []) {
      shots += 1;
      const casting = shot.semantic_casting;
      assert.equal(casting?.schemaVersion, "hapa.echo.semantic-media-ranking.v2", file);
      assert.equal(casting?.selectionStatus, "proposed-pending-blind-review", file);
      assert.ok(Array.isArray(casting?.alternatives));
      assert.ok(Array.isArray(casting?.hardContinuityFilters));
      assert.ok(casting.selected?.components);
      assert.ok(casting.selected?.confidence === null || casting.selected.confidence <= 0.55);
      assert.match(casting.confidenceRule, /capped at 0\.55/);
    }
  }
  const report = JSON.parse(fs.readFileSync("artifacts/echo-semantic-ranker-v2/report.json", "utf8"));
  assert.equal(shots, report.slots);
  assert.equal(files.length, report.projects);
  const packet = JSON.parse(fs.readFileSync("/Users/calderwong/Documents/Codex/2026-07-10/re/outputs/dear-papa-director-v2-demo/semantic-review/review-packet.json", "utf8"));
  assert.equal(packet.comparisons.length, 18);
  assert.equal(Object.hasOwn(packet, "sealedAnswers"), false);
  assert.equal(report.reviewStatus, "awaiting-human-blind-ab");
});
