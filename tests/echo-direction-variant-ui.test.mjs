import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");
const phoneSmoke = fs.readFileSync(new URL("../scripts/echo-vertical-phone-smoke.cjs", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Echo direction variants derive a read-only exact project without spreading variant payloads", () => {
  const derivation = between("const activeStoredProject", "const activeIsolatedStems");
  assert.match(derivation, /deriveEchoDirectionVariantProject\(activeStoredProject, activeDirectionVariant\)/);
  assert.match(derivation, /deriveEchoDirectionWorkingProject\(workingDirectionFork\)/);
  assert.doesNotMatch(derivation, /\.\.\.activeDirectionVariant/);
  assert.match(source, /generateEchoHyperframeScript/);
  assert.doesNotMatch(source, /function generateHyperframesScriptClient/);
});

test("Echo exposes Legacy as the default and makes every newer cut an editable copy", () => {
  assert.match(source, /useState\("legacy"\)/);
  assert.match(source, /aria-label="Direction script version"/);
  assert.match(source, /Legacy baseline/);
  assert.match(source, /groupEchoDirectionVariants/);
  assert.match(source, /<optgroup key=\{group\.id\} label=\{group\.label\}>/);
  assert.match(source, /echoDirectionVariantOptionLabel/);
  assert.match(source, /editable copy<\/option>/);
  assert.match(source, /Editable copy · source cut and Legacy stay unchanged · Vertical ready/);
  assert.doesNotMatch(source, /switch to Legacy current to edit/);
  const orientation = between('aria-label="Video orientation"', 'aria-label="Lyric position"');
  assert.doesNotMatch(orientation, /disabled=\{directionVariantReadOnly\}/);
  assert.match(source, /disabled=\{directorEditingLocked \|\| directionVariantReadOnly\}/);
});

test("Echo automatically opens a chosen cut and only saves it as a new append-only child", () => {
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  assert.match(selector, /editableDirectionForkFromDetail\(detail, nextVariantId\)/);
  assert.match(selector, /setWorkingDirectionFork\(editableSelection\.workingFork\)/);
  assert.match(selector, /setSelectedDirectionVariantId\(nextVariantId\)/);
  assert.match(source, /data-testid="echo-continue-direction-cut"/);
  assert.match(source, /Start editable copy/);
  assert.match(source, /createEchoDirectionWorkingFork\(activeProject, activeDirectionVariant\)/);
  assert.match(source, /buildEchoDirectionForkRequest\(workingDirectionFork, projectToSave\)/);
  assert.match(source, /\/api\/echos\/direction-variant\/fork/);
  assert.match(source, /Save as new cut/);
  assert.match(source, /source cut and Legacy current remain unchanged/);
  assert.match(source, /data-testid="echo-cancel-direction-cut"/);
});

test("all newer-cut edit controls use copy-on-write instead of rejecting the selected cut", () => {
  const edits = between("const updateSelectedDirectionCut", "const handleContinueFromDirectionCut");
  assert.match(edits, /createEchoDirectionWorkingFork\(activeProject, activeDirectionVariant\)/);
  assert.match(edits, /const handleUpdateShot[\s\S]*updateSelectedDirectionCut/);
  assert.match(edits, /const handleUpdateVisualizer[\s\S]*updateSelectedDirectionCut/);
  assert.match(edits, /const handleUpdateProjectSettings[\s\S]*updateSelectedDirectionCut/);
  assert.doesNotMatch(edits, /directionVariantReadOnly/);
});

