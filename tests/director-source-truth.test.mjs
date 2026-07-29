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

test("director plan metadata prefers the exact song identity over a colliding registry key", () => {
  const source = fs.readFileSync("./scripts/generate-music-video-plans.mjs", "utf8");
  const metadataLookup = source.slice(
    source.indexOf("function findSongMetadata"),
    source.indexOf("// Load visualizers"),
  );
  assert.ok(metadataLookup.indexOf("song.id") < metadataLookup.indexOf("expectedRegistryTrackId,"));
  assert.ok(metadataLookup.indexOf("song.cardId") < metadataLookup.indexOf("expectedRegistryTrackId,"));
  assert.ok(metadataLookup.indexOf("song.songId") < metadataLookup.indexOf("expectedRegistryTrackId,"));
});

test("director plan audio uses the preview-safe registry route before a local library path", () => {
  const source = fs.readFileSync("./scripts/generate-music-video-plans.mjs", "utf8");
  const metadataProjection = source.slice(
    source.indexOf("const metadata = {"),
    source.indexOf("songs.forEach", source.indexOf("const metadata = {") + 1),
  );
  assert.ok(metadataProjection.indexOf("s.audio?.registryTrackId")
    < metadataProjection.indexOf("s.audio?.mp3Uri"));
  assert.match(metadataProjection, /\/api\/song-registry\/audio\//);
});

test("director plans expose only readable isolated stems and deduplicate their roles", () => {
  const source = fs.readFileSync("./scripts/generate-music-video-plans.mjs", "utf8");
  const stemProjection = source.slice(
    source.indexOf("const stemsAvailable ="),
    source.indexOf("const normalizedTimedLyrics", source.indexOf("const stemsAvailable =")),
  );
  assert.match(stemProjection, /path\.isAbsolute\(localPath\)/);
  assert.match(stemProjection, /fs\.existsSync\(localPath\)/);
  assert.match(stemProjection, /fs\.statSync\(localPath\)\.isFile\(\)/);
  assert.match(stemProjection, /new Set/);
});

test("Echo Director exposes three editable always-on shader lanes", () => {
  const source = fs.readFileSync("./src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /Shader Tracks · 3 Always On/u);
  assert.match(source, /data-testid="echo-persistent-shader-slots"/u);
  assert.match(source, /data-echo-persistent-shader-slot/u);
  assert.match(source, /Lead Vocals → main mix fallback/u);
  assert.match(source, /ALWAYS ON 3/u);
});
