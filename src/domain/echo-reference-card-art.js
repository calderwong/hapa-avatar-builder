import { createHash } from "node:crypto";

export const ECHO_REFERENCE_ART_JOB_SCHEMA = "hapa.echo-reference-art-job.v1";
export const ECHO_REFERENCE_ART_QUEUE_SCHEMA = "hapa.echo-reference-art-queue.v1";
export const ECHO_REFERENCE_ART_PROMPT_SCHEMA = "hapa.echo-reference-art-prompt.v1";
export const ECHO_REFERENCE_ART_PROVIDER = "black-forest-labs-flux2";
export const ECHO_REFERENCE_ART_DEFAULT_MODEL = "flux-2-max";
export const ECHO_REFERENCE_ART_MODELS = Object.freeze([
  "flux-2-max",
  "flux-2-pro",
  "flux-2-flex",
  "flux-2-pro-preview",
]);

const PALETTES = Object.freeze([
  { id: "harbor-memory", colors: ["#071B33", "#0D5C63", "#8FD5D2", "#F6C85F"] },
  { id: "ember-archive", colors: ["#160B19", "#6A1B4D", "#E05A47", "#F2C879"] },
  { id: "yew-rebirth", colors: ["#071A16", "#1F5D42", "#8DBF7A", "#E7D9B6"] },
  { id: "liberty-copper", colors: ["#071820", "#28766F", "#8BC6B1", "#F0B44D"] },
  { id: "winter-watch", colors: ["#07111F", "#27435F", "#AFC4D7", "#E8EEF2"] },
  { id: "violet-signal", colors: ["#100A24", "#4E2A84", "#B76BD7", "#79D7FF"] },
]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((value) => value !== null && value !== undefined) : [];
}

