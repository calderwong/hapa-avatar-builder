import { createHash } from "node:crypto";

import {
  echoReferenceArtEligibility,
  echoReferenceArtDigest,
  isEchoReferenceArtEligible,
  summarizeEchoReferenceArtEligibility,
} from "./echo-reference-card-art.js";

export const ECHO_REFERENCE_LOCAL_ART_QUEUE_SCHEMA = "hapa.echo-reference-local-art-queue.v1";
export const ECHO_REFERENCE_LOCAL_ART_JOB_SCHEMA = "hapa.echo-reference-local-art-job.v1";
export const ECHO_REFERENCE_SCENE_SCHEMA = "hapa.echo-reference-visual-scene.v1";
export const ECHO_REFERENCE_LOCAL_PROVIDER = "hapa-media-gen-node";
export const ECHO_REFERENCE_LOCAL_MODEL = "flux2-klein-9b";
export const ECHO_REFERENCE_LOCAL_CARD_SVG_SCHEMA = "hapa.echo-reference-card-svg.v1";
export const ECHO_REFERENCE_KREA_FINISH_SCHEMA = "hapa.echo-reference-krea-finish-handoff.v1";

const PALETTES = Object.freeze([
  { id: "harbor-memory", colors: ["#071B33", "#0D5C63", "#8FD5D2", "#F6C85F"] },
  { id: "ember-archive", colors: ["#160B19", "#6A1B4D", "#E05A47", "#F2C879"] },
  { id: "yew-rebirth", colors: ["#071A16", "#1F5D42", "#8DBF7A", "#E7D9B6"] },
  { id: "liberty-copper", colors: ["#071820", "#28766F", "#8BC6B1", "#F0B44D"] },
  { id: "winter-watch", colors: ["#07111F", "#27435F", "#AFC4D7", "#E8EEF2"] },
  { id: "violet-signal", colors: ["#100A24", "#4E2A84", "#B76BD7", "#79D7FF"] },
]);

