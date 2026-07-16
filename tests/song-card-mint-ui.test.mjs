import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "src/components/SongCardMintPanel.jsx");
const source = fs.readFileSync(componentPath, "utf8");
const failureHelpSource = fs.readFileSync(path.join(root, "src/domain/song-card-render-failure-help.js"), "utf8");

test("SongCardMintPanel exposes the standalone integration contract", () => {
  assert.match(source, /function SongCardMintPanel\(\{ songId, project, showGraph, compact = false, viewerOnly = false, onEditionChange, planningRevision = "" \}\)/);
  assert.match(source, /fetch\("\/api\/local-ui-session", \{/);
  assert.match(source, /fetch\(base, \{ method: "GET"/);
  assert.match(source, /songCardAdminFetch\(`\$\{base\}\/plan`/);
  assert.match(source, /export async function songCardAdminFetch/);
  assert.match(source, /\[401, 503\]\.includes\(response\.status\)/);
  assert.match(source, /await ensureSongCardLocalSession\(\)/);
  assert.match(source, /collectEmbeddedSongCardSnapshots\(\{ project: selectedProject, showGraph: selectedShowGraph \}\)/);
  assert.match(source, /body: JSON\.stringify\(\{ project: selectedProject, showGraph: selectedShowGraph, cardSnapshots: selectedCardSnapshots \}\)/);
  assert.match(source, /songCardAdminFetch\(`\/api\/song-cards\/\$\{encodeURIComponent\(songId\)\}\/mint`/);
  assert.doesNotMatch(source, /Authorization:/);
  assert.doesNotMatch(source, /Bearer token/);
  assert.doesNotMatch(source, /song-card-mint-token/);
});

test("mint UI names every operator-visible lifecycle and release gate", () => {
  for (const state of ["Up to date", "Changed", "Rendering", "Ready", "Minting", "Failed"]) {
    assert.ok(source.includes(`"${state}"`), `missing state ${state}`);
  }
  assert.match(source, /id: "private-demo", label: "Private demo"/);
  assert.match(source, /id: "public-gate", label: "Public gate"/);
  assert.match(source, /Public gate is blocked/);
  assert.match(source, /data-testid="song-card-guided-defaults"/);
  assert.match(source, /current saved edit, renders into its managed workspace, creates the poster/);
  assert.match(source, /Builder-managed files/);
  assert.match(source, /data-testid="song-card-advanced-recovery"/);
  assert.match(source, /Normal finishing never requires a file path/);
  assert.match(source, /data-testid="song-card-render-master-path"/);
  assert.match(source, /data-testid="song-card-poster-path"/);
  assert.match(source, /Saved revision/);
  assert.match(source, /data-testid="song-card-saved-revision"/);
  assert.match(source, /Confirm mint Edition/);
  assert.match(source, /remintRefreshErrorRef/);
  assert.match(source, /current === remintRefreshErrorRef\.current \? "" : current/);
  assert.match(source, /Use recovery artifacts/);
  assert.match(source, /selectedArtifactsReviewed/);
  assert.match(source, /Cancel current plan/);
  assert.match(source, /: "Retry plan"/);
});

test("background planning is revision-bounded, supersedable, and never silently retried after failure", () => {
  assert.match(source, /const automaticPlanKey = \[/);
  assert.match(source, /String\(planningRevision \|\| "initial-load"\)/);
  assert.match(source, /project\.active_direction_script_variant\?\.fingerprint/);
  assert.match(source, /showGraph\?\.directorV2\?\.variantHash/);
  assert.match(source, /String\(selectedRevision\?\.id \|\| "initial-revision"\)/);
  assert.match(source, /!revisionOptions\.some\(\(row\) => row\.id === selectedRevisionId\)/);
  assert.match(source, /completedAutoPlanKeysRef/);
  assert.match(source, /failedAutoPlanKeysRef/);
  assert.match(source, /planningRequestRef\.current\?\.abort\?\.\(\)/);
  assert.match(source, /activeAutoPlanKeyRef\.current !== automaticPlanKey/);
  assert.match(source, /planningRequestRef\.current\.abort\(\)/);
  assert.match(source, /const scheduledPlanningInput = planningInputRef\.current/);
  assert.match(source, /loadFlow\(\{ source: "auto", autoKey: automaticPlanKey, planningInput: scheduledPlanningInput \}\)/);
  assert.match(source, /failedAutoPlanKeysRef\.current\.add\(autoKey\)/);
  assert.match(source, /failedAutoPlanKeysRef\.current\.has\(automaticPlanKey\)/);
  assert.match(source, /failedAutoPlanKeysRef\.current\.delete\(automaticPlanKey\)/);
  assert.match(source, /data-testid="song-card-plan-status"/);
  assert.match(source, /data-testid="song-card-plan-wait"/);
  assert.match(source, /data-testid="song-card-plan-failure"/);
  assert.match(source, /will not retry automatically/);
  assert.match(source, /disabled=\{phase === "planning"\}/);
});

test("edition history uses immutable edition artifact URLs and timestamp card resolution", () => {
  assert.match(source, /export function songCardEditionArtifactUrl/);
  assert.match(source, /\/editions\/\$\{editionNumber\(edition\)\}\/artifact\/master/);
  assert.match(source, /\/artifact-ticket/);
  assert.match(source, /Immutable edition history/);
  assert.match(source, /data-testid="song-card-edition-video"/);
  assert.match(source, /export function cardsAtSongCardMintTime/);
  assert.match(source, /card\.startSeconds <= time && card\.endSeconds > time/);
  assert.match(source, /card\.startMs !== undefined \? Number\(card\.startMs\) \/ 1000/);
  assert.match(source, /card\.endMs !== undefined \? Number\(card\.endMs\) \/ 1000/);
  assert.match(source, /primary: active\[active\.length - 1\] \|\| null/);
  assert.match(source, /Print primary/);
  assert.match(source, /data-appearance-id/);
  assert.match(source, /hapa:song-card-print-request/);
  assert.match(source, /\/editions\/\$\{selectedEditionRecord\.edition\}\/print/);
  assert.match(source, /printReceipt: printed\.telemetry/);
  assert.match(source, /data-testid="song-card-edition-custody"/);
  assert.match(source, /export function songCardEditionExportUrl/);
  assert.match(source, /data-testid="song-card-export-video"/);
  assert.match(source, /data-testid="song-card-export-bundle"/);
  assert.match(source, /body: JSON\.stringify\(\{ format \}\)/);
  assert.match(source, /exportSelectedEdition\("video"\)/);
  assert.match(source, /exportSelectedEdition\("bundle"\)/);
  for (const label of ["Public manifest", "Lineage", "Telemetry", "Semantic diff"]) assert.ok(source.includes(label));
});

test("plan review keeps semantic changes, reuse, blockers, and immutable edition expectations visible", () => {
  assert.match(source, /semanticDiff/);
  assert.match(source, /dirtyRanges/);
  assert.match(source, /changedFamilies/);
  assert.match(source, /reusableWork/);
  assert.match(source, /blockers/);
  assert.match(source, /expectedEdition: predictedEdition/);
  assert.match(source, /Earlier editions remain immutable/);
  assert.match(source, /onEditionChange\?\.\(number, record\)/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /Mint plan canceled by the local service/);
});

test("Next Mint candidates use managed render defaults, bind automatically, and remain separate from mint confirmation", () => {
  assert.match(source, /data-testid="song-card-remint-candidate"/);
  assert.match(source, /Next Mint render candidate/);
  assert.match(source, /data-testid="song-card-remint-approve"/);
  assert.match(source, /Render next edition/);
  assert.match(source, /export function normalizeSongCardRenderExecutor/);
  assert.match(source, /renderExecutor\?\.available === true/);
  assert.match(source, /data-testid="song-card-renderer-unavailable"/);
  assert.match(source, /Finishing renderer unavailable/);
  assert.match(source, /disabled=\{!localSessionReady \|\| !renderAvailable\}/);
  assert.match(source, /if \(!remintCandidate\?\.id \|\| !renderAvailable\) return/);
  assert.match(source, /\/api\/song-card-remints\/\$\{encodeURIComponent\(remintCandidate\.id\)\}\/approve/);
  assert.match(source, /\/api\/song-card-remints\/enqueue/);
  assert.match(source, /\/api\/song-card-remints\/\$\{encodeURIComponent\(candidateId\)\}\/render-local/);
  assert.match(source, /data-testid="song-card-local-render-progress"/);
  assert.match(source, /Final video render/);
  assert.match(source, /localRenderCompleted\}\/\$\{localRenderTotal/);
  assert.match(source, /one low-memory worker/);
  assert.match(source, /localRenderStartedRef/);
  assert.match(source, /existing local render job and resumed monitoring/);
  assert.match(source, /Builder chooses the render and poster locations, then binds them automatically/);
  assert.match(source, /remintCandidate\?\.status !== "render-ready"/);
  assert.match(source, /bindRemintRenderForReview\(\)/);
  assert.match(source, /data-testid="song-card-remint-auto-bind"/);
  assert.match(source, /data-testid="song-card-remint-bind"/);
  assert.match(source, /\/bind-render-plan/);
  assert.match(source, /queue's hashed master and poster/);
  assert.match(source, /data-testid="song-card-remint-cancel"/);
  assert.match(source, /data-testid="song-card-remint-retry"/);
  assert.match(source, /renderFailureHelp\.buttonLabel \|\| "Retry render"/);
  assert.match(source, /async function retryLocalRender\(\)/);
  assert.match(source, /The final-video render stopped before completion\. Use the recovery action below/);
  assert.match(source, /remintCandidate\?\.renderFailure/);
  assert.match(source, /renderRequestFailure/);
  assert.match(source, /localRenderFailed \|\| remintCandidate\?\.status === "failed" \|\| Boolean\(renderRequestFailure\)/);
  assert.match(source, /String\(localJob\?\.status \|\| ""\)\.toLowerCase\(\) === "failed" \|\| next\?\.status === "failed"/);
  assert.match(source, /data-testid="song-card-render-failure-detail"/);
  assert.match(source, /data-testid="song-card-render-failure-action"/);
  assert.match(source, /data-testid="song-card-render-failure-target"/);
  assert.match(source, /data-failure-category=\{renderFailureHelp\.category\}/);
  assert.match(source, /from "\.\.\/domain\/song-card-render-failure-help\.js"/);
  assert.match(source, /export \{ explainSongCardRenderFailure, normalizeSongCardRenderFailure \}/);
  assert.match(failureHelpSource, /export function explainSongCardRenderFailure/);
  assert.match(failureHelpSource, /function collectEvidence/);
  assert.match(failureHelpSource, /function detachedVisualizersFromSelectedCut/);
  assert.match(failureHelpSource, /detachedVisualizers: inferredDetachedVisualizers/);
  assert.match(source, /\{ project: selectedProject, showGraph: selectedShowGraph, candidate: remintCandidate \}/);
  assert.match(failureHelpSource, /selectedCutMatchesRenderCandidate/);
  assert.match(failureHelpSource, /contextualInferenceAllowed/);
  assert.match(failureHelpSource, /buttonLabel: "Rebuild from saved cut"/);
  assert.match(source, /Affected shader:/);
  assert.match(failureHelpSource, /lost its final-render attachment\. Your saved edit is intact, and no MP4 work started/);
  assert.match(source, /renderFailureHelp\.summary \|\| renderFailureMessage/);
  assert.match(source, /renderFailureHelp\.rawFailureMessage/);
  const failureExplainerStart = failureHelpSource.indexOf("export function explainSongCardRenderFailure");
  const shaderFailureIndex = failureHelpSource.indexOf('category: "shader-route"', failureExplainerStart);
  const audioFailureIndex = failureHelpSource.indexOf('category: "audio-stems"', failureExplainerStart);
  assert.ok(shaderFailureIndex > failureExplainerStart && shaderFailureIndex < audioFailureIndex, "shader evidence must win over generic stem wording");
  for (const category of ["renderer-build", "source-changed", "audio-stems", "visual-media", "shader-route", "local-resources"]) {
    assert.ok(failureHelpSource.includes(`category: "${category}"`), `missing actionable render failure category ${category}`);
  }
  assert.match(source, /\["approved", "queued", "rendering", "failed"\]\.includes\(remintCandidate\.status\)/);
  assert.match(source, /disabled=\{!localSessionReady \|\| \(!renderFailureHelp\.rebuildFromSavedCut && !renderAvailable\) \|\| effectivePhase === "rendering"\}/);
  assert.match(source, /if \(!candidateId \|\| \(!rebuildingSavedCut && !renderAvailable\)\) return/);
  assert.match(source, /normalizeSongCardRenderFailure\(payload/);
  assert.match(source, /data-testid="song-card-render-inactive"/);
  assert.match(source, /Choose Retry plan below to create a clean new attempt/);
  assert.match(source, /\["awaiting-approval", "approved", "queued", "rendering", "failed"\]/);
  assert.match(source, /localRenderJob\.status\)\.toLowerCase\(\) === "failed"/);
  assert.match(source, /setError\(""\);[\s\S]*?await startLocalRender\(candidateId, \{ announce: false \}\)/);
  assert.match(source, /payload\.rehydrated === true && payload\.reviewRequired === true/);
  assert.match(source, /setPlan\(replacementPlan\)/);
  assert.match(source, /setRemintCandidate\(payload\.replacementCandidate \|\| null\)/);
  assert.match(source, /Review and approve the replacement before rendering/);
});

test("mint confirmation never fails silently and opens the minted edition for viewing", () => {
  assert.match(source, /export function explainSongCardMintReadiness/);
  assert.match(source, /data-testid="song-card-mint-readiness"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /A finished video has not been created yet\. Choose Render next edition/);
  assert.match(source, /A verified final video is required, but the finishing renderer is not connected/);
  assert.match(source, /if \(confirmDisabled\) \{[\s\S]*?setNotice\(confirmUnavailableReason/);
  assert.match(source, /data-testid="song-card-confirm-mint"/);
  assert.match(source, /data-testid="song-card-mint-steps"/);
  assert.match(source, /1 · Render final video/);
  assert.match(source, /2 · Confirm mint/);
  assert.match(source, /3 · View or export Edition/);
  assert.match(source, /disabled=\{effectivePhase === "minting"\}/);
  assert.match(source, /aria-disabled=\{confirmDisabled\}/);
  assert.match(source, /data-testid="song-card-view-latest"/);
  assert.match(source, /data-testid="song-card-edition-history"/);
  assert.match(source, /Edition \$\{minted\.edition\} minted and opened below/);
  assert.match(source, /scrollIntoView\?\.\(\{ behavior: "smooth", block: "start" \}\)/);
});

test("Hapa Songs embeds a viewer-only immutable edition surface without starting a mint plan", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(source, /viewerOnly/);
  assert.match(source, /if \(viewerOnly\) \{/);
  assert.match(app, /<SongCardMintPanel[\s\S]*?viewerOnly[\s\S]*?songId=\{selectedSong\.audio\?\.registryTrackId \|\| selectedSong\.songId \|\| selectedSong\.id\}/);
});
