import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/components/TarotDraw3DView.jsx"), "utf8");

test("Tarot Echo overlays are quantized, bounded, measured, and pure-IVF aware", () => {
  assert.match(source, /maxFps: playbackPowerMode === "docked" \? 4 : 12/);
  assert.match(source, /signature === overlay\.lastSignature/);
  assert.match(source, /overlay\.skippedUploads \+= 1/);
  assert.match(source, /overlay\.cpuSamples\.push/);
  assert.match(source, /if \(centerScreen\?\.mesh\) centerScreen\.mesh\.visible = true/);
  assert.match(source, /echoDirectorTimelineSourceKey = `ivf:\$\{targetShotIndex\}`/);
  assert.match(source, /\/cards-at-time\?timeMs=/);
  assert.match(source, /\/print`/);
  assert.match(source, /Authoritative Song Card print failed/);
  assert.match(source, /resolveAuthoritativeTarotSongCardPrint/);
  assert.doesNotMatch(source, /printResponse\.ok \? await printResponse\.json\(\) : \{ card: primary\.snapshot/);
  assert.match(source, /visualizerCardsAtTime\(graph, timestampSeconds\)/);
});

test("Tarot only trusts hash-matched lyric timing and renders no lyrics outside cue windows", () => {
  assert.match(source, /timingTruth\.sourceMatchesActive/);
  assert.match(source, /timingTruth\.timingSourceSha256 === timingTruth\.activeTimingSha256/);
  assert.match(source, /wrappedClock < Number\(line\.end \|\| 0\) \+ \.15\) \|\| null/);
  assert.doesNotMatch(source, /sourceLines\.findLast\?\./);
  assert.match(source, /if \(preserveTiming\) \{/);
});
