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

test("one large physical preview presents the exact composite while its bounded context stays pageable", () => {
  assert.match(source, /const SCREEN_COUNT = 1/);
  assert.doesNotMatch(source, /const SCREEN_COUNT = 3/);
  assert.match(source, /createEchoGardenRoundedBoxGeometry\(7\.44, 4\.34, 0\.2, 0\.085, 4\)/);
  assert.match(source, /new THREE\.PlaneGeometry\(7\.08, 3\.98\)/);
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
  assert.match(source, /const masterVisual = state\.compositeVisual \|\| directorVisual \|\| visuals\[0\] \|\| null/);
  assert.match(source, /activeVisuals = masterVisual \? \[masterVisual\] : \[\]/);
  assert.match(source, /assignAlbumScreenVisuals\(screens, activeVisuals, mediaPool\)/);
  assert.match(source, /Previous album visual surfaces/);
  assert.match(source, /Next album visual surfaces/);
  assert.match(source, /context only, not time-synchronized/);
});

test("Card failures stay visible at their source and the preview remains the retry affordance", () => {
  assert.match(source, /className="echo-record-card-error" role="alert"/);
  assert.match(source, /\["failed", "blocked", "interrupted", "unavailable"\]\.includes\(cardResolution\.status\)/);
  assert.match(source, /cardResolution\.visualId === selectedVisual\.id/);
  assert.doesNotMatch(source, /Retry attached Hapa Card/);
  assert.doesNotMatch(source, /Cancel Card request/);
  assert.match(source, /const openCardJobSource = useCallback/);
  assert.match(source, /Open Card source/);
  assert.match(source, /pendingCardRevealRef\.current = true/);
  assert.match(source, /Math\.floor\(sourceIndex \/ SCREEN_COUNT\)/);
  assert.match(source, /Click the large Director Preview to print the exact Hapa Card attached to the current visual/);
});

test("every requested source family has an explicit available-or-missing status", () => {
  assert.match(source, /const visualFamilyCoverage = useMemo/);
  assert.match(source, /label: "Director"/);
  assert.match(source, /label: "References"/);
  assert.match(source, /label: "Characters"/);
  assert.match(source, /label: "Scenes"/);
  assert.match(source, /family\.available \? "available" : "missing"/);
});
