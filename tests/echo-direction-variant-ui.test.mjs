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
  const reopenSavedCut = between("const reopenSavedDirectionCut", "const handleRecoverPendingDirectionCut");
  const recoverUnknownSave = between("const handleRecoverPendingDirectionCut", "const handleSaveWorkingDirectionFork");
  const finishLegacySave = between("const finishSavedLegacyProject", "const handleRecoverPendingLegacySave");
  const recoverLegacySave = between("const handleRecoverPendingLegacySave", "const handleSaveProject");
  const projectSave = between("const handleSaveProject", "const handleRunDirector");
  assert.match(source, /const ECHO_SAVE_TIMEOUT_MS = 30_000/);
  assert.match(source, /Save acknowledgment timed out after 30 seconds/);
  assert.match(source, /unknownError\.code = "echo_save_outcome_unknown"/);
  assert.match(forkSave, /saveEchoProjectRequest\(`/);
  assert.match(forkSave, /request\.requestedId[\s\S]*await fetchProjectDetail\([\s\S]*request\.requestedId/);
  assert.match(forkSave, /no duplicate was created/);
  assert.match(forkSave, /New append-only direction cut saved\. Opening its protected editable copy/);
  assert.match(forkSave, /setPendingSavedDirectionCut\(pendingSavedCut\)/);
  assert.match(forkSave, /payload\.variant\?\.id \|\| payload\.id \|\| request\.requestedId/);
  assert.match(forkSave, /void reopenSavedDirectionCut\(pendingSavedCut, reconciledDetailResult\)/);
  assert.match(reopenSavedCut, /fetchProjectDetail\([\s\S]*songId,[\s\S]*variantId/);
  assert.match(reopenSavedCut, /queueSongCardPlanForSavedRevision\([\s\S]*songId,[\s\S]*variantId[\s\S]*project: editableSelection\.savedProject,[\s\S]*showGraph: savedShowGraph/);
  assert.match(recoverUnknownSave, /body: JSON\.stringify\(pending\.request\)/);
  assert.match(source, /data-testid="echo-recover-saved-direction-cut"/);
  assert.match(source, /Check save outcome/);
  assert.match(source, /data-testid="echo-save-status"/);
  assert.match(source, /Saving cut · \$\{saveElapsedSeconds\}s/);
  assert.match(source, /activeSongCardPlanEntry\?\.status === "ready"[\s\S]*activeSongCardPlanEntry\.cutId === activeDirectionVariantSelection/);
  assert.match(source, /data-testid="echo-song-card-plan-waiting"/);
  assert.match(source, /it will not silently render an older version/);
  assert.match(source, /project=\{activeSongCardPlanProject\}/);
  assert.match(source, /showGraph=\{activeSongCardPlanShowGraph\}/);
  assert.match(source, /planningRevision=\{activeSongCardPlanningRevision\}/);
  assert.match(source, /Music video blueprint saved to disk\. Song Card preparation is continuing separately in Tracks\./);
  assert.match(finishLegacySave, /\/api\/echos\/director-project\/compile/);
  assert.match(finishLegacySave, /fetchProjectDetail\([\s\S]*projectToSave\.song_id/);
  assert.match(finishLegacySave, /project: refreshedProject,[\s\S]*showGraph: projectToEditorGraph\(refreshedProject\)/);
  assert.ok(
    finishLegacySave.indexOf("/api/echos/director-project/compile") < finishLegacySave.indexOf("queueSongCardPlanForSavedRevision(projectToSave.song_id"),
    "the saved source must receive a fresh canonical graph before Song Card planning begins",
  );
  assert.match(projectSave, /\{ outcomeUnknown: true \}/);
  assert.match(projectSave, /setDirectorHasUnsavedChanges\(false\)[\s\S]*await finishSavedLegacyProject\(projectToSave\)/);
  assert.match(projectSave, /setPendingLegacyProjectSave\(\{[\s\S]*status: "unknown"/);
  assert.match(recoverLegacySave, /diskProject\.updated_at[\s\S]*pending\.project\.updated_at/);
  assert.match(recoverLegacySave, /body: JSON\.stringify\(\{ music_video_project: pending\.project \}\)/);
  assert.match(recoverLegacySave, /\{ outcomeUnknown: true \}/);
  assert.doesNotMatch(recoverLegacySave, /setPendingLegacyProjectSave\(null\)[\s\S]*Your local changes remain open/);
  assert.match(source, /data-testid="echo-recover-legacy-save"/);
});

test("Echo lazily hydrates one selected cut while retaining the metadata catalog", () => {
  const preparation = between("const fetchPreparedProjectDetail", "const handleSelectDirectorProjectSong");
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  assert.match(source, /params\.set\("variantId", variantId\)/);
  assert.equal((preparation.match(/fetchProjectDetail\(/g) || []).length, 2, "preparation should retry the exact selected cut after warm-up");
  assert.match(preparation, /warmEchoProjectGraphsRequest\(`\$\{API_BASE\}\/api\/echos\/director-project\/compile`, songId\)/);
  assert.match(selector, /fetchPreparedProjectDetail\(selectedProjectSongId, nextVariantId\)/);
  assert.match(source, /echoDirectionVariantId\(variant\) === nextVariantId && Array\.isArray\(variant\.timeline\)/);
  assert.match(source, /editableDirectionForkFromDetail\(detail, nextVariantId\)/);
  assert.match(source, /commitDirectorProjectDetail\(detail, detailResult\.requestGeneration\)/);
  assert.match(source, /setWorkingDirectionFork\(editableSelection\.workingFork\)/);
  assert.match(source, /setSelectedDirectionVariantId\(nextVariantId\)/);
  assert.match(source, /disabled=\{loadingProjectDetail \|\| directorEditingLocked \|\| directorHasUnsavedChanges\}/);
});

test("a stale cut selection prepares every saved graph for that song without changing a script", () => {
  const warmupRequest = between("async function warmEchoProjectGraphsRequest", "function resolveMediaUri");
  const preparation = between("const fetchPreparedProjectDetail", "const handleSelectDirectorProjectSong");
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');

  assert.match(source, /const ECHO_PROJECT_GRAPH_WARMUP_TIMEOUT_MS = 10 \* 60_000/);
  assert.match(warmupRequest, /body: JSON\.stringify\(\{ songId \}\)/);
  assert.doesNotMatch(warmupRequest, /variantId/);
  assert.match(preparation, /if \(project\?\.director_show_graph\?\.tracks\) return detailResult/);
  assert.match(preparation, /readinessReason === "server_restart_required"/);
  assert.match(preparation, /Preparing this song’s saved preview graphs once/);
  assert.match(selector, /setDirectionCutSelectionPending\(true\)/);
  assert.equal((selector.match(/setDirectionCutSelectionPending\(false\)/g) || []).length, 2);
  assert.match(source, /\|\| directionCutSelectionPending[\s\S]*\|\| Boolean\(pendingSavedDirectionCut\)/);
});

test("a freshly saved cut stays pinned to its high-quality graph while certification catches up", () => {
  const helper = between("const editableDirectionForkFromDetail", "const prepareSmoothPreview");
  const forkSave = between("const handleSaveWorkingDirectionFork", "const handleSaveProject");
  const reopenSavedCut = between("const reopenSavedDirectionCut", "const handleRecoverPendingDirectionCut");
  assert.match(helper, /fallbackProject\?\.director_show_graph\?\.tracks/);
  assert.match(helper, /source: "saved-working-snapshot"/);
  assert.match(helper, /preservesPortableCards: true/);
  assert.match(forkSave, /setDirectionForkTransitionPending\(true\)/);
  assert.match(reopenSavedCut, /editableDirectionForkFromDetail\(detail, variantId, \{[\s\S]*fallbackProject: pending\.fallbackProject/);
  assert.match(reopenSavedCut, /commitDirectorProjectDetail\(detail, detailResult\.requestGeneration\)[\s\S]*setWorkingDirectionFork\(editableSelection\.workingFork\)[\s\S]*setSelectedDirectionVariantId\(variantId\)/);
  assert.match(reopenSavedCut, /setPendingSavedDirectionCut\(\{ \.\.\.pending, status: "retry", reason \}\)/);
  assert.match(reopenSavedCut, /finally[\s\S]*setDirectionForkTransitionPending\(false\)/);
  const beforeRefresh = forkSave.slice(0, forkSave.indexOf("void reopenSavedDirectionCut"));
  assert.doesNotMatch(beforeRefresh, /setWorkingDirectionFork\(null\)/);
  assert.doesNotMatch(beforeRefresh, /setSelectedDirectionVariantId\(savedVariantId/);
});

test("save and child hydration lock every editing path instead of dropping in-flight changes", () => {
  const edits = between("const updateSelectedDirectionCut", "const handleContinueFromDirectionCut");
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  assert.match(source, /const directorEditingLocked = savingProject[\s\S]*\|\| directionForkTransitionPending[\s\S]*\|\| Boolean\(pendingSavedDirectionCut\)[\s\S]*\|\| Boolean\(pendingLegacyProjectSave\)[\s\S]*\|\| loadingProjectDetail/);
  assert.match(source, /data-edit-locked=\{directorEditingLocked \? "true" : "false"\}/);
  assert.match(source, /pointerEvents: directorEditingLocked \? 'none' : 'auto'/);
  assert.match(edits, /if \(directorEditingLocked\) return/);
  assert.match(selector, /disabled=\{loadingProjectDetail \|\| directorEditingLocked \|\| directorHasUnsavedChanges\}/);
  assert.match(source, /data-testid="echo-output-orientation"[\s\S]*disabled=\{directorEditingLocked\}/);
  assert.match(source, /data-testid="echo-save-direction-cut"[\s\S]*disabled=\{directorEditingLocked \|\| directionVariantReadOnly\}/);
  assert.match(source, /Cut saved · opening its editable copy/);
  assert.match(source, /editing stays locked so the saved request cannot conflict with another cut/);
});

test("cut and song navigation preserve dirty work and reload the saved Legacy graph", () => {
  const selector = between('aria-label="Direction script version"', 'aria-label="Video orientation"');
  const songSelection = between("const handleSelectDirectorProjectSong", "const editableDirectionForkFromDetail");
  assert.match(source, /setDirectorHasUnsavedChanges\(true\)/);
  assert.match(selector, /Unsaved changes · Save or cancel before switching cuts or songs/);
  assert.match(selector, /fetchPreparedProjectDetail\(selectedProjectSongId, ""\)/);
  assert.match(selector, /commitDirectorProjectDetail\(legacyDetailResult\.detail, legacyDetailResult\.requestGeneration\)/);
  assert.match(selector, /cutId: "legacy", project: legacyProject, showGraph: legacyShowGraph/);
  assert.match(songSelection, /if \(!songId \|\| directorEditingLocked \|\| directorHasUnsavedChanges\) return/);
  assert.match(songSelection, /if \(songId === selectedProjectSongId && activeProjectHasDetail\) return/);
  assert.match(songSelection, /fetchProjectDetail\(songId, "", \{ commit: false, priority: "foreground" \}\)/);
  assert.match(songSelection, /commitDirectorProjectDetail\(detailResult\.detail, detailResult\.requestGeneration\)/);
  assert.match(source, /aria-disabled=\{directorEditingLocked \|\| directorHasUnsavedChanges\}/);
  assert.match(selector, /Unsaved Legacy changes · Save or discard before switching cuts or songs/);
  assert.match(selector, /data-testid="echo-discard-legacy-edits"/);
  const discardLegacy = between("const handleDiscardLegacyChanges", "const beginProjectSave");
  assert.match(discardLegacy, /fetchProjectDetail\([\s\S]*selectedProjectSongId,[\s\S]*""/);
  assert.match(discardLegacy, /setDirectorHasUnsavedChanges\(false\)/);
  assert.match(discardLegacy, /Unsaved Legacy changes discarded/);
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
  assert.match(selector, /[Tt]he current editable cut remains open/);
  assert.doesNotMatch(selector, /const nextVariantId = event\.target\.value;\s*setWorkingDirectionFork\(null\)/);
  assert.doesNotMatch(selector, /if \(!hydratedVariant\) \{\s*setSelectedDirectionVariantId\("legacy"\)/);
  assert.doesNotMatch(selector, /catch \(error\) \{\s*setSelectedDirectionVariantId\("legacy"\)/);
});
