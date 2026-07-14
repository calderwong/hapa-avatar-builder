import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");

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

test("Echo exposes Legacy as the default and guards append-only previews from writes", () => {
  assert.match(source, /useState\("legacy"\)/);
  assert.match(source, /aria-label="Direction script version"/);
  assert.match(source, /Legacy current · editable/);
  assert.match(source, /groupEchoDirectionVariants/);
  assert.match(source, /<optgroup key=\{group\.id\} label=\{group\.label\}>/);
  assert.match(source, /echoDirectionVariantOptionLabel/);
  assert.match(source, /Append-only preview · legacy project unchanged/);
  assert.match(source, /Append-only variant preview is read-only; switch to Legacy current to edit\./);
  assert.match(source, /disabled=\{savingProject \|\| directionVariantReadOnly\}/);
});

test("Echo can continue from a chosen cut and only saves it as a new append-only child", () => {
  assert.match(source, /data-testid="echo-continue-direction-cut"/);
  assert.match(source, /Continue from this cut/);
  assert.match(source, /createEchoDirectionWorkingFork\(activeProject, activeDirectionVariant\)/);
  assert.match(source, /buildEchoDirectionForkRequest\(workingDirectionFork, projectToSave\)/);
  assert.match(source, /\/api\/echos\/direction-variant\/fork/);
  assert.match(source, /Save as new cut/);
  assert.match(source, /source cut and Legacy current remain unchanged/);
  assert.match(source, /data-testid="echo-cancel-direction-cut"/);
});

test("Echo acknowledges save before refreshing and starts Song Card planning from the saved revision only", () => {
  const forkSave = between("const handleSaveWorkingDirectionFork", "const handleSaveProject");
  assert.match(source, /const ECHO_SAVE_TIMEOUT_MS = 30_000/);
  assert.match(source, /Save stopped after 30 seconds without a disk acknowledgment/);
  assert.match(forkSave, /saveEchoProjectRequest\(`/);
  assert.doesNotMatch(forkSave, /await fetchProjectDetail/);
  assert.match(forkSave, /New append-only direction cut saved\. Song Card preparation continues separately in Tracks/);
  assert.match(forkSave, /void fetchProjectDetail\(projectToSave\.song_id, savedVariantId\)\.then/);
  assert.match(forkSave, /queueSongCardPlanForSavedRevision\(projectToSave\.song_id/);
  assert.match(source, /data-testid="echo-save-status"/);
  assert.match(source, /Saving cut · \$\{saveElapsedSeconds\}s/);
  assert.match(source, /planningRevision=\{songCardPlanRevisionBySong\[activeProject\.song_id\] \|\| ""\}/);
  assert.match(source, /Music video blueprint saved to disk\. Song Card preparation is continuing separately in Tracks\./);
});

test("Echo lazily hydrates one selected cut while retaining the metadata catalog", () => {
  assert.match(source, /params\.set\("variantId", variantId\)/);
  assert.match(source, /fetchProjectDetail\(selectedProjectSongId, nextVariantId\)/);
  assert.match(source, /echoDirectionVariantId\(variant\) === nextVariantId && Array\.isArray\(variant\.timeline\)/);
  assert.match(source, /setSelectedDirectionVariantId\(nextVariantId\)/);
  assert.match(source, /disabled=\{loadingProjectDetail\}/);
});
