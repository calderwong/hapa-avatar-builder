import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  buildEchoReferenceGptImageLibrary,
  classifyEchoReferenceImageRecord,
} from "../src/domain/echo-reference-gpt-image-library.js";

const run = {
  runId: "reference-run",
  runHash: "sha256:run",
  cards: [
    {
      id: "reference:explicit",
      revisionId: "reference:explicit:r1",
      title: "Explicit Codex image",
      summary: "One clear meaning.",
      referenceType: "motif",
      authority: { reviewStatus: "approved", evidenceClass: "direct" },
      occurrences: [{ songId: "song:b", songTitle: "Blue Song" }],
    },
    {
      id: "reference:earlier",
      revisionId: "reference:earlier:r1",
      title: "Earlier GPT image",
      occurrences: [
        { songId: "song:a", songTitle: "Amber Song" },
        { songId: "song:b", songTitle: "Blue Song" },
      ],
    },
    { id: "reference:stale", revisionId: "reference:stale:r2", title: "Stale" },
  ],
};

function mediaRecord(cardId, revisionId, patch = {}) {
  return {
    card: { id: cardId, revisionId },
    sourceBenchmark: {
      manifestHash: "sha256:manifest",
      jobId: `echo-reference-gpt-image:${cardId}`,
      promptHash: `sha256:${cardId}`,
      generator: "",
    },
    artifacts: {
      image: {
        path: `/private/source/${cardId}.png`,
        sourcePath: `/private/original/${cardId}.png`,
        uri: `/media/${cardId}.png`,
        sha256: `sha256:${cardId}`,
      },
      loopVideo: {
        uri: `/media/${cardId}.mp4`,
        sha256: `sha256:loop:${cardId}`,
      },
    },
    ...patch,
  };
}

test("GPT Image library returns every exact-revision Codex/GPT still and rejects later Flux/Krea lanes", () => {
  const mediaCatalog = {
    updatedAt: "2026-07-27T00:00:00.000Z",
    records: [
      mediaRecord("reference:explicit", "reference:explicit:r1", {
        sourceBenchmark: {
          generator: "Codex built-in GPT Image",
          jobId: "echo-reference-gpt-image:explicit",
          promptHash: "sha256:prompt-explicit",
          manifestHash: "sha256:manifest-explicit",
        },
      }),
      mediaRecord("reference:earlier", "reference:earlier:r1"),
      mediaRecord("reference:stale", "reference:stale:r1"),
      mediaRecord("reference:krea", "reference:krea:r1", {
        provider: "Krea Flux",
      }),
      mediaRecord("reference:flux", "reference:flux:r1", {
        sourceBenchmark: { generator: "Black Forest Labs FLUX.2", jobId: "flux:1" },
      }),
    ],
  };

  const library = buildEchoReferenceGptImageLibrary(run, mediaCatalog);
  assert.equal(library.counts.total, 2);
  assert.equal(library.counts.explicitCodex, 1);
  assert.equal(library.counts.earlierGpt, 1);
  assert.equal(library.counts.loopReady, 2);
  assert.equal(library.counts.excludedFluxKrea, 2);
  assert.equal(library.counts.staleBindings, 1);
  assert.equal(library.policy.allItemsReturned, true);
  assert.deepEqual(library.items.map((item) => item.id), ["reference:earlier", "reference:explicit"]);
  assert.deepEqual(library.items[0].songs.map((song) => song.title), ["Amber Song", "Blue Song"]);
  assert.equal(library.items[0].loopVideo.uri, "/media/reference:earlier.mp4");
  assert.equal(library.items[0].connection.lyricMoments.length, 2);
  assert.doesNotMatch(JSON.stringify(library), /\/private\//, "local custody paths must not reach the browser");
});

test("later Flux/Krea provenance wins over an old GPT-shaped job id", () => {
  assert.equal(classifyEchoReferenceImageRecord(mediaRecord("reference:a", "reference:a:r1", {
    provider: "Krea",
  })), "later-flux-krea");
  assert.equal(classifyEchoReferenceImageRecord(mediaRecord("reference:b", "reference:b:r1")), "codex-gpt-image");
});

test("Reference Atlas exposes a complete searchable GPT Image-only gallery and large preview", async () => {
  const [component, explorer, css, store, api, hoverMedia] = await Promise.all([
    fs.readFile(new URL("../src/components/EchoReferenceGptImageLibrary.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/components/EchoReferenceExplorer.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/index.css", import.meta.url), "utf8"),
    fs.readFile(new URL("../server/echo-reference-mining-store.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/components/EchoHoverLoopMedia.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(explorer, /View all \{totalCount\.toLocaleString\(\)\} GPT Image references/);
  assert.match(explorer, /<EchoReferenceGptImageLibrary/);
  assert.match(component, /Codex \/ GPT Image References/);
  assert.match(component, /Later Flux and Krea generations are excluded by provenance/);
  assert.match(component, /Showing \{visibleItems\.length\.toLocaleString\(\)\} of/);
  assert.match(component, /Search titles, songs, meanings/);
  assert.match(component, /Both GPT Image passes/);
  assert.match(component, /Open reference logic in Atlas/);
  assert.match(component, /Why it connects/);
  assert.match(component, /What the Atlas understands/);
  assert.match(component, /loopVideo/);
  assert.match(hoverMedia, /onPointerEnter/);
  assert.match(hoverMedia, /prefers-reduced-motion: reduce/);
  assert.match(component, /data-testid="echo-gpt-reference-library-grid"/);
  assert.doesNotMatch(component, /\.slice\(/, "the album gallery must not silently paginate or truncate the corpus");
  assert.match(css, /\.echo-gpt-reference-library-grid/);
  assert.match(css, /\.echo-gpt-reference-library-inspector/);
  assert.match(store, /buildEchoReferenceGptImageLibrary/);
  assert.match(api, /\/api\/echos\/references\/gpt-image-library/);
});

test("Reference Atlas exposes the latest generated API run as a first-class gallery ingress", async () => {
  const [explorer, latestRun, api, loopStatus] = await Promise.all([
    fs.readFile(new URL("../src/components/EchoReferenceExplorer.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/components/EchoLatestReferenceRunGallery.jsx", import.meta.url), "utf8"),
    fs.readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    fs.readFile(new URL("../server/echo-reference-loop-generation-status.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(explorer, /<EchoLatestReferenceRunGallery apiBase=\{apiBase\}/);
  assert.match(latestRun, /Latest GPT Image run/);
  assert.match(latestRun, /Open latest run gallery/);
  assert.match(latestRun, /\/api\/echos\/reference-image-generation/);
  assert.match(latestRun, /echo-latest-reference-run-grid/);
  assert.match(latestRun, /EchoHoverLoopMedia/);
  assert.match(latestRun, /\/api\/echos\/reference-loop-generation/);
  assert.match(api, /\/api\/echos\/reference-loop-generation\/assets\//);
  assert.match(loopStatus, /sourceJobId/);
  assert.doesNotMatch(latestRun, /\.slice\(/, "the latest run gallery must not silently truncate generated images");
});
