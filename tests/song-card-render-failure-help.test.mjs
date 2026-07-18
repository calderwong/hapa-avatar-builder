import test from "node:test";
import assert from "node:assert/strict";
import {
  explainSongCardRenderFailure,
  normalizeSongCardRenderFailure,
} from "../src/domain/song-card-render-failure-help.js";

test("render failure help classifies real evidence and bounds selected-cut inference", () => {
  const structuredMessage = normalizeSongCardRenderFailure({
    failure: {
      code: { code: "local_render_failed" },
      message: { summary: "Readable failure" },
      stage: { status: "render" },
    },
  });
  assert.equal(structuredMessage.code, "local_render_failed");
  assert.equal(structuredMessage.message, "Readable failure");
  assert.equal(structuredMessage.stage, "render");
  assert.doesNotMatch(Object.values(structuredMessage).filter((value) => typeof value === "string").join(" "), /\[object Object\]/);

  const mediaOnly = explainSongCardRenderFailure({
    code: "local_compile_media_offline",
    stage: "compile",
    details: {
      media: { unresolved: [{ code: "missing-media", cueId: "media:4" }] },
      visualizers: { unresolved: [] },
    },
  });
  assert.equal(mediaOnly.category, "visual-media");

  const context = {
    candidate: { variantId: "working:cut-one" },
    project: {
      active_direction_script_variant: { id: "cut-one" },
      visualizer_timeline: [{
        start_sec: 213,
        end_sec: 230,
        visualizer_id: "isf:linescape",
        visualizer_title: "Linescape",
      }],
    },
    showGraph: {
      directorV2: { variantId: "working:cut-one" },
      tracks: [{
        id: "track-b",
        role: "visualizer",
        cards: [{
          id: "projected:track-b:9",
          startSeconds: 213,
          endSeconds: 230,
          visualization: { sourceId: "isf:linescape", status: "portable-card-missing" },
          provenance: { portableCardStatus: "missing-for-requested-source" },
        }],
      }],
    },
  };

  const resources = explainSongCardRenderFailure({ code: "enospc", stage: "render" }, context);
  assert.equal(resources.category, "local-resources");
  assert.equal(resources.affectedShader, undefined);

  const unrelatedDiagnostic = explainSongCardRenderFailure({
    code: "local_render_failed",
    stage: "render",
    details: {
      diagnostic: {
        code: "missing-offline-stems",
        reason: "a prior probe mentioned a shader proxy",
      },
    },
  }, context);
  assert.equal(unrelatedDiagnostic.category, "render");
  assert.equal(unrelatedDiagnostic.affectedShader, undefined);

  const missingStems = explainSongCardRenderFailure({
    code: "render-readiness-not-ready",
    stage: "render-readiness",
    details: {
      blockers: [{ code: "missing-offline-stems", visualizerCueCount: 0 }],
    },
  }, context);
  assert.equal(missingStems.category, "audio-stems");
  assert.equal(missingStems.affectedShader, undefined);
  assert.equal(missingStems.rebuildFromSavedCut, undefined);

  const blankShader = explainSongCardRenderFailure({
    code: "local_renderer_truth_failed",
    stage: "pixel-qa",
    details: {
      failedChecks: ["shaderCanvasNonBlank"],
      blankShaderCanvasFrames: [210.5],
      blankShaderCanvasFrameDetails: [{
        timestamp: 210.5,
        expected: [{ cueId: "card:b:9", visualizerId: "isf:alpha-only" }],
      }],
    },
  }, context);
  assert.equal(blankShader.category, "shader-route");
  assert.equal(blankShader.rebuildFromSavedCut, true);
  assert.equal(blankShader.title, "The selected shader produced a blank final-render frame.");
  assert.equal(blankShader.affectedShader, "isf:alpha-only · at 3:30.5 (210.5s)");
  assert.equal(blankShader.buttonLabel, "Rebuild from saved cut");
  assert.match(blankShader.nextAction, /corrected shader catalog/);

  const detached = explainSongCardRenderFailure({
    code: "local_render_start_certification_not_ready",
    stage: "render-start-certification",
    details: { blockers: [{ code: "signal-graph-preflight-failed", stage: "signal-graph-preflight" }] },
  }, context);
  assert.equal(detached.category, "shader-route");
  assert.equal(detached.rebuildFromSavedCut, true);
  assert.equal(detached.affectedShader, "Linescape · 3:33–3:50 (213–230s)");

  const structuredDetached = explainSongCardRenderFailure({
    code: "local_render_start_certification_not_ready",
    message: { summary: "Structured detached shader failure" },
    stage: "render-start-certification",
    details: { blockers: [{ code: "signal-graph-preflight-failed" }] },
  }, context);
  assert.equal(structuredDetached.rawFailureMessage, "Structured detached shader failure");
  assert.doesNotMatch(JSON.stringify(structuredDetached), /\[object Object\]/);

  const missingVisualization = explainSongCardRenderFailure({
    code: "local_render_start_certification_not_ready",
    stage: "render-start-certification",
    details: { blockers: [{ code: "signal-graph-preflight-failed" }] },
  }, {
    ...context,
    showGraph: {
      ...context.showGraph,
      tracks: [{
        id: "track-b",
        role: "visualizer",
        cards: [{
          id: "projected:track-b:9",
          startSeconds: 213,
          endSeconds: 230,
          media: { id: "isf:linescape", title: "Linescape" },
          provenance: { portableCardStatus: "missing-for-requested-source" },
        }],
      }],
    },
  });
  assert.equal(missingVisualization.rebuildFromSavedCut, true);
  assert.equal(missingVisualization.affectedShader, "Linescape · 3:33–3:50 (213–230s)");

  for (const passThroughCard of [
    { ...context.showGraph.tracks[0].cards[0], disabled: true },
    { ...context.showGraph.tracks[0].cards[0], knocked_out: true },
    { ...context.showGraph.tracks[0].cards[0], visualization: { sourceId: "none" } },
  ]) {
    const passThrough = explainSongCardRenderFailure({
      code: "local_render_start_certification_not_ready",
      stage: "render-start-certification",
      details: { blockers: [{ code: "signal-graph-preflight-failed" }] },
    }, {
      ...context,
      showGraph: {
        ...context.showGraph,
        tracks: [{ ...context.showGraph.tracks[0], cards: [passThroughCard] }],
      },
    });
    assert.equal(passThrough.affectedShader, undefined);
    assert.equal(passThrough.rebuildFromSavedCut, undefined);
  }

  const mismatchedCut = explainSongCardRenderFailure({
    code: "local_render_start_certification_not_ready",
    stage: "render-start-certification",
    details: { blockers: [{ code: "signal-graph-preflight-failed", stage: "signal-graph-preflight" }] },
  }, { ...context, candidate: { variantId: "working:another-cut" } });
  assert.equal(mismatchedCut.affectedShader, undefined);
  assert.equal(mismatchedCut.rebuildFromSavedCut, undefined);
});
