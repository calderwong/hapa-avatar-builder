import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEchoExternalInternalBridges,
  buildEchoReferenceCoverageCensus,
  buildEchoReferenceResearchQueue,
  runEchoReferenceSharpening,
} from "../src/domain/echo-reference-sharpening.js";

function occurrence(id, songId, line, lyricText, confidence = 0.8) {
  return {
    id,
    songId,
    songTitle: songId,
    confidence,
    pointer: `hapa://echos/${songId}?line=${line}`,
    lyricSpan: {
      lineStart: line,
      lineEnd: line,
      lyricText,
      matchedText: lyricText.split(" ")[0],
    },
  };
}

function externalCard(id, songId, line, lyricText, thematic = "From a surface image to a chosen-family repair.") {
  return {
    id: `reference:${id}`,
    title: id,
    referenceType: "external-work",
    publicContext: `${id} source context`,
    occurrences: [occurrence(`${id}:${songId}`, songId, line, lyricText, 0.9)],
    citations: [{
      id: `${id}:source`,
      url: `https://example.com/${id}`,
      claimIds: [`${id}:claim`],
    }],
    interpretations: [{
      id: `${id}:${songId}:line-${line}`,
      title: "Context expansion",
      confidence: 0.9,
      readingLayers: {
        surface: "A surface image.",
        contextual: `${id} source context`,
        thematic,
        narrative: "The external story adds a comparison lens.",
      },
    }],
    themes: ["chosen-family"],
    mechanics: ["return"],
    emotions: ["hope"],
    aliases: [],
    signalLexicon: {
      literal: [id],
      phonetic: [],
      orthographic: [],
      multilingual: [],
      mechanical: ["return"],
    },
    authority: {
      evidenceClass: "direct",
      reviewStatus: "pending-review",
      canonStatus: "non-canon",
    },
  };
}

function internalCard(id, leftId, rightId, evidenceClass = "comparative", confidence = 0.72) {
  const left = occurrence(`${id}:left`, leftId, 2, "Return to the harbor", confidence);
  const right = occurrence(`${id}:right`, rightId, 3, "Return through the light", confidence);
  return {
    id: `reference-card:${id}`,
    title: id,
    occurrences: [left, right],
    relationships: [{
      fromId: `song:${leftId}`,
      fromType: "song",
      toId: `song:${rightId}`,
      toType: "song",
      relationType: "recurs-with",
      rationale: "Both exact lyric spans repeat return through different images.",
    }],
    interpretations: [{
      id: `${id}:continuation`,
      title: "Recurrence / continuation reading",
      summary: "The later song may continue the return mechanic.",
    }, {
      id: `${id}:contrast`,
      title: "Contrast / independent-use reading",
      summary: "The songs may use return independently.",
    }],
    aliases: ["return"],
    themes: ["chosen-family"],
    mechanics: ["return"],
    emotions: ["hope"],
    signalLexicon: {
      literal: ["return"],
      phonetic: [],
      orthographic: [],
      multilingual: [],
      mechanical: ["return"],
    },
    authority: {
      evidenceClass,
      reviewStatus: "proposed",
      canonStatus: "non-canon",
    },
  };
}

function song(id, title, lines = []) {
  return {
    id,
    title,
    trackNumber: 1,
    lyricsStatus: lines.length ? "available" : "not_found",
    lyrics: lines.map((lineText, index) => ({
      lineNumber: index + 1,
      text: lineText,
      normalized: lineText.toLowerCase(),
    })),
    detectorSignals: {
      properNames: [],
    },
  };
}

function sampleRun() {
  const songs = [
    song("one", "One", ["Guardians Return", "Return to the harbor"]),
    song("two", "Two", ["Nick Carraway Watches", "Return through the light"]),
    song("three", "Three", ["Captain Winters waits", "A different harbor"]),
    song("placeholder", "Placeholder"),
  ];
  const cards = [
    externalCard("external-a", "one", 1, "Guardians Return"),
    externalCard("external-b", "one", 1, "Guardians Return"),
    externalCard("external-c", "one", 1, "Guardians Return"),
    externalCard("external-a-two", "two", 1, "Nick Carraway Watches", "The source complicates the local heroic reading."),
    internalCard("one-two", "one", "two"),
    internalCard("one-three", "one", "three"),
    internalCard("two-three", "two", "three"),
    internalCard("held", "one", "two", "unresolved", 0.34),
  ];
  return {
    runId: "source-run",
    runHash: "source-run-hash",
    packetHash: "packet-hash",
    minerVersion: "miner",
    packet: { songs },
    cards,
    unresolved: [],
  };
}

