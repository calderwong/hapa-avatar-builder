import { echoReferenceDigest } from "./echo-reference-mining.js";
import { runEchoReferenceSharpening } from "./echo-reference-sharpening.js";
import { buildEchoReferenceGptImageBenchmarkManifest } from "./echo-reference-gpt-image-benchmark.js";

export const ECHO_EXTERNAL_REFERENCE_LOOP_SCHEMA = "hapa.echo-external-reference-loop.v1";
export const ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA = "hapa.echo-external-reference-research-result.v1";
export const ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA = "hapa.echo-external-reference-resolution.v1";
export const ECHO_EXTERNAL_REFERENCE_LOOP_VERSION = "echo-external-reference-loop.local-v1";

const EFFECTS = new Set(["reinforces", "reframes", "complicates", "contradicts", "extends", "open-question"]);
const SOURCE_CLASSES = new Set([
  "primary-source",
  "official-source",
  "official-franchise-page",
  "authoritative-reference",
  "scholarly-source",
  "government-source",
  "museum-or-archive",
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

function slug(value = "") {
  return text(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function nowValue(now) {
  return typeof now === "function" ? now() : new Date().toISOString();
}

function lineForSong(run = {}, songId = "", lineNumber = 0) {
  const song = list(run.packet?.songs).find((candidate) => candidate.id === songId);
  const line = list(song?.lyrics).find((candidate) => Number(candidate.lineNumber) === Number(lineNumber));
  return { song, line };
}

function occurrenceFromMatch(cardId, song, line, matchedText, confidence = 0.9) {
  return {
    id: `${song.id}:${cardId.replace(/^reference:/, "")}:lines-${line.lineNumber}-${line.lineNumber}`,
    songId: song.id,
    songTitle: song.title,
    albumProjection: "Echo Album",
    lyricSpan: {
      lineStart: line.lineNumber,
      lineEnd: line.lineNumber,
      startSeconds: null,
      endSeconds: null,
      lyricText: line.text,
      matchedText,
    },
    relationType: "alludes-to",
    confidence: round(confidence),
    status: "pending-review",
    pointer: `hapa://echos/${encodeURIComponent(song.id)}?line=${line.lineNumber}`,
  };
}

function matchSignals(run = {}, card = {}) {
  const signals = unique([
    ...list(card.signalLexicon?.literal),
    ...list(card.signalLexicon?.orthographic),
    ...list(card.signalLexicon?.phonetic),
    ...list(card.signalLexicon?.multilingual),
  ]).filter((signal) => signal.length >= 3);
  const accepted = [];
  const held = [];
  for (const song of list(run.packet?.songs)) {
    for (const line of list(song.lyrics)) {
      if (line.isSectionHeading) continue;
      const haystack = String(line.text || "").toLowerCase();
      const signal = signals
        .sort((left, right) => right.length - left.length)
        .find((candidate) => haystack.includes(candidate.toLowerCase()));
      if (!signal) continue;
      const row = occurrenceFromMatch(card.id, song, line, signal, signal.includes(" ") ? 0.94 : 0.9);
      if (signal.includes(" ") || signal.length >= 7) accepted.push(row);
      else held.push({
        ...row,
        status: "held-ambiguous-signal",
        confidence: round(Math.min(0.62, row.confidence)),
        caveat: `The short single-token signal “${signal}” may resolve to a personal, Avatar, mythic, or unrelated namespace.`,
      });
    }
  }
  return {
    accepted: [...new Map(accepted.map((row) => [row.id, row])).values()],
    held: [...new Map(held.map((row) => [row.id, row])).values()],
  };
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol)
      && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function validateEchoExternalReferenceResearchResult(result = {}, run = {}, job = {}) {
  const errors = [];
  const warnings = [];
  if (result.schemaVersion !== ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA) errors.push("invalid-schema");
  if (!text(result.jobId) || result.jobId !== job.id) errors.push("job-mismatch");
  if (!text(result.reference?.title)) errors.push("missing-reference-title");
  if (!text(result.reference?.publicContext)) errors.push("missing-public-context");
  if (!text(result.reference?.referenceType)) errors.push("missing-reference-type");
  const sources = list(result.sources);
  if (!sources.length) errors.push("missing-sources");
  for (const source of sources) {
    if (!validateUrl(source.url)) errors.push(`invalid-source-url:${text(source.id, "unknown")}`);
    if (!SOURCE_CLASSES.has(source.sourceClass)) warnings.push(`nonpreferred-source-class:${text(source.sourceClass, "missing")}`);
    if (!text(source.supportsClaim)) errors.push(`missing-source-claim:${text(source.id, "unknown")}`);
  }
  const evidence = list(result.lyricEvidence);
  if (!evidence.length) errors.push("missing-lyric-evidence");
  for (const item of evidence) {
    const { line } = lineForSong(run, item.songId, item.lineNumber);
    if (!line) errors.push(`unknown-lyric-line:${item.songId}:${item.lineNumber}`);
    else if (text(item.lyricText) !== text(line.text)) errors.push(`lyric-text-mismatch:${item.songId}:${item.lineNumber}`);
    if (!text(item.matchedText)) errors.push(`missing-matched-text:${item.songId}:${item.lineNumber}`);
  }
  if (!text(result.reading?.withoutContext)) errors.push("missing-without-context-reading");
  if (!text(result.reading?.withContext)) errors.push("missing-with-context-reading");
  if (!text(result.reading?.narrativeConsequence)) errors.push("missing-narrative-consequence");
  if (!EFFECTS.has(result.themeDelta?.effect)) errors.push("invalid-theme-effect");
  if (!text(result.themeDelta?.takeaway)) errors.push("missing-theme-takeaway");
  if (!list(result.alternativeReadings).length) errors.push("missing-alternative-reading");
  const channels = result.sharedLanguage || {};
  const channelCount = ["symbols", "themes", "characters", "narrativeBeats", "mechanics", "audioMotifs"]
    .filter((key) => list(channels[key]).length).length;
  if (channelCount < 3) errors.push("insufficient-shared-language-channels");
  if (!text(result.caveat)) errors.push("missing-caveat");
  if (result.authority?.authorialIntentEstablished === true) errors.push("authorial-intent-overclaim");
  if (result.authority?.canonStatus && result.authority.canonStatus !== "non-canon") errors.push("canon-overclaim");
  const sourceScore = sources.length && sources.every((source) => validateUrl(source.url)) ? 1 : 0;
  const exactnessScore = evidence.length && !errors.some((error) => error.startsWith("unknown-lyric") || error.startsWith("lyric-text")) ? 1 : 0;
  const pluralityScore = list(result.alternativeReadings).length ? 1 : 0;
  const channelScore = Math.min(1, channelCount / 4);
  const authorityScore = errors.some((error) => error.endsWith("overclaim")) ? 0 : 1;
  const qualityScore = round((sourceScore + exactnessScore + pluralityScore + channelScore + authorityScore) / 5 * 4, 2);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    qualityScore,
    qualityScale: "0-4 diagnostic",
    components: { sourceScore, exactnessScore, pluralityScore, channelScore, authorityScore },
  };
}

function researchResultToCard(result = {}, run = {}) {
  const id = `reference:${slug(result.reference.title)}`;
  const sourceIds = list(result.sources).map((source, index) => text(source.id, `${slug(result.reference.title)}:source-${index + 1}`));
  const occurrences = list(result.lyricEvidence).map((item) => {
    const { song, line } = lineForSong(run, item.songId, item.lineNumber);
    return occurrenceFromMatch(id, song, line, item.matchedText, item.confidence || result.confidence || 0.88);
  });
  const claims = list(result.sources).map((source, index) => ({
    id: `${slug(result.reference.title)}:source-fact-${index + 1}`,
    kind: "source-fact",
    text: source.supportsClaim,
    evidenceClass: "direct",
    confidence: round(source.confidence || result.confidence || 0.9),
    citationIds: [sourceIds[index]],
    occurrenceIds: occurrences.map((occurrence) => occurrence.id),
    caveat: result.caveat,
  }));
  const channels = result.sharedLanguage || {};
  return {
    schemaVersion: "hapa.reference-card.v1",
    id,
    revisionId: `${id}:research-proposal-r1`,
    parentRevisionId: "",
    title: result.reference.title,
    aliases: unique(result.reference.aliases),
    referenceType: result.reference.referenceType,
    summary: result.reference.publicContext,
    publicContext: result.reference.publicContext,
    occurrences,
    citations: list(result.sources).map((source, index) => ({
      id: sourceIds[index],
      label: source.label,
      url: source.url,
      sourceClass: source.sourceClass,
      publisher: text(source.publisher),
      author: text(source.author),
      publishedAt: text(source.publishedAt),
      retrievedAt: text(source.retrievedAt),
      safeExcerpt: "",
      claimIds: [claims[index].id],
      visibility: "public",
      rights: {
        licenseStatus: "reference-only",
        quotationPolicy: "metadata-and-analysis-only",
        notes: "",
      },
      freshness: { status: "checked", checkedAt: text(source.retrievedAt), failure: "" },
    })),
    claims,
    interpretations: [{
      id: `${slug(result.reference.title)}:research-context-reading`,
      title: `Research context: ${result.reference.title}`,
      summary: result.reading.withContext,
      readingLayers: {
        surface: result.reading.withoutContext,
        contextual: result.reading.withContext,
        thematic: result.themeDelta.takeaway,
        emotional: unique(result.sharedLanguage?.emotions).join(", "),
        narrative: result.reading.narrativeConsequence,
        operationalMechanic: unique(channels.mechanics).join(", "),
      },
      confidence: round(result.confidence || 0.88),
      status: "proposed",
      claimIds: claims.map((claim) => claim.id),
      caveats: [result.caveat, ...list(result.alternativeReadings).map((row) => row.summary || row)],
      proposedBy: text(result.researcher?.id, "external-reference-research-loop"),
      approvedBy: "",
    }],
    relationships: [],
    signalLexicon: {
      literal: unique([result.reference.title, ...list(result.reference.aliases), ...list(result.signals?.literal)]),
      phonetic: unique(result.signals?.phonetic),
      orthographic: unique(result.signals?.orthographic),
      multilingual: unique(result.signals?.multilingual),
      mechanical: unique(result.signals?.mechanical),
    },
    themes: unique(channels.themes),
    mechanics: unique(channels.mechanics),
    emotions: unique(channels.emotions),
    mediaEntities: unique([...list(channels.characters), ...list(channels.symbols)]),
    unresolved: list(result.alternativeReadings).map((row, index) => ({
      id: `${slug(result.reference.title)}:alternative-${index + 1}`,
      question: text(row.question || row.summary || row),
      status: "open",
    })),
    authority: {
      evidenceClass: "source-backed-candidate",
      reviewStatus: "pending-review",
      canonStatus: "non-canon",
      approvedBy: "",
      approvedAt: "",
      canonizedBy: "",
      canonizedAt: "",
    },
    rightsAndPrivacy: {
      visibility: "shared",
      containsPersonalData: false,
      containsPrivateClues: false,
      licenseStatus: "reference-only",
      quotationPolicy: "metadata-and-analysis-only",
      publicProjectionAllowed: false,
    },
    custody: {
      originCoreKey: "local:hapa-avatar-builder",
      eventId: `research:${echoReferenceDigest(result)}`,
      contentDigest: echoReferenceDigest(result),
      custodyStatus: "locally-derived",
    },
    provenance: {
      method: "sourced-external-reference-research-loop",
      sourceRunId: run.runId,
      sourcePacketHash: run.packetHash,
      configurationVersion: ECHO_EXTERNAL_REFERENCE_LOOP_VERSION,
      model: text(result.researcher?.model),
      createdBy: text(result.researcher?.id, "hapa-avatar-builder"),
      createdAt: text(result.researchedAt),
      decisionIds: [],
    },
    research: {
      themeEffect: result.themeDelta.effect,
      symbols: unique(channels.symbols),
      characters: unique(channels.characters),
      narrativeBeats: unique(channels.narrativeBeats),
      audioMotifs: unique(channels.audioMotifs),
      sourceResultHash: echoReferenceDigest(result),
    },
  };
}

function mergeCard(existing = {}, proposed = {}) {
  const occurrences = [...new Map([...list(existing.occurrences), ...list(proposed.occurrences)].map((row) => [row.id, row])).values()];
  return {
    ...existing,
    revisionId: `${existing.id}:research-overlay:${echoReferenceDigest(proposed).slice(-12)}`,
    parentRevisionId: existing.revisionId,
    aliases: unique([...list(existing.aliases), ...list(proposed.aliases)]),
    occurrences,
    citations: [...new Map([...list(existing.citations), ...list(proposed.citations)].map((row) => [row.url || row.id, row])).values()],
    claims: [...list(existing.claims), ...list(proposed.claims)],
    interpretations: [...list(existing.interpretations), ...list(proposed.interpretations)],
    signalLexicon: Object.fromEntries(["literal", "phonetic", "orthographic", "multilingual", "mechanical"].map((key) => [
      key,
      unique([...list(existing.signalLexicon?.[key]), ...list(proposed.signalLexicon?.[key])]),
    ])),
    themes: unique([...list(existing.themes), ...list(proposed.themes)]),
    mechanics: unique([...list(existing.mechanics), ...list(proposed.mechanics)]),
    emotions: unique([...list(existing.emotions), ...list(proposed.emotions)]),
    mediaEntities: unique([...list(existing.mediaEntities), ...list(proposed.mediaEntities)]),
    unresolved: [...list(existing.unresolved), ...list(proposed.unresolved)],
    authority: { ...existing.authority, evidenceClass: "source-backed-candidate", reviewStatus: "pending-review", canonStatus: "non-canon" },
    research: proposed.research,
  };
}

export function projectEchoExternalReferenceResults(run = {}, acceptedResults = []) {
  let cards = list(run.cards).map((card) => structuredClone(card));
  const changes = [];
  for (const result of acceptedResults) {
    const proposed = researchResultToCard(result, run);
    const recheck = matchSignals(run, proposed);
    proposed.occurrences = [...new Map([
      ...proposed.occurrences,
      ...recheck.accepted,
    ].map((row) => [row.id, row])).values()];
    proposed.recheck = {
      acceptedOccurrences: recheck.accepted,
      heldOccurrences: recheck.held,
      policy: "Multiword signals or distinctive single tokens of seven or more characters may auto-enter the proposal overlay; shorter single-token matches remain held.",
    };
    const index = cards.findIndex((card) => card.id === proposed.id);
    if (index >= 0) {
      const before = list(cards[index].occurrences).length;
      cards[index] = mergeCard(cards[index], proposed);
      changes.push({
        cardId: proposed.id,
        action: "enrich-existing",
        occurrencesBefore: before,
        occurrencesAfter: cards[index].occurrences.length,
        newSongIds: unique(cards[index].occurrences.map((row) => row.songId)),
        heldRecheckCandidates: recheck.held.length,
      });
    } else {
      cards.push(proposed);
      changes.push({
        cardId: proposed.id,
        action: "propose-new",
        occurrencesBefore: 0,
        occurrencesAfter: proposed.occurrences.length,
        newSongIds: unique(proposed.occurrences.map((row) => row.songId)),
        heldRecheckCandidates: recheck.held.length,
      });
    }
  }
  const projected = {
    ...structuredClone(run),
    cards,
    contributions: [
      ...list(run.contributions),
      ...acceptedResults.map((result) => ({
        id: `external-reference-research:${echoReferenceDigest(result).slice(-24)}`,
        type: "external-reference-research-proposal",
        status: "pending-human-review",
        resultHash: echoReferenceDigest(result),
        jobId: result.jobId,
      })),
    ],
  };
  projected.runHash = echoReferenceDigest({ sourceRunHash: run.runHash, cards, contributions: projected.contributions });
  return { projectedRun: projected, changes };
}

export function rebaseEchoExternalReferenceProjection(sourceRun = {}, priorProjectedRun = {}) {
  const baseCards = list(sourceRun.cards).map((card) => structuredClone(card));
  const baseIds = new Set(baseCards.map((card) => card.id));
  const researchCards = list(priorProjectedRun.cards)
    .filter((card) => card.research?.sourceResultHash)
    .map((card) => structuredClone(card));
  const appended = researchCards.filter((card) => !baseIds.has(card.id));
  const refreshed = baseCards.map((card) => {
    const prior = researchCards.find((candidate) => candidate.id === card.id);
    return prior ? mergeCard(card, prior) : card;
  });
  const researchContributions = list(priorProjectedRun.contributions)
    .filter((contribution) => contribution.type === "external-reference-research-proposal");
  const contributions = [...new Map([
    ...list(sourceRun.contributions),
    ...researchContributions,
  ].map((row) => [row.id, structuredClone(row)])).values()];
  const cards = [...refreshed, ...appended];
  const projectedRun = {
    ...structuredClone(sourceRun),
    cards,
    contributions,
  };
  projectedRun.runHash = echoReferenceDigest({
    sourceRunHash: sourceRun.runHash,
    cards,
    contributions,
  });
  return {
    projectedRun,
    receipt: {
      sourceRunId: sourceRun.runId,
      sourceRunHash: sourceRun.runHash,
      priorProjectedRunId: priorProjectedRun.runId,
      priorProjectedRunHash: priorProjectedRun.runHash,
      researchCardsReplayed: researchCards.length,
      researchCardsAppended: appended.length,
      researchCardsRefreshed: researchCards.length - appended.length,
      researchContributionsPreserved: researchContributions.length,
    },
  };
}

function snapshotMetrics(sharpening = {}, artManifest = {}) {
  const final = sharpening.benchmarkComparison?.at(-1)?.headline || {};
  return {
    externalSongsMeetingThree: Number(final.externalSongsMeetingThree || 0),
    externalReferenceDeficit: Number(final.externalReferenceDeficit || 0),
    themeDeltaRecords: Number(final.themeDeltaRecords || 0),
    externalInternalBridges: Number(final.externalInternalBridges || 0),
    researchQueueItems: Number(final.researchQueueItems || 0),
    diagnosticAverage: Number(sharpening.benchmarkComparison?.at(-1)?.diagnosticAverage || 0),
    gptImageEligibleCards: Number(artManifest.eligibility?.eligibleSourceReferences || 0),
    gptImageJobs: list(artManifest.jobs).length,
  };
}

export function buildEchoExternalReferenceCycle({
  sourceRun = {},
  previousCycle = null,
  acceptedResults = [],
  options = {},
} = {}) {
  const projection = projectEchoExternalReferenceResults(sourceRun, acceptedResults);
  const sharpening = runEchoReferenceSharpening(projection.projectedRun, options);
  const acceptedCardIds = new Set(projection.changes.map((change) => change.cardId));
  const artManifest = buildEchoReferenceGptImageBenchmarkManifest(projection.projectedRun, {
    cardIds: [...acceptedCardIds],
  });
  const beforeMetrics = previousCycle?.metrics || {
    ...snapshotMetrics(
      runEchoReferenceSharpening(sourceRun, options),
      buildEchoReferenceGptImageBenchmarkManifest(sourceRun)
    ),
    gptImageJobs: 0,
  };
  const metrics = snapshotMetrics(sharpening, artManifest);
  const delta = Object.fromEntries(Object.keys(metrics).map((key) => [key, round(metrics[key] - Number(beforeMetrics[key] || 0))]));
  const validations = acceptedResults.map((result) => ({
    jobId: result.jobId,
    resultHash: echoReferenceDigest(result),
    qualityScore: Number(result.validation?.qualityScore || 0),
  }));
  const quality = {
    resultCount: acceptedResults.length,
    averageResearchQuality: round(validations.reduce((sum, row) => sum + row.qualityScore, 0) / Math.max(1, validations.length), 2),
    exactLineFailures: acceptedResults.filter((result) => list(result.validation?.errors).some((error) => error.startsWith("lyric-"))).length,
    authorityViolations: Number(sharpening.benchmarkComparison?.at(-1)?.headline?.authorityViolations || 0),
    newOccurrencesFoundByRecheck: projection.changes.reduce((sum, change) => sum + Math.max(0, change.occurrencesAfter - change.occurrencesBefore - 1), 0),
    heldAmbiguousRechecks: projection.changes.reduce((sum, change) => sum + Number(change.heldRecheckCandidates || 0), 0),
    stopRecommended: acceptedResults.length > 0 && (
      validations.some((row) => row.qualityScore < 3)
      || Number(sharpening.benchmarkComparison?.at(-1)?.headline?.authorityViolations || 0) > 0
    ),
  };
  const core = {
    schemaVersion: "hapa.echo-external-reference-cycle.v1",
    version: ECHO_EXTERNAL_REFERENCE_LOOP_VERSION,
    sourceRunId: sourceRun.runId,
    sourceRunHash: sourceRun.runHash,
    priorCycleId: previousCycle?.cycleId || "",
    acceptedResultHashes: validations.map((row) => row.resultHash),
    researchResults: acceptedResults,
    changes: projection.changes,
    metrics,
    delta,
    quality,
    sharpening,
    artManifest,
    projectedRun: projection.projectedRun,
    reflection: {
      usefulEvidence: projection.changes.map((change) => `${change.cardId} rechecked across ${change.newSongIds.length} song(s).`),
      noiseOrHolds: sharpening.database.researchQueue.filter((item) => item.candidateClues.length === 0).slice(0, 8).map((item) => item.id),
      downstreamBenefit: [
        `${quality.newOccurrencesFoundByRecheck} additional occurrence(s) discovered by album-wide recheck.`,
        `${artManifest.jobs.length} GPT Image Card job(s) became plan-ready behind the evidence gate.`,
      ],
      continuingBenefit: "The projected cards become input to the next cycle without changing Human-approved canon.",
    },
  };
  return {
    ...core,
    cycleId: `echo-external-reference-cycle:${echoReferenceDigest(core).slice(-24)}`,
    cycleHash: echoReferenceDigest(core),
  };
}

const PRESERVED_RESEARCH_JOB_STATUSES = new Set([
  "validated",
  "integrated",
  "resolved-no-reference",
  "resolved-ambiguous",
]);

function sameResearchTarget(left = {}, right = {}) {
  const leftClue = list(left.candidateClues)[0] || {};
  const rightClue = list(right.candidateClues)[0] || {};
  return left.id === right.id
    && left.songId === right.songId
    && Number(leftClue.lineNumber || 0) === Number(rightClue.lineNumber || 0)
    && text(leftClue.lyricText) === text(rightClue.lyricText)
    && text(leftClue.phrase) === text(rightClue.phrase);
}

export function seedEchoExternalReferenceLoop(
  sourceRun = {},
  sharpening = {},
  now = () => new Date().toISOString(),
  previousLoop = {},
) {
  const previousJobs = new Map(list(previousLoop.jobs).map((job) => [job.id, job]));
  const jobs = list(sharpening.database?.researchQueue)
    .filter((item) => item.status === "research-ready")
    .flatMap((item) => {
      const clues = list(item.candidateClues).slice(0, Math.max(1, Number(item.externalReferenceDeficit || 1)));
      const seeds = clues.length ? clues : [{ key: "whole-song-review", phrase: "Whole-song review", score: item.priority }];
      return seeds.map((clue) => {
        const queued = {
          schemaVersion: "hapa.echo-external-reference-research-job.v1",
          id: `${item.id}:${slug(clue.key || clue.phrase)}`,
          status: "queued",
          priority: round(Math.min(1, Number(item.priority || 0) * 0.7 + Number(clue.score || 0.5) * 0.3)),
          songId: item.songId,
          songTitle: item.songTitle,
          externalReferenceDeficit: item.externalReferenceDeficit,
          candidateClues: [clue],
          internalContext: item.internalContext,
          researchQuestions: item.researchQuestions.filter((question) => (
            clue.phrase === "Whole-song review" || question.includes(`“${clue.phrase}”`)
          )).slice(0, 1),
          requiredOutput: item.requiredOutput,
          claim: null,
          result: null,
          validation: null,
          history: [{ event: "seeded", at: nowValue(now) }],
        };
      const previous = previousJobs.get(queued.id);
      return previous
        && PRESERVED_RESEARCH_JOB_STATUSES.has(previous.status)
        && sameResearchTarget(previous, queued)
        ? {
          ...queued,
          status: previous.status,
          result: previous.result || null,
          validation: previous.validation || null,
          resolution: previous.resolution || null,
          history: [...list(previous.history), {
            event: "reseed-preserved",
            at: nowValue(now),
            sourceRunId: sourceRun.runId,
          }],
        }
        : queued;
      });
    })
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const core = {
    schemaVersion: ECHO_EXTERNAL_REFERENCE_LOOP_SCHEMA,
    version: ECHO_EXTERNAL_REFERENCE_LOOP_VERSION,
    sourceRunId: sourceRun.runId,
    sourceRunHash: sourceRun.runHash,
    sharpeningRunId: sharpening.sharpeningRunId,
    createdAt: nowValue(now),
    jobs,
    cycles: list(previousLoop.cycles),
  };
  return { ...core, loopId: `echo-external-reference-loop:${echoReferenceDigest(core).slice(-24)}` };
}

export function claimEchoExternalReferenceJobs(loop = {}, input = {}, now = () => new Date().toISOString()) {
  const limit = Math.max(1, Number(input.limit || 1));
  const runner = text(input.runner);
  const selected = new Set(unique(input.jobIds));
  if (!runner) throw new Error("Research claim requires a runner.");
  let remaining = limit;
  const claimed = [];
  const jobs = list(loop.jobs).map((job) => {
    if (remaining <= 0 || job.status !== "queued" || (selected.size && !selected.has(job.id))) return job;
    remaining -= 1;
    const next = {
      ...job,
      status: "claimed",
      claim: { runner, claimedAt: nowValue(now), leaseSeconds: Math.max(300, Number(input.leaseSeconds || 3600)) },
      history: [...list(job.history), { event: "claimed", at: nowValue(now), runner }],
    };
    claimed.push(next);
    return next;
  });
  return { loop: { ...loop, jobs }, claimed };
}

export function submitEchoExternalReferenceResult(loop = {}, sourceRun = {}, input = {}, now = () => new Date().toISOString()) {
  const jobId = text(input.result?.jobId);
  const job = list(loop.jobs).find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown research job ${jobId || "missing"}.`);
  if (!["claimed", "submitted", "held"].includes(job.status)) throw new Error(`Research job ${jobId} is not claimable for submission.`);
  const result = { ...input.result, researchedAt: text(input.result.researchedAt, nowValue(now)) };
  const validation = validateEchoExternalReferenceResearchResult(result, sourceRun, job);
  result.validation = validation;
  const jobs = list(loop.jobs).map((candidate) => candidate.id === jobId ? {
    ...candidate,
    status: validation.valid ? "validated" : "held",
    result,
    validation,
    history: [...list(candidate.history), {
      event: validation.valid ? "validated" : "held",
      at: nowValue(now),
      errors: validation.errors,
      qualityScore: validation.qualityScore,
    }],
  } : candidate);
  return { loop: { ...loop, jobs }, validation, result };
}

export function resolveEchoExternalReferenceJob(loop = {}, input = {}, now = () => new Date().toISOString()) {
  const resolution = structuredClone(input.resolution || {});
  const jobId = text(resolution.jobId);
  const job = list(loop.jobs).find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown research job ${jobId || "missing"}.`);
  if (!["claimed", "submitted", "held"].includes(job.status)) {
    throw new Error(`Research job ${jobId} is not claimable for resolution.`);
  }
  const errors = [];
  if (resolution.schemaVersion !== ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA) errors.push("invalid-schema");
  if (!["no-supported-reference", "ambiguous"].includes(resolution.disposition)) errors.push("invalid-disposition");
  if (!text(resolution.rationale)) errors.push("missing-rationale");
  if (!list(resolution.searchQueries).length) errors.push("missing-search-queries");
  if (!text(resolution.caveat)) errors.push("missing-caveat");
  if (errors.length) return {
    loop,
    valid: false,
    errors,
    resolution,
  };
  const completed = {
    ...resolution,
    resolvedAt: text(resolution.resolvedAt, nowValue(now)),
    resolutionHash: echoReferenceDigest(resolution),
  };
  const status = resolution.disposition === "no-supported-reference"
    ? "resolved-no-reference"
    : "resolved-ambiguous";
  const jobs = list(loop.jobs).map((candidate) => candidate.id === jobId ? {
    ...candidate,
    status,
    resolution: completed,
    history: [...list(candidate.history), {
      event: status,
      at: nowValue(now),
      resolutionHash: completed.resolutionHash,
    }],
  } : candidate);
  return {
    loop: { ...loop, jobs },
    valid: true,
    errors: [],
    resolution: completed,
  };
}
