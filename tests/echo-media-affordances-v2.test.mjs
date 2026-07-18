import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const placeholderTags = new Set(["digital-isolation", "cyber-operator", "simulation-framework", "camera-push-in", "glitch-lines", "browser-playback"]);

test("all readable Echo video assets have source-bound technical and inferred semantic affordances", () => {
  const stores = ["data/item-manager-store.json", "data/scene-store.json"].map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
  const assets = [];
  for (const card of stores[0].cards || []) for (const asset of card.mediaAssets || []) if (asset.type === "video") assets.push(asset);
  for (const scene of stores[1].scenes || []) for (const asset of scene.assets || []) if (asset.type === "video") assets.push(asset);
  assert.ok(assets.length > 0);
  const readable = assets.filter((asset) => asset.metadata?.echosTechnicalAffordance?.status === "verified-source-file");
  const invalid = assets.filter((asset) => asset.metadata?.echosTechnicalAffordance?.status === "unreadable");
  assert.equal(readable.length + invalid.length, assets.length);
  for (const asset of readable) {
    const technical = asset.metadata.echosTechnicalAffordance;
    assert.match(technical.contentHash?.value || "", /^[a-f0-9]{64}$/);
    for (const field of ["durationSec", "width", "height", "fps", "codec", "bitRate"]) assert.notEqual(technical[field], null, `${asset.id}:${field}`);
    assert.ok(technical.keyframes && Number.isInteger(technical.keyframes.count));
    assert.ok(technical.posterUri);
    assert.ok(Array.isArray(technical.contactFrames) && technical.contactFrames.length > 0);
    assert.equal(asset.metadata.echosSemanticAffordance?.status, "inferred-unreviewed");
    assert.equal(asset.metadata.echosSemanticAffordance?.model, null);
    assert.equal(asset.metadata.echosSemanticAffordance?.reviewStatus, "unreviewed");
    assert.equal((asset.tags || []).some((tag) => placeholderTags.has(String(tag).toLowerCase())), false);
    assert.deepEqual(asset.colorPalette || [], []);
  }
});

test("affordance cache and report make reruns bounded and invalid files explicit", () => {
  const report = JSON.parse(fs.readFileSync("artifacts/echo-media-affordances/report-v2.json", "utf8"));
  const cache = JSON.parse(fs.readFileSync("artifacts/echo-media-affordances/technical-cache-v2.json", "utf8"));
  assert.equal(report.stats.records > 0, true);
  assert.equal(report.stats.uniquePaths, report.stats.readable + report.stats.failed);
  assert.equal(Object.keys(cache).length >= report.stats.readable, true);
  assert.equal(report.invalidFilesAreClassified, true);
});
