import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("generated card tags and team colors cannot claim verified truth", () => {
  const source = fs.readFileSync("./scripts/generate-music-video-plans.mjs", "utf8");
  const generatedCardBlock = source.slice(
    source.indexOf("const teamPool = hashSum % 3"),
    source.indexOf("console.log(`Successfully loaded", source.indexOf("const teamPool = hashSum % 3")),
  );
  assert.ok(generatedCardBlock.includes('truthStatus: "generated_placeholder"'));
  assert.ok(generatedCardBlock.includes('tags: "generated_placeholder"'));
  assert.ok(generatedCardBlock.includes('colorPalette: "generated_placeholder"'));
  assert.ok(!generatedCardBlock.includes('truthStatus: "verified"'));
});
