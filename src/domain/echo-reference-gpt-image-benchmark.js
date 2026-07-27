import {
  echoReferenceArtEligibility,
  echoReferenceArtDigest,
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

const GENERATION_SENSITIVE_PUBLIC_FIGURE_TERMS = Object.freeze([
  "donald trump",
  "trump",
  "epstein",
]);

function containsSensitivePublicFigure(value) {
  const normalized = text(value).toLowerCase();
  return GENERATION_SENSITIVE_PUBLIC_FIGURE_TERMS.some((term) => normalized.includes(term));
}

function generationSafeMoment(value) {
  const normalized = text(value);
  if (!normalized) return "";
  if (containsSensitivePublicFigure(normalized)) {
    return "A long quoted news passage alleges institutional message control, hidden influence, and failures of public accountability";
  }
  return normalized.length > 220 ? `${normalized.slice(0, 217)}…` : normalized;
}

function strongestOccurrence(card = {}) {
  return [...list(card.occurrences)].sort((left, right) => (
    Number(right.confidence || 0) - Number(left.confidence || 0)
    || Number(left.lyricSpan?.lineStart || 1) - Number(right.lyricSpan?.lineStart || 1)
  ))[0] || null;
}

export function buildEchoReferenceGptImagePrompt(card = {}, run = {}, options = {}) {
  const eligibilityOptions = { approvedAtlas: options.approvedAtlas === true };
  if (!echoReferenceArtEligibility(card, eligibilityOptions).eligible) {
    throw new Error(`Reference Card ${card.id || "unknown"} is not eligible for a GPT Image benchmark.`);
  }
  const scene = compileEchoReferenceVisualScene(card, run, eligibilityOptions);
  const occurrence = strongestOccurrence(card);
  const context = (
    options.approvedAtlas === true
      ? unique([card.summary, card.publicContext]).join(" ")
      : text(card.publicContext || card.summary)
  ).slice(0, 1200);
  const themes = unique(card.themes).slice(0, 8);
  const mechanics = unique(card.mechanics).slice(0, 6);
  const signals = unique([
    ...list(card.signalLexicon?.literal),
    ...list(card.signalLexicon?.phonetic),
    ...list(card.signalLexicon?.orthographic),
    ...list(card.signalLexicon?.multilingual),
    ...list(card.aliases),
  ]).slice(0, 8);
  const comparativeMoments = list(card.occurrences)
    .map((item) => generationSafeMoment(item.lyricSpan?.lyricText))
    .filter(Boolean)
    .slice(0, 3);
  const explicitRecipe = scene.recipeSource === "explicit-reference-recipe";
  const referencePack = options.referencePacks?.[card.id] || null;
  const primaryAvatar = referencePack?.primaryAvatar || null;
  const supportingAvatars = list(referencePack?.supportingAvatars);
  const referenceImagery = list(referencePack?.referenceImagery);
  const generationSafeReferenceImagery = referenceImagery.filter((item) => !containsSensitivePublicFigure(item.title));
  const generationBoundary = referenceImagery.length !== generationSafeReferenceImagery.length
    ? "Named public-figure source Cards remain connected in Atlas text and provenance, but their images and likenesses are excluded from generation. Render the institutional accountability mechanic through original anonymous figures and objects."
    : "";
  const prompt = [
    "Use case: stylized-concept",
    "Asset type: full-bleed vertical Reference Atlas benchmark illustration, art only",
    "Primary request: create one original, emotionally precise visual interpretation of the source context below.",
    `Interpretive source context: ${context}`,
    themes.length ? `Themes to preserve: ${themes.join("; ")}.` : "",
    mechanics.length ? `Mechanics to make visually legible: ${mechanics.join("; ")}.` : "",
    signals.length ? `Shared symbolic signals: ${signals.join("; ")}.` : "",
    comparativeMoments.length > 1
      ? `Comparative lyric moments to synthesize visually: ${comparativeMoments.join(" ↔ ")}. Show their transformation or tension as one continuous action, never as a split panel or collage.`
      : comparativeMoments.length === 1 ? `Lyric moment to ground visually: ${comparativeMoments[0]}.` : "",
    primaryAvatar
      ? `Reference image role 1 — primary Hapa identity anchor: preserve ${primaryAvatar.name}'s recognizable face, silhouette, species, and registered styling while placing the Avatar naturally inside this new scene.`
      : "",
    supportingAvatars.length
      ? `Additional Hapa identity references: ${supportingAvatars.map((item) => item.name).join(", ")}. Use only when their presence performs a clear lyric- or relationship-backed action; do not add decorative cast.`
      : "",
    generationSafeReferenceImagery.length
      ? `Reference Atlas visual canon: ${generationSafeReferenceImagery.map((item) => item.title).join("; ")}. Borrow its symbolic vocabulary, spatial logic, palette relationships, or recurring objects as connective tissue, but create a new composition and do not copy the prior image.`
      : "",
    generationBoundary,
    referencePack?.paths?.length
      ? "The supplied images have ordered roles: identity anchors establish character continuity; Reference Atlas images establish symbolic continuity. Synthesize them into one scene, not a collage, lineup, dossier, or split panel."
      : "",
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
    referencePack: referencePack
      ? generationBoundary
        ? {
          ...referencePack,
          referenceImagery: generationSafeReferenceImagery,
          paths: list(referencePack.paths).filter((path) => (
            !referenceImagery.some((item) => item.path === path && containsSensitivePublicFigure(item.title))
          )),
          generationBoundary,
        }
        : referencePack
      : null,
    custody: {
      builtInCodexImageGeneration: true,
      sourceCardUnchanged: true,
      generatedOutputIsIdentityTruth: false,
      previewVisibility: "visible-before-review",
      approvalControlsAuthorityNotVisibility: true,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      reviewStatus: options.assumeApproved === true ? "approved" : "not-reviewed",
      humanReviewRequired: options.assumeApproved !== true,
      approvedBy: options.assumeApproved === true ? text(options.approvedBy, "Human owner") : "",
      authorityReceiptId: text(options.authorityReceiptId),
    },
  };
  return { ...core, promptHash: echoReferenceArtDigest(core) };
}

export function buildEchoReferenceGptImageBenchmarkManifest(run = {}, options = {}) {
  const selected = new Set(unique(options.cardIds));
  const excluded = new Set(unique(options.excludeCardIds));
  const eligibilityOptions = { approvedAtlas: options.approvedAtlas === true };
  const jobs = list(run.cards)
    .filter((card) => echoReferenceArtEligibility(card, eligibilityOptions).eligible)
    .filter((card) => !excluded.has(card.id))
    .filter((card) => !selected.size || selected.has(card.id))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .map((card, index) => {
      const compiled = buildEchoReferenceGptImagePrompt(card, run, options);
      return {
        schemaVersion: ECHO_REFERENCE_GPT_IMAGE_BENCHMARK_JOB_SCHEMA,
        id: `echo-reference-gpt-image:${compiled.promptHash.slice(-24)}`,
        ordinal: index + 1,
        status: "planned",
        ...compiled,
        rawArtifact: null,
        assembledArtifact: null,
        review: options.assumeApproved === true
          ? {
            status: "completed",
            decision: "accepted",
            reviewer: text(options.approvedBy, "Human owner"),
            rationale: "Explicit operator instruction: generate the approved Reference Atlas remainder.",
            decidedAt: text(options.approvedAt),
          }
          : {
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
    eligibility: {
      ...summarizeEchoReferenceArtEligibility(run, eligibilityOptions),
      excludedAlreadyMediaBacked: excluded.size,
      plannedRemainder: jobs.length,
    },
  };
  return { ...core, manifestHash: echoReferenceArtDigest(core) };
}

export function mergeEchoReferenceGptImageBenchmarkManifest(previous = {}, next = {}, options = {}) {
  const priorByHash = new Map(list(previous.jobs).map((job) => [job.promptHash, job]));
  const priorByCardId = new Map(list(previous.jobs).map((job) => [job.source?.cardId, job]));
  const merged = {
    ...next,
    jobs: next.jobs.map((job) => {
      const exactPrior = priorByHash.get(job.promptHash);
      const prior = exactPrior || priorByCardId.get(job.source.cardId);
      if (
        options.preserveExactCardRevision === true
        && prior?.source?.cardRevisionId
        && prior.source.cardRevisionId === job.source.cardRevisionId
      ) {
        return { ...prior, ordinal: job.ordinal };
      }
      if (prior && !exactPrior && prior.promptHash !== job.promptHash) {
        return {
          ...job,
          supersededArtifacts: [
            ...list(prior.supersededArtifacts),
            ...(prior.rawArtifact || prior.assembledArtifact ? [{
              promptHash: prior.promptHash,
              rawArtifact: prior.rawArtifact,
              assembledArtifact: prior.assembledArtifact,
              supersededReason: "Reference-image pack or generation prompt changed.",
            }] : []),
          ],
        };
      }
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
  const { manifestHash: _discardedManifestHash, ...core } = merged;
  return { ...core, manifestHash: echoReferenceArtDigest(core) };
}