function unique(values = []) {
  const seen = new Set();
  return list(values).flatMap((value) => {
    const normalized = text(String(value || ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function echoReferenceArtDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
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
  const key = [
    card.id,
    ...unique(card.themes),
    ...unique(card.mechanics),
  ].join("|");
  return PALETTES[deterministicSeed(key) % PALETTES.length];
}

function constellationNeighbors(run = {}, cardId = "", limit = 4) {
  const cardById = new Map(list(run.cards).map((card) => [card.id, card]));
  return list(run.graph?.edges)
    .filter((edge) => edge.relationType === "co-activated-with" && [edge.fromId, edge.toId].includes(cardId))
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0) || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((edge) => {
      const neighborId = edge.fromId === cardId ? edge.toId : edge.fromId;
      const neighbor = cardById.get(neighborId);
      return {
        cardId: neighborId,
        title: neighbor?.title || neighborId,
        sharedSongIds: unique(edge.support?.sharedSongIds),
        sharedThemes: unique(edge.support?.sharedThemes),
        sharedMechanics: unique(edge.support?.sharedMechanics),
        weight: Number(edge.weight || 0),
      };
    });
}

export function isEchoReferenceArtEligible(card = {}) {
  if (!String(card.id || "").startsWith("reference:")) return false;
  if (!["direct", "source-backed-candidate"].includes(card.authority?.evidenceClass)) return false;
  if (!text(card.publicContext || card.summary)) return false;
  if (!list(card.occurrences).length) return false;
  if (card.rightsAndPrivacy?.containsPrivateClues === true) return false;
  if (card.rightsAndPrivacy?.visibility === "private") return false;
  return true;
}

export function buildEchoReferenceArtPrompt(card = {}, run = {}, options = {}) {
  if (!isEchoReferenceArtEligible(card)) {
    throw new Error(`Reference Card ${card.id || "unknown"} is not eligible for FLUX.2 art planning.`);
  }
  const occurrence = strongestOccurrence(card);
  const palette = paletteForCard(card);
  const neighbors = constellationNeighbors(run, card.id);
  const lyricFragment = text(occurrence?.lyricSpan?.lyricText).slice(0, 240);
  const promptObject = {
    schema: ECHO_REFERENCE_ART_PROMPT_SCHEMA,
    objective: "Create one original, high-quality vertical Hapa Reference Card illustration.",
    subject: {
      referenceTitle: card.title,
      publicContext: text(card.publicContext || card.summary),
      lyricMoment: lyricFragment,
      songTitle: text(occurrence?.songTitle),
      themes: unique(card.themes).slice(0, 8),
      mechanics: unique(card.mechanics).slice(0, 6),
    },
    expansionContext: {
      instruction: "Treat connected sources as a semantic constellation. Show the relationship through composition, objects, routes, light, or action rather than a collage of logos or recognizable franchise characters.",
      neighbors,
    },
    artDirection: {
      format: "vertical 3:4 collectible reference card art, full-bleed illustration with a quiet lower title-plate zone",
      style: "original Hapa NeoBlade painterly cinematic concept art; sophisticated semi-realism; layered environmental storytelling; elegant luminous linework; tactile materials; subtle film grain; museum-quality color and light",
      composition: "one dominant symbolic action, one clear focal hierarchy, foreground/midground/background depth, readable at tarot-card scale",
      palette,
      symbolicRule: "Translate named works and public references into original symbolic objects, mechanics, geography, light, and emotional staging.",
      typographyRule: "Do not render titles, labels, logos, watermarks, UI chrome, or small decorative writing. Preserve clean negative space for post-production typography.",
      rightsRule: "Do not reproduce celebrity likenesses, protected character designs, franchise logos, exact costumes, album covers, game interfaces, or source artwork. Create a transformative original scene.",
      truthRule: "This is interpretive card art, not historical evidence, identity truth, canon, or proof of authorial intent.",
    },
    quality: {
      detail: "precise hands and faces when people are present, physically coherent objects, controlled texture, no accidental duplicates",
      finish: "premium key art suitable for a high-resolution art card",
      review: "human review required before attachment or publication",
    },
  };
  const prompt = JSON.stringify(promptObject);
  return {
    schemaVersion: ECHO_REFERENCE_ART_PROMPT_SCHEMA,
    cardId: card.id,
    cardRevisionId: card.revisionId,
    sourceRunId: text(run.runId),
    sourceRunHash: text(run.runHash),
    sourceGraphHash: text(run.graph?.graphHash),
    occurrenceId: occurrence?.id || "",
    promptObject,
    prompt,
    promptHash: echoReferenceArtDigest(promptObject),
    palette,
    neighbors,
  };
}

export function buildEchoReferenceArtQueue(run = {}, options = {}) {
  const model = ECHO_REFERENCE_ART_MODELS.includes(options.model)
    ? options.model
    : ECHO_REFERENCE_ART_DEFAULT_MODEL;
  const width = Math.max(256, Math.min(2048, Math.round(Number(options.width || 1536))));
  const height = Math.max(256, Math.min(2048, Math.round(Number(options.height || 2048))));
  const selectedCardIds = new Set(unique(options.cardIds));
  const jobs = list(run.cards)
    .filter(isEchoReferenceArtEligible)
    .filter((card) => !selectedCardIds.size || selectedCardIds.has(card.id))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .map((card) => {
      const prompt = buildEchoReferenceArtPrompt(card, run, options);
      const jobIdentity = {
        cardId: card.id,
        cardRevisionId: card.revisionId,
        sourceRunHash: text(run.runHash),
        sourceGraphHash: text(run.graph?.graphHash),
        promptHash: prompt.promptHash,
        provider: ECHO_REFERENCE_ART_PROVIDER,
        model,
        width,
        height,
      };
      const jobHash = echoReferenceArtDigest(jobIdentity);
      return {
        schemaVersion: ECHO_REFERENCE_ART_JOB_SCHEMA,
        id: `echo-reference-art:${jobHash.slice(-24)}`,
        jobHash,
        status: "planned",
        attempt: 0,
        source: {
          cardId: card.id,
          cardRevisionId: card.revisionId,
          sourceRunId: text(run.runId),
          sourceRunHash: text(run.runHash),
          sourceGraphHash: text(run.graph?.graphHash),
          occurrenceId: prompt.occurrenceId,
        },
        prompt,
        generation: {
          provider: ECHO_REFERENCE_ART_PROVIDER,
          model,
          width,
          height,
          seed: deterministicSeed(jobHash),
          inputImages: [],
          outputFormat: "png",
        },
        custody: {
          sourceCardUnchanged: true,
          generatedOutputIsIdentityTruth: false,
          publicActivation: false,
          canonPromotion: false,
          mint: false,
          humanReviewRequired: true,
        },
        providerReceipt: null,
        artifact: null,
        review: {
          status: "not-reviewed",
          decision: "",
          reviewer: "",
          rationale: "",
          decidedAt: "",
        },
      };
    });
  const queueCore = {
    schemaVersion: ECHO_REFERENCE_ART_QUEUE_SCHEMA,
    sourceRunId: text(run.runId),
    sourceRunHash: text(run.runHash),
    sourceGraphHash: text(run.graph?.graphHash),
    provider: ECHO_REFERENCE_ART_PROVIDER,
    model,
    width,
    height,
    jobs,
  };
  return {
    ...queueCore,
    queueHash: echoReferenceArtDigest(queueCore),
    counts: {
      cardsConsidered: list(run.cards).length,
      eligibleCards: list(run.cards).filter(isEchoReferenceArtEligible).length,
      plannedJobs: jobs.length,
      privateOrUnresolvedExcluded: list(run.cards).filter((card) => (
        card.id?.startsWith("reference:") && !isEchoReferenceArtEligible(card)
      )).length,
    },
  };
}

export function mergeEchoReferenceArtQueue(previous = {}, next = {}) {
  const previousByHash = new Map(list(previous.jobs).map((job) => [job.jobHash, job]));
  return {
    ...next,
    jobs: list(next.jobs).map((job) => previousByHash.has(job.jobHash)
      ? { ...job, ...previousByHash.get(job.jobHash), prompt: job.prompt, generation: job.generation, source: job.source, custody: job.custody }
      : job),
  };
}

export function reviewEchoReferenceArtJob(queue = {}, input = {}, now = () => new Date().toISOString()) {
  const jobId = text(input.jobId);
  const decision = ["accepted", "rejected"].includes(input.decision) ? input.decision : "";
  if (!jobId || !decision || !text(input.reviewer)) throw new Error("Review requires jobId, accepted/rejected decision, and reviewer.");
  let found = false;
  const jobs = list(queue.jobs).map((job) => {
    if (job.id !== jobId) return job;
    found = true;
    if (job.status !== "review-required" || !job.artifact?.sha256) {
      throw new Error(`Reference art job ${jobId} has no completed artifact to review.`);
    }
    return {
      ...job,
      status: decision,
      review: {
        status: "completed",
        decision,
        reviewer: text(input.reviewer),
        rationale: text(input.rationale),
        decidedAt: now(),
      },
    };
  });
  if (!found) throw new Error(`Unknown Reference art job ${jobId}.`);
  return { ...queue, jobs };
}
