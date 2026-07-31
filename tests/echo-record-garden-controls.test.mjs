import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url),
  "utf8",
);

test("the record crate exposes counts, clear, retry, and an explicit return journey", () => {
  assert.match(source, /\{filteredRecords\.length\} of \{records\.length\}/);
  assert.match(source, /const clearCrateFilters = useCallback/);
  assert.match(source, /Retry catalog/);
  assert.match(source, /const ejectRecord = useCallback/);
  assert.match(source, /Return to crate/);
  assert.match(source, /gameRef\.current\?\.setPlacedRecord\(""\)/);
});

test("three physical screens can page through the complete bounded surface constellation", () => {
  assert.match(source, /limit: SCREEN_COUNT \* 4/);
  assert.match(source, /const mediaWindow = useMemo/);
  assert.match(source, /selectEchoRecordMediaWindow\(visuals, surfacePage/);
  assert.match(source, /visibleCount: SCREEN_COUNT/);
  assert.match(source, /warmCount: SCREEN_COUNT/);
  assert.match(source, /const visibleVisuals = mediaWindow\.visible/);
  assert.match(source, /const directorWarmVisuals = useMemo/);
  assert.match(source, /buildEchoRecordDirectorWarmSurfaces\(\{/);
  assert.match(source, /const warmVisuals = useMemo/);
  assert.match(
    source,
    /selectGardenWarmVisuals\(visibleVisuals, directorWarmVisuals, mediaWindow\.warm\)/,
  );
  assert.match(source, /\[\.\.\.directorWarmVisuals, \.\.\.pageWarmVisuals\]/);
  assert.match(source, /\.slice\(0, SCREEN_COUNT\)/);
  assert.match(source, /setVisuals\(visibleVisuals, \{/);
  assert.match(source, /warmVisuals,/);
  assert.match(source, /Previous album visual surfaces/);
  assert.match(source, /Next album visual surfaces/);
  assert.match(source, /context only, not time-synchronized/);
});

test("Card failures stay visible and offer a same-context retry", () => {
  assert.match(source, /Retry attached Hapa Card/);
  assert.match(source, /className="echo-record-card-error" role="alert"/);
  assert.match(source, /data-state=\{cardResolution\.visualId === selectedVisual\.id/);
  assert.match(source, /Cancel Card request/);
  assert.match(source, /Card blocked by source policy/);
  assert.match(source, /const openCardJobSource = useCallback/);
  assert.match(source, /Open Card source/);
  assert.match(source, /pendingCardRevealRef\.current = true/);
  assert.match(source, /Math\.floor\(sourceIndex \/ SCREEN_COUNT\)/);
});

test("every requested source family has an explicit available-or-missing status", () => {
  assert.match(source, /const visualFamilyCoverage = useMemo/);
  assert.match(source, /label: "Director"/);
  assert.match(source, /label: "References"/);
  assert.match(source, /label: "Characters"/);
  assert.match(source, /label: "Scenes"/);
  assert.match(source, /family\.available \? "available" : "missing"/);
});
