import assert from "node:assert/strict";
import test from "node:test";

import {
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
