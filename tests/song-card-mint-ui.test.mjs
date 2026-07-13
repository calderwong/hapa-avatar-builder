import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = path.join(root, "src/components/SongCardMintPanel.jsx");
const source = fs.readFileSync(componentPath, "utf8");

test("SongCardMintPanel exposes the standalone integration contract", () => {
  assert.match(source, /function SongCardMintPanel\(\{ songId, project, showGraph, compact = false, viewerOnly = false, onEditionChange \}\)/);
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
  assert.match(source, />Retry plan</);
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
  assert.match(source, /Local HyperFrames finishing/);
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
  assert.match(source, />Retry render</);
  assert.match(source, /async function retryLocalRender\(\)/);
  assert.match(source, /The final-video render stopped before completion\. Choose Retry render/);
  assert.match(source, /\["awaiting-approval", "approved", "queued", "rendering", "failed"\]/);
  assert.match(source, /localRenderJob\.status\)\.toLowerCase\(\) === "failed"/);
  assert.match(source, /setError\(""\);[\s\S]*?await startLocalRender\(candidateId, \{ announce: false \}\)/);
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