const PILOT_SCENE_RECIPES = Object.freeze({
  "reference:dylan-thomas-good-night": {
    thesis: "Demobilization can preserve care without preserving the war identity.",
    subject: "an original battle-worn woman who is also a writer",
    action: "quietly removes her armor at twilight, lays an unneeded weapon on the ground, and uses a fountain pen to mend a torn banner",
    environment: "a peaceful hill above a sleeping town as the first stars yield to dawn",
    symbols: ["folded armor", "repaired cloth", "one warm lamp still burning"],
  },
  "reference:frank-jackson-marys-room": {
    thesis: "Complete description changes when a person encounters the experience itself.",
    subject: "an original scholar leaving a monochrome archive",
    action: "reaches through a doorway and touches a vivid red apple for the first time as color blooms only from the point of contact",
    environment: "a precise black-and-white study opening into a sunlit garden",
    symbols: ["colorless books", "a prism splitting light", "one red reflection in a mirror"],
  },
  "reference:wsdot-tacoma-narrows-sturdy-gertie": {
    thesis: "A failed crossing becomes knowledge that supports a sturdier return.",
    subject: "one suspension bridge spanning a cold tidal narrows",
    action: "stands stable in the present while the water reflection beneath it reveals the earlier deck twisting in wind",
    environment: "a Pacific Northwest channel between forested shores under clearing storm clouds",
    symbols: ["one intact bridge above", "one distorted historical reflection below", "engineers' measuring instruments on the near shore"],
  },
  "reference:grateful-dead-oath-and-folklore": {
    thesis: "Care given to an unknown dead traveler returns later as guidance rather than ownership.",
    subject: "an original road-worn traveler beside an unmarked grave",
    action: "pays a stranger's debt, completes a respectful burial cairn, and discovers a grateful translucent guide lighting the road ahead",
    environment: "a quiet woodland crossroads at dawn",
    symbols: ["a settled ledger with no writing visible", "a completed stone cairn", "a lantern carried by the returning spirit"],
  },
  "reference:mtg-slivers-and-teferi": {
    thesis: "Distinct members strengthen a collective by sharing capabilities without becoming identical.",
    subject: "a fleet of original crystalline lifeforms orbiting a luminous seed",
    action: "each contributes a different visible capability thread to every other member while a timekeeper suspends falling shards around them",
    environment: "an unfamiliar bioluminescent valley where several paths converge",
    symbols: ["interconnected capability threads", "paused fragments of time", "different bodies retaining distinct silhouettes"],
  },
  "reference:fray-i-found-you-playlist-origin": {
    thesis: "A personal playlist can preserve an ordered route through memory rather than merely collecting songs.",
    subject: "an original adult archivist at a listening table before meeting the person the route will later address",
    action: "anchors the first translucent music token, extinguishes a final cigarette in a glass dish, and threads the remaining tokens into one continuous luminous path",
    environment: "a dark winter room opening toward a distant dawn, with the ordered path crossing the threshold",
    symbols: ["the first token glowing brighter than the rest", "one extinguished cigarette", "an unbroken audio ribbon"],
  },
  "reference:asante-page-81": {
    thesis: "A translated thank-you becomes inherited, embodied gratitude when a shared page is carried into living action.",
    subject: "an original grandmother and adult grandchild sharing an open book",
    action: "the grandmother touches one unmarked page while a warm red-gold current passes through their joined hands and settles into a delicate permanent mark on the grandchild's forearm",
    environment: "a quiet reading room whose window opens toward a sunlit Kenyan landscape without treating it as exotic spectacle",
    symbols: ["one open unmarked page", "joined hands", "a living red-gold skin mark"],
  },
  "reference:batman": {
    thesis: "Detective skill and vigilance become restraint when the investigator stops at another person's consent boundary.",
    subject: "an original non-superpowered night investigator in practical unmarked urban gear",
    action: "uses compact optical tools to trace a pattern across rooftops, then deliberately lowers the tools at an illuminated threshold held closed by another person's raised hand",
    environment: "a rain-dark modern city above a quiet protected apartment",
    symbols: ["a precise evidence thread", "lowered tools", "a warm boundary light"],
  },
  "reference:marvel-s-thor": {
    thesis: "Worthiness is expressed by using concentrated power to build, bless, and reconnect rather than merely strike.",
    subject: "an original humble storm guardian carrying a plain short-handled forge hammer",
    action: "channels lightning through the hammer to weld a broken sky bridge while a circular passage opens safely behind the repaired span",
    environment: "a high storm-lit realm connecting a celestial settlement to the living earth below",
    symbols: ["a returning hammer arc", "a repaired bridge joint", "a circular passage of rain and light"],
  },
  "reference:westco-snohomish-origin": {
    thesis: "A private promise made before school uniforms and team identities can remain morally prior to the institutions that arrive later.",
    subject: "two original Washington teenagers beside a cold Snohomish river before an athletic season begins",
    action: "tie a simple promise knot around a weathered wooden marker while unmarked school uniforms wait untouched inside a field house behind them",
    environment: "a misty Pacific Northwest school field meeting river, forest, and early snow",
    symbols: ["the hand-tied knot", "unworn uniforms", "one snowy field tool resting beside the river"],
  },
});

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((value) => value !== null && value !== undefined) : [];
}

function unique(values = []) {
  return [...new Set(list(values).map((value) => text(String(value))).filter(Boolean))];
}

function deterministicSeed(value) {
  return Number.parseInt(createHash("sha256").update(String(value || "")).digest("hex").slice(0, 8), 16);
}

function strongestOccurrence(card = {}) {
  return [...list(card.occurrences)].sort((left, right) => (
    Number(right.confidence || 0) - Number(left.confidence || 0)
    || Number(left.lyricSpan?.lineStart || 1) - Number(right.lyricSpan?.lineStart || 1)
    || String(left.id || "").localeCompare(String(right.id || ""))
  ))[0] || null;
}

function paletteForCard(card = {}) {
  const key = [card.id, ...unique(card.themes), ...unique(card.mechanics)].join("|");
  return PALETTES[deterministicSeed(key) % PALETTES.length];
}

