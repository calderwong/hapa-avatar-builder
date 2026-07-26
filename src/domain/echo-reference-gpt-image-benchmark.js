import {
  echoReferenceArtDigest,
  isEchoReferenceArtEligible,
  summarizeEchoReferenceArtEligibility,
} from "./echo-reference-card-art.js";
import { compileEchoReferenceVisualScene } from "./echo-reference-local-art.js";

export const ECHO_REFERENCE_GPT_IMAGE_BENCHMARK_SCHEMA = "hapa.echo-reference-gpt-image-benchmark.v1";
export const ECHO_REFERENCE_GPT_IMAGE_BENCHMARK_JOB_SCHEMA = "hapa.echo-reference-gpt-image-benchmark-job.v1";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((value) => value !== null && value !== undefined) : [];
}

function unique(values = []) {
  return [...new Set(list(values).map((value) => text(String(value))).filter(Boolean))];
}

function strongestOccurrence(card = {}) {
  return [...list(card.occurrences)].sort((left, right) => (
    Number(right.confidence || 0) - Number(left.confidence || 0)
    || Number(left.lyricSpan?.lineStart || 1) - Number(right.lyricSpan?.lineStart || 1)
  ))[0] || null;
}

export function buildEchoReferenceGptImagePrompt(card = {}, run = {}) {
  if (!isEchoReferenceArtEligible(card)) {
    throw new Error(`Reference Card ${card.id || "unknown"} is not eligible for a GPT Image benchmark.`);
  }
  const scene = compileEchoReferenceVisualScene(card, run);
  const occurrence = strongestOccurrence(card);
  const context = text(card.publicContext || card.summary).slice(0, 800);
  const themes = unique(card.themes).slice(0, 8);
  const mechanics = unique(card.mechanics).slice(0, 6);
  const explicitRecipe = scene.recipeSource === "explicit-reference-recipe";
  const prompt = [
    "Use case: stylized-concept",
    "Asset type: full-bleed vertical Reference Atlas benchmark illustration, art only",
    "Primary request: create one original, emotionally precise visual interpretation of the source context below.",
    `Interpretive source context: ${context}`,
    themes.length ? `Themes to preserve: ${themes.join("; ")}.` : "",
    mechanics.length ? `Mechanics to make visually legible: ${mechanics.join("; ")}.` : "",
    "The interpretive source context is authoritative. The image must make its specific tension, history, or mechanic legible rather than defaulting to a generic archive, harbor, portal, or fantasy traveler.",
    explicitRecipe ? `Resolved visual thesis: ${scene.thesis}` : "Scene synthesis: invent one concrete original subject performing one concrete action in one context-specific environment; use at most three supporting symbols.",
    explicitRecipe ? `Subject: ${scene.subject}.` : "",
    explicitRecipe ? `Dominant action: ${scene.action}.` : "",
    explicitRecipe ? `Environment: ${scene.environment}.` : "",
    explicitRecipe ? `Supporting symbols: ${scene.symbols.join("; ")}.` : "",
    `Color palette: ${scene.palette.colors.join(", ")}.`,
    `Style/medium: ${scene.style}.`,
    `Composition/framing: vertical 3:4, ${scene.composition}.`,
    "Constraints: use only original people, creatures, clothing, objects, and environments; transform public references into new symbolic actions; keep anatomy, hands, tools, reflections, gravity, and structural geometry coherent.",
    "All visible books, cloth, architecture, equipment, screens, monuments, and objects must be completely unmarked.",
    "Avoid: all text, letters, numerals, signatures, captions, borders, card frames, title plates, logos, emblems, UI panels, celebrity likenesses, copied franchise character designs, collage layouts, watermark.",
  ].filter(Boolean).join("\n");
  const core = {
    prompt,
    scene,
    source: {
      cardId: card.id,
      cardRevisionId: card.revisionId,
      title: card.title,
      citationUrl: text(card.citations?.[0]?.url || card.sources?.[0]?.url),
      occurrenceId: occurrence?.id || "",
      songId: occurrence?.songId || "",
      songTitle: occurrence?.songTitle || "",
    },
    custody: {
      builtInCodexImageGeneration: true,
      sourceCardUnchanged: true,
      generatedOutputIsIdentityTruth: false,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      humanReviewRequired: true,
    },
  };
  return { ...core, promptHash: echoReferenceArtDigest(core) };
}

export function buildEchoReferenceGptImageBenchmarkManifest(run = {}, options = {}) {
  const selected = new Set(unique(options.cardIds));
  const jobs = list(run.cards)
    .filter(isEchoReferenceArtEligible)
    .filter((card) => !selected.size || selected.has(card.id))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .map((card, index) => {
      const compiled = buildEchoReferenceGptImagePrompt(card, run);
      return {
        schemaVersion: ECHO_REFERENCE_GPT_IMAGE_BENCHMARK_JOB_SCHEMA,
        id: `echo-reference-gpt-image:${compiled.promptHash.slice(-24)}`,
        ordinal: index + 1,
        status: "planned",
        ...compiled,
        rawArtifact: null,
        assembledArtifact: null,
        review: {
          status: "not-reviewed",
          decision: "",
          reviewer: "",
          rationale: "",
          decidedAt: "",
        },
      };
    });
  const core = {
    schemaVersion: ECHO_REFERENCE_GPT_IMAGE_BENCHMARK_SCHEMA,
    sourceRunId: text(run.runId),
    sourceRunHash: text(run.runHash),
    sourceGraphHash: text(run.graph?.graphHash),
    generator: "Codex built-in GPT Image",
    jobs,
    eligibility: summarizeEchoReferenceArtEligibility(run),
  };
  return { ...core, manifestHash: echoReferenceArtDigest(core) };
}

export function mergeEchoReferenceGptImageBenchmarkManifest(previous = {}, next = {}) {
  const priorByHash = new Map(list(previous.jobs).map((job) => [job.promptHash, job]));
  const priorByCardId = new Map(list(previous.jobs).map((job) => [job.source?.cardId, job]));
  return {
    ...next,
    jobs: next.jobs.map((job) => {
      const prior = priorByHash.get(job.promptHash) || priorByCardId.get(job.source.cardId);
      if (prior && prior.status !== "planned") {
        return { ...prior, ordinal: job.ordinal };
      }
      return prior
        ? {
          ...job,
          status: prior.status,
          rawArtifact: prior.rawArtifact,
          assembledArtifact: prior.assembledArtifact,
          review: prior.review,
        }
        : job;
    }),
  };
}