test("Echo acknowledges save before refreshing and starts Song Card planning from the saved revision only", () => {
  const forkSave = between("const handleSaveWorkingDirectionFork", "const handleSaveProject");
  const projectSave = between("const handleSaveProject", "const handleRunDirector");
  assert.match(source, /const ECHO_SAVE_TIMEOUT_MS = 30_000/);
  assert.match(source, /Save stopped after 30 seconds without a disk acknowledgment/);
  assert.match(forkSave, /saveEchoProjectRequest\(`/);
  assert.doesNotMatch(forkSave, /await fetchProjectDetail/);
  assert.match(forkSave, /New append-only direction cut saved\. Opening its protected editable copy/);
  assert.match(forkSave, /void fetchProjectDetail\(projectToSave\.song_id, savedVariantId, \{ commit: false, priority: "foreground" \}\)\.then/);
  assert.match(forkSave, /queueSongCardPlanForSavedRevision\(projectToSave\.song_id/);
  assert.match(source, /data-testid="echo-save-status"/);
  assert.match(source, /Saving cut · \$\{saveElapsedSeconds\}s/);
  assert.match(source, /planningRevision=\{songCardPlanRevisionBySong\[activeProject\.song_id\] \|\| ""\}/);
  assert.match(source, /Music video blueprint saved to disk\. Song Card preparation is continuing separately in Tracks\./);
  assert.match(projectSave, /\/api\/echos\/director-project\/compile/);
  assert.ok(
    projectSave.indexOf("/api/echos/director-project/compile") < projectSave.indexOf("queueSongCardPlanForSavedRevision(projectToSave.song_id"),
    "the saved source must receive a fresh canonical graph before Song Card planning begins",
  );
});

test("Echo lazily hydrates one selected cut while retaining the metadata catalog", () => {
  assert.match(source, /params\.set\("variantId", variantId\)/);
  assert.match(source, /fetchProjectDetail\(selectedProjectSongId, nextVariantId, \{ commit: false, priority: "foreground" \}\)/);
  assert.match(source, /echoDirectionVariantId\(variant\) === nextVariantId && Array\.isArray\(variant\.timeline\)/);
  assert.match(source, /editableDirectionForkFromDetail\(detail, nextVariantId\)/);
  assert.match(source, /commitDirectorProjectDetail\(detail, detailResult\.requestGeneration\)/);
  assert.match(source, /setWorkingDirectionFork\(editableSelection\.workingFork\)/);
  assert.match(source, /setSelectedDirectionVariantId\(nextVariantId\)/);
  assert.match(source, /disabled=\{loadingProjectDetail \|\| directorEditingLocked\}/);
});

test("a freshly saved cut stays pinned to its high-quality graph while certification catches up", () => {
  const helper = between("const editableDirectionForkFromDetail", "const prepareSmoothPreview");
  const forkSave = between("const handleSaveWorkingDirectionFork", "const handleSaveProject");
  assert.match(helper, /fallbackProject\?\.director_show_graph\?\.tracks/);
  assert.match(helper, /source: "saved-working-snapshot"/);
  assert.match(helper, /preservesPortableCards: true/);
  assert.match(forkSave, /setDirectionForkTransitionPending\(true\)/);
  assert.match(forkSave, /editableDirectionForkFromDetail\(detail, savedVariantId, \{ fallbackProject: projectToSave \}\)/);
  assert.match(forkSave, /commitDirectorProjectDetail\(detail, detailResult\.requestGeneration\)[\s\S]*setWorkingDirectionFork\(editableSelection\.workingFork\)[\s\S]*setSelectedDirectionVariantId\(savedVariantId\)/);
  assert.match(forkSave, /\.finally\(\(\) => \{[\s\S]*setDirectionForkTransitionPending\(false\)/);
  const beforeRefresh = forkSave.slice(0, forkSave.indexOf("void fetchProjectDetail"));
  assert.doesNotMatch(beforeRefresh, /setWorkingDirectionFork\(null\)/);
  assert.doesNotMatch(beforeRefresh, /setSelectedDirectionVariantId\(savedVariantId/);
});

test("save and child hydration lock every editing path instead of dropping in-flight changes", () => {
  const edits = between("const updateSelectedDirectionCut", "const handleContinueFromDirectionCut");
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  assert.match(source, /const directorEditingLocked = savingProject \|\| directionForkTransitionPending \|\| loadingProjectDetail/);
  assert.match(source, /data-edit-locked=\{directorEditingLocked \? "true" : "false"\}/);
  assert.match(source, /pointerEvents: directorEditingLocked \? 'none' : 'auto'/);
  assert.match(edits, /if \(directorEditingLocked\) return/);
  assert.match(selector, /disabled=\{loadingProjectDetail \|\| directorEditingLocked\}/);
  assert.match(source, /data-testid="echo-output-orientation"[\s\S]*disabled=\{directorEditingLocked\}/);
  assert.match(source, /data-testid="echo-save-direction-cut"[\s\S]*disabled=\{directorEditingLocked \|\| directionVariantReadOnly\}/);
  assert.match(source, /Cut saved · opening its editable copy/);
});

test("cut selection stays locked, bounded, and smoke-tested through detail hydration", () => {
  const detailLoad = between("const fetchProjectDetail", "const editableDirectionForkFromDetail");
  assert.match(source, /const ECHO_PROJECT_DETAIL_TIMEOUT_MS = 15_000/);
  assert.match(detailLoad, /new AbortController\(\)/);
  assert.match(detailLoad, /timedOut = true;[\s\S]*controller\.abort\(\)/);
  assert.match(detailLoad, /fetch\(`\$\{API_BASE\}\/api\/echos\/director-project\?\$\{params\.toString\(\)\}`, \{ signal: controller\.signal \}\)/);
  assert.match(detailLoad, /projectDetailRequestCountRef\.current \+= 1/);
  assert.match(detailLoad, /activeRequest\?\.priority > requestPriority/);
  assert.match(detailLoad, /activeRequest\?\.controller\.abort\(\)/);
  assert.match(detailLoad, /projectDetailGenerationBySongRef\.current\.set\(songId, requestGeneration\)/);
  assert.match(detailLoad, /commitDirectorProjectDetail\(detail, requestGeneration\)/);
  assert.match(detailLoad, /setLoadingProjectDetail\(projectDetailRequestCountRef\.current > 0\)/);
  assert.match(detailLoad, /globalThis\.clearTimeout\(timeout\)/);
  assert.match(phoneSmoke, /!document\.querySelector\('\[data-testid="echo-direction-version"\]'\)\?\.disabled/);
});

test("failed or preparing cut hydration retains the current editable selection", () => {
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  assert.match(selector, /the current editable cut remains open/);
  assert.doesNotMatch(selector, /const nextVariantId = event\.target\.value;\s*setWorkingDirectionFork\(null\)/);
  assert.doesNotMatch(selector, /if \(!hydratedVariant\) \{\s*setSelectedDirectionVariantId\("legacy"\)/);
  assert.doesNotMatch(selector, /catch \(error\) \{\s*setSelectedDirectionVariantId\("legacy"\)/);
});