function genericRecipe(card = {}) {
  const search = [
    ...unique(card.themes),
    ...unique(card.mechanics),
    text(card.publicContext || card.summary),
  ].join(" ").toLowerCase();

  if (/bridge|crossing|repair|reconciliation/.test(search)) {
    return {
      thesis: "A damaged route becomes a safer crossing when its failure remains visible.",
      subject: "an original team of builders at a broken crossing",
      action: "repairs one carefully measured span while preserving the failed piece as a visible lesson",
      environment: "a windswept harbor between separated communities",
      symbols: ["survey lines", "a returning path", "one illuminated joint"],
    };
  }
  if (/memory|grief|death|ghost|omitted|absence/.test(search)) {
    return {
      thesis: "Memory becomes useful when it restores a route for an absent participant.",
      subject: "an original keeper welcoming a translucent traveler",
      action: "opens a sheltered doorway and returns a small missing object to its place",
      environment: "a moonlit archive connected to a harbor",
      symbols: ["an empty chair becoming occupied", "a lantern route", "an unresolved open door"],
    };
  }
  if (/liberty|agency|autonomy|consent|freedom/.test(search)) {
    return {
      thesis: "Power becomes legitimate only when the affected person retains choice.",
      subject: "an original navigator holding an unopened gate",
      action: "offers the control key to another traveler instead of operating the gate for them",
      environment: "a copper-green harbor at sunrise",
      symbols: ["an open hand", "a compass with two valid routes", "broken links resting harmlessly at the threshold"],
    };
  }
  if (/time|repetition|refrain|cycle|turn/.test(search)) {
    return {
      thesis: "Repetition can preserve learning instead of resetting the participant.",
      subject: "an original climber inside a vast observatory",
      action: "returns to the same turning stair with new tools and visible marks of prior progress",
      environment: "a tower where dawn and night overlap",
      symbols: ["concentric paths", "a paused pendulum", "accumulated footholds"],
    };
  }
  if (/family|crew|community|shared|collective|adopt/.test(search)) {
    return {
      thesis: "Different participants become a crew by sharing capability without erasing difference.",
      subject: "a diverse group of original travelers around a navigation table",
      action: "connects distinct tools into one route while each participant keeps their own form",
      environment: "the warm interior of a vessel crossing rough water",
      symbols: ["different tools", "one shared map", "separate lights forming a constellation"],
    };
  }
  return {
    thesis: "A compact symbol opens into a larger, reviewable relationship.",
    subject: "an original traveler studying a luminous object",
    action: "follows three visible connections from the object into memory, action, and consequence",
    environment: "a layered landscape joining an archive, a harbor, and a distant path",
    symbols: ["three connected lights", "an open route", "one deliberately unresolved shadow"],
  };
}

function neighborSupport(run = {}, cardId = "", limit = 3) {
  const cardById = new Map(list(run.cards).map((card) => [card.id, card]));
  return list(run.graph?.edges)
    .filter((edge) => edge.relationType === "co-activated-with" && [edge.fromId, edge.toId].includes(cardId))
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0) || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((edge) => {
      const neighborId = edge.fromId === cardId ? edge.toId : edge.fromId;
      return {
        cardId: neighborId,
        title: cardById.get(neighborId)?.title || neighborId,
        sharedSongIds: unique(edge.support?.sharedSongIds),
        sharedThemes: unique(edge.support?.sharedThemes),
        sharedMechanics: unique(edge.support?.sharedMechanics),
        weight: Number(edge.weight || 0),
      };
    });
}

export function compileEchoReferenceVisualScene(card = {}, run = {}) {
  if (!isEchoReferenceArtEligible(card)) {
    throw new Error(`Reference Card ${card.id || "unknown"} is not eligible for local visual-scene compilation.`);
  }
  const occurrence = strongestOccurrence(card);
  const pilotRecipe = PILOT_SCENE_RECIPES[card.id];
  const recipe = pilotRecipe || genericRecipe(card);
  const sceneCore = {
    schemaVersion: ECHO_REFERENCE_SCENE_SCHEMA,
    recipeSource: pilotRecipe ? "explicit-reference-recipe" : "generic-theme-recipe",
    thesis: recipe.thesis,
    subject: recipe.subject,
    action: recipe.action,
    environment: recipe.environment,
    symbols: recipe.symbols.slice(0, 3),
    palette: paletteForCard(card),
    style: "original Hapa NeoBlade painterly cinematic concept art, sophisticated semi-realism, tactile materials, controlled luminous linework, subtle film grain, museum-quality color and light",
    composition: "one dominant action, one focal hierarchy, readable silhouette, foreground-midground-background depth, continuous edge-to-edge scene",
  };
  return {
    ...sceneCore,
    generationPrompt: [
      "Full-bleed vertical cinematic illustration filling the entire 3:4 canvas from edge to edge.",
      `Visual thesis: ${sceneCore.thesis}`,
      `Subject: ${sceneCore.subject}.`,
      `Action: ${sceneCore.action}.`,
      `Environment: ${sceneCore.environment}.`,
      `Supporting symbols: ${sceneCore.symbols.join("; ")}.`,
      `Color palette: ${sceneCore.palette.colors.join(", ")}.`,
      `Style: ${sceneCore.style}.`,
      `Composition: ${sceneCore.composition}.`,
      "All visible surfaces are plain and unmarked. Architecture, books, clothing, tools, banners, screens, and objects contain no lettering, numerals, logos, emblems, ornamental frames, captions, plaques, borders, or interface panels.",
      "Use only original people, creatures, clothing, equipment, and environments. Preserve physically coherent anatomy, hands, tools, gravity, reflections, and structural geometry.",
    ].join("\n"),
    evidence: {
      cardId: card.id,
      cardRevisionId: card.revisionId,
      referenceTitle: card.title,
      publicContext: text(card.publicContext || card.summary),
      occurrenceId: occurrence?.id || "",
      songId: occurrence?.songId || "",
      songTitle: occurrence?.songTitle || "",
      lyricText: text(occurrence?.lyricSpan?.lyricText),
      neighbors: neighborSupport(run, card.id),
    },
    boundary: {
      exactReferenceNamesSentToGenerator: false,
      exactLyricsSentToGenerator: false,
      cardLayoutSentToGenerator: false,
      sourceEvidenceRetainedLocally: true,
      humanReviewRequired: true,
    },
  };
}

