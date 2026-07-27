import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEchoReferencePreviewFirstAuthority,
  attachEchoReferenceMedia,
  buildEchoReferenceTarotCards,
  selectEchoReferenceRuntimeRun,
} from "../src/domain/echo-reference-runtime.js";

function card(overrides = {}) {
  return {
    id: "reference:one",
    revisionId: "reference:one:r2",
    title: "One",
    summary: "A test reference.",
    publicContext: "Public context.",
    occurrences: [{ id: "occ:1", songId: "song:one", songTitle: "Song One", lyricSpan: { lineStart: 4, lyricText: "One line" } }],
    citations: [{ id: "cite:1", label: "Primary", url: "https://example.test/source", sourceClass: "primary" }],
    interpretations: [{ id: "reading:1", title: "Reading", summary: "A reading.", confidence: 0.8 }],
    authority: { reviewStatus: "pending-review", evidenceClass: "source-backed-candidate" },
    themes: ["return"],
    mechanics: ["replay"],
    emotions: ["hope"],
    ...overrides,
  };
}

test("runtime selects the richer research projection without promoting its authority", () => {
  const localRun = { runHash: "local", cards: [card()] };
  const researchRun = {
    runHash: "research",
    cards: [card(), card({ id: "reference:two" })],
    contributions: [{ type: "external-reference-research-proposal", status: "pending-human-review" }],
  };
  const result = selectEchoReferenceRuntimeRun({ localRun, researchRun });
  assert.equal(result.source, "external-research-projection");
  assert.equal(result.run.runHash, "research");
  assert.equal(result.run.contributions[0].status, "pending-human-review");
});

test("media attaches only to the exact Card revision", () => {
  const run = { cards: [card()], contributions: [] };
  const matching = attachEchoReferenceMedia(run, {
    records: [{
      card: { id: "reference:one", revisionId: "reference:one:r2" },
      artifacts: {
        image: { uri: "/one.png", sha256: "image" },
        loopVideo: { runtimeUri: "/one.mp4", sha256: "video" },
      },
      pattern: { id: "adaptive-default" },
      technical: { directorEligible: true },
    }],
  });
  assert.equal(matching.referenceRuntime.mediaBacked, 1);
  assert.equal(matching.cards[0].presentationMedia.loopVideo.uri, "/one.mp4");
  assert.equal(matching.cards[0].presentationMedia.custody.previewVisibility, "visible-before-review");

  const stale = attachEchoReferenceMedia(run, {
    records: [{
      card: { id: "reference:one", revisionId: "reference:one:r1" },
      artifacts: { image: { uri: "/stale.png" } },
    }],
  });
  assert.equal(stale.referenceRuntime.mediaBacked, 0);
  assert.equal(stale.referenceRuntime.staleRevisionCount, 1);
  assert.equal(stale.cards[0].presentationMedia, undefined);
});

test("preview-first authority approves supported exact revisions and resolves unsupported leads without canon promotion", () => {
  const supported = card({
    relationships: [{
      id: "edge:one",
      fromId: "reference:one",
      toId: "song:one",
      evidenceClass: "direct",
      status: "pending-review",
      provenance: { decisionIds: [] },
    }],
  });
  const unresolved = card({
    id: "reference:unknown",
    revisionId: "reference:unknown:r1",
    authority: { reviewStatus: "proposed", evidenceClass: "unresolved", canonStatus: "non-canon" },
    unresolved: [{ id: "unknown:1", label: "Unknown", status: "open" }],
  });
  const run = {
    runHash: "run:approved",
    cards: [supported, unresolved],
    graph: {
      edges: [
        { id: "edge:one", fromId: "reference:one", toId: "song:one", fromType: "reference-card", toType: "song", evidenceClass: "direct", status: "pending-review" },
        { id: "edge:unknown", fromId: "reference:unknown", toId: "song:one", fromType: "reference-card", toType: "song", evidenceClass: "unresolved", status: "proposed" },
      ],
    },
    unresolved: [{ id: "unresolved:1", status: "open" }],
    contributions: [{ id: "research:1", type: "external-reference-research-proposal", status: "pending-human-review" }],
  };
  const mediaCatalog = {
    records: [{
      card: { id: "reference:one", revisionId: "reference:one:r2" },
      custody: { humanReviewRequired: true, canonPromotion: false, publicActivation: false },
    }],
  };
  const receipt = {
    schemaVersion: "hapa.echo-reference-preview-first-authority.v1",
    id: "receipt:one",
    approvedAt: "2026-07-27T00:00:00.000Z",
    approvedBy: "Human owner",
    source: { runHash: "run:approved" },
    policy: {
      approvedUseScopes: ["local-reference-atlas", "echo-director-candidate"],
      publicActivation: false,
      canonPromotion: false,
    },
    approvedCards: [{ cardId: "reference:one", revisionId: "reference:one:r2" }],
    resolvedWithoutPromotion: [{ cardId: "reference:unknown", revisionId: "reference:unknown:r1" }],
    resolvedResearchUpdates: [{ id: "research:1" }],
    approvedMedia: [{ cardId: "reference:one", revisionId: "reference:one:r2" }],
  };
  const result = applyEchoReferencePreviewFirstAuthority(run, mediaCatalog, receipt);
  assert.equal(result.authoritySummary.status, "applied");
  assert.equal(result.run.cards[0].authority.reviewStatus, "approved");
  assert.equal(result.run.cards[0].authority.canonStatus, undefined);
  assert.equal(result.run.cards[0].relationships[0].humanApproved, true);
  assert.equal(result.run.cards[1].authority.reviewStatus, "rejected");
  assert.equal(result.run.cards[1].reviewResolution.status, "resolved-without-promotion");
  assert.equal(result.run.unresolved[0].status, "resolved-without-promotion");
  assert.equal(result.run.contributions[0].status, "resolved-approved");
  assert.equal(result.run.graph.edges[0].status, "approved");
  assert.equal(result.run.graph.edges[1].reviewResolution, "resolved-without-promotion");
  assert.equal(result.mediaCatalog.records[0].custody.reviewStatus, "approved");
  assert.equal(result.mediaCatalog.records[0].custody.humanReviewRequired, false);
  assert.equal(result.mediaCatalog.records[0].custody.publicActivation, false);
  assert.equal(result.mediaCatalog.records[0].custody.canonPromotion, false);
});

test("media-backed research Cards become readable and playable Tarot Cards", () => {
  const run = attachEchoReferenceMedia({ cards: [card()], contributions: [] }, {
    records: [{
      card: { id: "reference:one", revisionId: "reference:one:r2" },
      artifacts: {
        image: { uri: "/one.png" },
        loopVideo: { runtimeUri: "/one.mp4" },
      },
      technical: { directorEligible: true },
    }],
  });
  const cards = buildEchoReferenceTarotCards(run, { songId: "song:one" });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardType, "reference_card");
  assert.equal(cards[0].videoSources[0].uri, "/one.mp4");
  assert.equal(cards[0].referenceAtlas.publicContext, "Public context.");
  assert.equal(cards[0].referenceAtlas.authority.reviewStatus, "pending-review");
  assert.equal(buildEchoReferenceTarotCards(run, { songId: "song:other" }).length, 0);
});