test("coverage census treats three references as a research prior and missing lyrics as blocked", () => {
  const census = buildEchoReferenceCoverageCensus(sampleRun(), {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
  });
  const one = census.rows.find((row) => row.songId === "one");
  const two = census.rows.find((row) => row.songId === "two");
  const placeholder = census.rows.find((row) => row.songId === "placeholder");

  assert.equal(one.external.status, "coverage-prior-satisfied");
  assert.equal(one.external.distinctReferenceCount, 3);
  assert.equal(two.external.status, "research-required");
  assert.equal(two.external.deficit, 2);
  assert.equal(placeholder.external.status, "blocked-missing-lyrics");
  assert.match(census.contract.rule, /never authorize fabricated references/iu);
});

test("sharpening emits theme questions, holds unresolved routes, and preserves authority", () => {
  const result = runEchoReferenceSharpening(sampleRun(), {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
    internalConfidenceFloor: 0.55,
  });

  assert.equal(result.passes.length, 3);
  assert.equal(result.database.internalRoutes.length, 3);
  assert.equal(result.database.heldInternalRoutes.length, 1);
  assert.equal(result.database.themeDeltas.length, 4);
  assert.equal(result.database.themeDeltas.some((delta) => delta.themeDiscussion.proposedEffect === "reframes"), true);
  assert.equal(result.database.themeDeltas.every((delta) => (
    delta.themeDiscussion.acceptedEffect === null
    && delta.themeDiscussion.humanDecisionRequired
    && delta.authority.canonStatus === "non-canon"
  )), true);
  assert.equal(result.benchmarkComparison.at(-1).headline.authorityViolations, 0);
});

test("research queue produces bounded clue questions without treating clues as references", () => {
  const run = sampleRun();
  const census = buildEchoReferenceCoverageCensus(run, {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
  });
  const result = runEchoReferenceSharpening(run, {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
  });
  const queue = buildEchoReferenceResearchQueue(run, census, [
    ...result.database.internalRoutes,
    ...result.database.heldInternalRoutes,
  ]);
  const two = queue.find((item) => item.songId === "two");
  const placeholder = queue.find((item) => item.songId === "placeholder");

  assert.equal(two.status, "research-ready");
  assert.equal(two.candidateClues.some((clue) => clue.phrase.toLowerCase().includes("carraway")), true);
  assert.equal(two.candidateClues.every((clue) => clue.status === "unresearched-clue"), true);
  assert.equal(placeholder.status, "blocked-missing-lyrics");
  assert.match(placeholder.researchQuestions[0], /Acquire provenance-bound lyrics/iu);
});

test("external-to-internal bridges require proximity or shared language and remain proposed", () => {
  const result = runEchoReferenceSharpening(sampleRun(), {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
    bridgeLineDistance: 4,
  });
  const bridges = buildEchoExternalInternalBridges(
    result.database.themeDeltas,
    [...result.database.internalRoutes, ...result.database.heldInternalRoutes],
    { bridgeLineDistance: 4 }
  );

  assert.equal(bridges.length > 0, true);
  assert.equal(bridges.every((bridge) => (
    bridge.status === "proposed"
    && bridge.authority.humanApproved === false
    && bridge.authority.canonStatus === "non-canon"
  )), true);
});

test("sharpening database is deterministic for the same source graph and configuration", () => {
  const first = runEchoReferenceSharpening(sampleRun(), {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
  });
  const second = runEchoReferenceSharpening(sampleRun(), {
    minimumExternalReferences: 3,
    minimumInternalSongLinks: 2,
  });

  assert.equal(first.sharpeningRunId, second.sharpeningRunId);
  assert.equal(first.databaseHash, second.databaseHash);
});