export function assertEchoReferenceScenePromptBoundary(scene = {}) {
  const prompt = text(scene.generationPrompt);
  if (!prompt) throw new Error("Visual scene generation prompt is required.");
  const forbiddenExact = [
    text(scene.evidence?.referenceTitle),
    text(scene.evidence?.lyricText),
  ].filter((value) => value.length >= 8);
  for (const value of forbiddenExact) {
    if (prompt.toLowerCase().includes(value.toLowerCase())) {
      throw new Error("Visual scene prompt leaked an exact Reference Atlas title or lyric.");
    }
  }
  if (/\b(reference card|title[- ]plate|collectible card|tarot card)\b/i.test(prompt)) {
    throw new Error("Visual scene prompt must not ask the image model to construct the Card layout.");
  }
  return true;
}

export function buildEchoReferenceLocalArtQueue(run = {}, options = {}) {
  const eligibility = summarizeEchoReferenceArtEligibility(run);
  const width = Math.max(512, Math.min(1536, Math.round(Number(options.width || 1152))));
  const height = Math.max(512, Math.min(2048, Math.round(Number(options.height || 1536))));
  const candidateCount = Math.max(1, Math.min(4, Math.round(Number(options.candidateCount || 3))));
  const selectedCardIds = new Set(unique(options.cardIds));
  const jobs = list(run.cards)
    .filter(isEchoReferenceArtEligible)
    .filter((card) => !selectedCardIds.size || selectedCardIds.has(card.id))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .map((card) => {
      const scene = compileEchoReferenceVisualScene(card, run);
      assertEchoReferenceScenePromptBoundary(scene);
      const jobCore = {
        cardId: card.id,
        cardRevisionId: card.revisionId,
        sourceRunHash: text(run.runHash),
        sourceGraphHash: text(run.graph?.graphHash),
        sceneHash: echoReferenceArtDigest(scene),
        provider: ECHO_REFERENCE_LOCAL_PROVIDER,
        model: ECHO_REFERENCE_LOCAL_MODEL,
        width,
        height,
      };
      const jobHash = echoReferenceArtDigest(jobCore);
      const candidates = Array.from({ length: candidateCount }, (_, index) => {
        const candidateHash = echoReferenceArtDigest({ jobHash, ordinal: index + 1 });
        return {
          id: `echo-reference-local-candidate:${candidateHash.slice(-24)}`,
          candidateHash,
          ordinal: index + 1,
          status: "planned",
          attempt: 0,
          seed: deterministicSeed(candidateHash),
          rawArtifact: null,
          assembledArtifact: null,
          nodeReceipt: null,
          review: {
            status: "not-reviewed",
            decision: "",
            reviewer: "",
            rationale: "",
            decidedAt: "",
          },
          lastError: null,
        };
      });
      return {
        schemaVersion: ECHO_REFERENCE_LOCAL_ART_JOB_SCHEMA,
        id: `echo-reference-local-art:${jobHash.slice(-24)}`,
        jobHash,
        status: "planned",
        source: {
          cardId: card.id,
          cardRevisionId: card.revisionId,
          title: card.title,
          citationUrl: text(card.citations?.[0]?.url || card.sources?.[0]?.url),
          sourceRunId: text(run.runId),
          sourceRunHash: text(run.runHash),
          sourceGraphHash: text(run.graph?.graphHash),
        },
        scene,
        generation: {
          provider: ECHO_REFERENCE_LOCAL_PROVIDER,
          engine: "mflux",
          model: ECHO_REFERENCE_LOCAL_MODEL,
          width,
          height,
          steps: 4,
          guidance: 1,
          outputFormat: "png",
        },
        candidates,
        selectedCandidateId: "",
        custody: {
          localOnlyDefault: true,
          sourceCardUnchanged: true,
          generatedOutputIsIdentityTruth: false,
          publicActivation: false,
          canonPromotion: false,
          mint: false,
          humanReviewRequired: true,
        },
      };
    });
  const queueCore = {
    schemaVersion: ECHO_REFERENCE_LOCAL_ART_QUEUE_SCHEMA,
    sourceRunId: text(run.runId),
    sourceRunHash: text(run.runHash),
    sourceGraphHash: text(run.graph?.graphHash),
    provider: ECHO_REFERENCE_LOCAL_PROVIDER,
    model: ECHO_REFERENCE_LOCAL_MODEL,
    width,
    height,
    candidateCount,
    jobs,
  };
  return {
    ...queueCore,
    queueHash: echoReferenceArtDigest(queueCore),
    counts: {
      cardsConsidered: list(run.cards).length,
      eligibleCards: list(run.cards).filter(isEchoReferenceArtEligible).length,
      plannedJobs: jobs.length,
      plannedCandidates: jobs.length * candidateCount,
      eligibility,
    },
  };
}

export { echoReferenceArtEligibility, summarizeEchoReferenceArtEligibility };

export function mergeEchoReferenceLocalArtQueue(previous = {}, next = {}) {
  const previousJobs = new Map(list(previous.jobs).map((job) => [job.jobHash, job]));
  return {
    ...next,
    jobs: list(next.jobs).map((job) => {
      const prior = previousJobs.get(job.jobHash);
      if (!prior) return job;
      const priorCandidates = new Map(list(prior.candidates).map((candidate) => [candidate.candidateHash, candidate]));
      return {
        ...job,
        selectedCandidateId: prior.selectedCandidateId || "",
        candidates: job.candidates.map((candidate) => (
          priorCandidates.has(candidate.candidateHash)
            ? { ...candidate, ...priorCandidates.get(candidate.candidateHash), seed: candidate.seed }
            : candidate
        )),
      };
    }),
  };
}

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrap(value, maximum = 34, limit = 3) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    if (!current || `${current} ${word}`.length <= maximum) {
      if (!lines.length) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < limit) {
      lines.push(word);
    } else {
      lines[limit - 1] = `${lines[limit - 1].replace(/…$/, "")}…`;
      break;
    }
  }
  return lines;
}

export function buildEchoReferenceCardSvg({
  imageBytes,
  imageMediaType = "image/png",
  title,
  context,
  citationUrl = "",
  cardId,
  candidateId,
  imageSha256,
  palette = PALETTES[0],
} = {}) {
  const bytes = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes || []);
  if (!bytes.length || !String(imageMediaType).startsWith("image/")) {
    throw new Error("Card assembly requires image bytes and an image media type.");
  }
  const titleLines = wrap(title, 30, 2);
  const contextLines = wrap(context, 62, 2);
  let citationHost = "";
  try {
    citationHost = citationUrl ? new URL(citationUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    citationHost = "";
  }
  const colors = palette?.colors?.length >= 4 ? palette.colors : PALETTES[0].colors;
  const titleMarkup = titleLines.map((line, index) => (
    `<text x="600" y="${1595 + index * 55}" text-anchor="middle" class="title">${xml(line)}</text>`
  )).join("");
  const contextStart = titleLines.length > 1 ? 1718 : 1668;
  const contextMarkup = contextLines.map((line, index) => (
    `<text x="600" y="${contextStart + index * 32}" text-anchor="middle" class="context">${xml(line)}</text>`
  )).join("");
  const encoded = bytes.toString("base64");
  const metadata = xml(JSON.stringify({
    schemaVersion: ECHO_REFERENCE_LOCAL_CARD_SVG_SCHEMA,
    cardId,
    candidateId,
    imageSha256,
    generatedOutputIsIdentityTruth: false,
    humanReviewRequired: true,
  }));
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-labelledby="title desc">`,
    `<title id="title">${xml(title)}</title>`,
    `<desc id="desc">${xml(context)}</desc>`,
    `<metadata>${metadata}</metadata>`,
    `<defs>`,
    `<clipPath id="art"><rect x="42" y="42" width="1116" height="1460" rx="38"/></clipPath>`,
    `<linearGradient id="plate" x1="0" x2="1"><stop offset="0" stop-color="${xml(colors[0])}"/><stop offset="1" stop-color="${xml(colors[1])}"/></linearGradient>`,
    `<style>.title{font:700 45px Georgia,serif;fill:${xml(colors[3])}}.context{font:400 24px Georgia,serif;fill:#F6F0E4}.meta{font:600 18px system-ui,sans-serif;letter-spacing:2px;fill:${xml(colors[2])}}</style>`,
    `</defs>`,
    `<rect width="1200" height="1800" rx="54" fill="${xml(colors[0])}"/>`,
    `<image href="data:${xml(imageMediaType)};base64,${encoded}" x="42" y="42" width="1116" height="1460" preserveAspectRatio="xMidYMid slice" clip-path="url(#art)"/>`,
    `<rect x="42" y="42" width="1116" height="1716" rx="38" fill="none" stroke="${xml(colors[3])}" stroke-width="7"/>`,
    `<path d="M42 1502H1158V1720Q1158 1758 1120 1758H80Q42 1758 42 1720Z" fill="url(#plate)" opacity=".97"/>`,
    titleMarkup,
    contextMarkup,
    `<text x="78" y="1740" class="meta">${xml(citationHost || "REFERENCE ATLAS")}</text>`,
    `<text x="1122" y="1740" text-anchor="end" class="meta">REVIEW REQUIRED</text>`,
    `</svg>`,
  ].join("");
}

export function reviewEchoReferenceLocalCandidate(queue = {}, input = {}, now = () => new Date().toISOString()) {
  const candidateId = text(input.candidateId);
  const reviewer = text(input.reviewer);
  const decision = ["accepted", "rejected"].includes(input.decision) ? input.decision : "";
  if (!candidateId || !reviewer || !decision) {
    throw new Error("Candidate review requires candidateId, reviewer, and accepted/rejected decision.");
  }
  let found = false;
  const jobs = list(queue.jobs).map((job) => {
    let acceptedId = job.selectedCandidateId || "";
    const candidates = list(job.candidates).map((candidate) => {
      if (candidate.id !== candidateId) return candidate;
      found = true;
      if (candidate.status !== "review-required" || !candidate.rawArtifact?.sha256 || !candidate.assembledArtifact?.sha256) {
        throw new Error(`Local Reference art candidate ${candidateId} is not ready for review.`);
      }
      if (decision === "accepted") acceptedId = candidateId;
      else if (acceptedId === candidateId) acceptedId = "";
      return {
        ...candidate,
        status: decision,
        review: {
          status: "completed",
          decision,
          reviewer,
          rationale: text(input.rationale),
          decidedAt: now(),
        },
      };
    });
    return {
      ...job,
      candidates,
      selectedCandidateId: acceptedId,
      status: acceptedId ? "candidate-accepted" : candidates.some((candidate) => candidate.status === "review-required") ? "review-required" : job.status,
    };
  });
  if (!found) throw new Error(`Unknown local Reference art candidate ${candidateId}.`);
  return { ...queue, jobs };
}

export function buildEchoReferenceKreaFinishHandoff(queue = {}, input = {}, now = () => new Date().toISOString()) {
  const job = list(queue.jobs).find((candidate) => candidate.id === input.jobId);
  if (!job?.selectedCandidateId) throw new Error("Krea finishing requires a job with an accepted candidate.");
  const candidate = list(job.candidates).find((item) => item.id === job.selectedCandidateId);
  if (!candidate?.rawArtifact?.localPath || !candidate?.rawArtifact?.sha256) {
    throw new Error("Accepted candidate is missing its local source artifact.");
  }
  const core = {
    schemaVersion: ECHO_REFERENCE_KREA_FINISH_SCHEMA,
    status: "held-for-explicit-operator-run",
    operation: "comic_panel_restyle",
    recommendedPreset: "comic_panel_restyle_quality",
    source: {
      jobId: job.id,
      candidateId: candidate.id,
      cardId: job.source.cardId,
      localPath: candidate.rawArtifact.localPath,
      sha256: candidate.rawArtifact.sha256,
    },
    instruction: "Preserve the accepted composition and all subject relationships. Strengthen the original Hapa NeoBlade painterly line and color separation. Keep every surface unmarked and do not introduce borders, captions, logos, or identity claims.",
    custody: {
      sourceArtifactUnchanged: true,
      generatedOutputIsIdentityTruth: false,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      humanReviewRequired: true,
    },
    createdAt: now(),
  };
  return { ...core, handoffHash: echoReferenceArtDigest(core) };
}
