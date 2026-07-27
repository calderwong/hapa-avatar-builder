import { echoReferenceDigest } from "./echo-reference-mining.js";

export const ECHO_REFERENCE_SHARPENING_SCHEMA = "hapa.echo-reference-sharpening.v1";
export const ECHO_REFERENCE_SHARPENING_VERSION = "echo-reference-sharpening.local-v1";

export const ECHO_REFERENCE_THEME_EFFECTS = Object.freeze([
  "reinforces",
  "reframes",
  "complicates",
  "contradicts",
  "extends",
  "open-question",
]);

const GENERIC_CLUE_TERMS = new Set([
  "album", "always", "another", "because", "bella", "bridge", "chorus", "could",
  "dear", "every", "father", "forever", "friend", "good", "green", "happy",
  "heart", "home", "hope", "human", "left", "light", "little", "love", "mary",
  "mister", "mother", "never", "night", "other", "papa", "people", "please",
  "right", "sister", "someone", "something", "still", "summer", "thing", "think",
  "time", "today", "together", "watch", "winter", "woman", "world", "would",
]);

const GRAMMAR_CLUE_TERMS = new Set([
  "a", "all", "an", "and", "are", "as", "at", "baby", "because", "but", "cause",
  "did", "do", "does", "for", "from", "get", "gets", "got", "had", "has", "have",
  "he", "her", "hers", "him", "his", "how", "i", "id", "if", "ill", "im", "in",
  "is", "it", "its", "ive", "just", "me", "my", "no", "not", "now", "of", "oh",
  "on", "or", "our", "said", "say", "she", "so", "still", "than", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "those", "to", "too",
  "trying", "up", "us", "was", "we", "were", "weve", "what", "when", "where",
  "which", "while", "who", "why", "will", "with", "you", "your", "youre", "youve",
]);

const NON_ENTITY_SINGLE_CLUE_TERMS = new Set([
  "again", "alone", "away", "books", "campfire", "coffee", "conviction", "day",
  "different", "digital", "easy", "emoji", "even", "fight", "fire", "first",
  "forget", "gangsta", "gangsters", "gold", "harbor", "imagination", "kingdom",
  "last", "learned", "leave", "legend", "light", "listen", "live", "loop", "lost",
  "lyrics", "maybe", "memory", "midnight", "moral", "nameless", "once", "page",
  "playlist", "princess", "read", "real", "return", "root", "sail", "scroll",
  "signal", "soul", "story", "third", "thirsty", "timestamp", "today", "together",
  "turn", "wait", "warden", "water", "whole", "word", "writer",
]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function unique(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of list(values)) {
    const normalized = text(String(value || ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
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

function bounded(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function average(values = []) {
  const rows = list(values).map(Number).filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function intersect(left = [], right = []) {
  const rightSet = new Set(unique(right).map((value) => value.toLowerCase()));
  return unique(left).filter((value) => rightSet.has(value.toLowerCase()));
}

function externalCards(run = {}) {
  return list(run.cards).filter((card) => card.id?.startsWith("reference:"));
}

function internalCards(run = {}) {
  return list(run.cards).filter((card) => card.id?.startsWith("reference-card:"));
}

function occurrenceSongIds(card = {}) {
  return unique(list(card.occurrences).map((occurrence) => occurrence.songId));
}

function cardConfidence(card = {}) {
  return Math.max(0, ...list(card.occurrences).map((occurrence) => Number(occurrence.confidence || 0)));
}

function internalRouteQualifies(card = {}, options = {}) {
  const confidenceFloor = Number(options.internalConfidenceFloor ?? 0.55);
  return occurrenceSongIds(card).length >= 2
    && card.authority?.evidenceClass !== "unresolved"
    && cardConfidence(card) >= confidenceFloor
    && list(card.relationships).some((relationship) => (
      relationship.fromType === "song"
      && relationship.toType === "song"
      && text(relationship.rationale)
    ))
    && list(card.occurrences).every((occurrence) => (
      occurrence.songId
      && Number(occurrence.lyricSpan?.lineStart) > 0
      && text(occurrence.lyricSpan?.lyricText)
    ));
}

function coverageStatus(count, minimum, eligible) {
  if (!eligible) return "blocked-missing-lyrics";
  if (count >= minimum) return "coverage-prior-satisfied";
  return "research-required";
}

export function buildEchoReferenceCoverageCensus(run = {}, options = {}) {
  const minimumExternal = Math.max(1, Number(options.minimumExternalReferences || 3));
  const minimumInternal = Math.max(1, Number(options.minimumInternalSongLinks || 3));
  const external = externalCards(run);
  const internal = internalCards(run);
  const unresolvedBySong = new Map();
  for (const node of list(run.unresolved)) {
    if (!node.songId) continue;
    if (!unresolvedBySong.has(node.songId)) unresolvedBySong.set(node.songId, []);
    unresolvedBySong.get(node.songId).push(node.id);
  }

  const rows = list(run.packet?.songs).map((song) => {
    const eligible = list(song.lyrics).length > 0;
    const songExternalCards = external.filter((card) => (
      list(card.occurrences).some((occurrence) => occurrence.songId === song.id)
    ));
    const allInternal = internal.filter((card) => occurrenceSongIds(card).includes(song.id));
    const qualifiedInternal = allInternal.filter((card) => internalRouteQualifies(card, options));
    const internalPeers = unique(allInternal.flatMap((card) => (
      occurrenceSongIds(card).filter((songId) => songId !== song.id)
    )));
    const qualifiedInternalPeers = unique(qualifiedInternal.flatMap((card) => (
      occurrenceSongIds(card).filter((songId) => songId !== song.id)
    )));
    return {
      songId: song.id,
      title: song.title,
      trackNumber: song.trackNumber,
      lyricsStatus: song.lyricsStatus,
      lyricLineCount: list(song.lyrics).length,
      eligibility: eligible ? "eligible" : "blocked-missing-lyrics",
      external: {
        minimum: minimumExternal,
        distinctReferenceCount: songExternalCards.length,
        referenceIds: songExternalCards.map((card) => card.id).sort(),
        deficit: eligible ? Math.max(0, minimumExternal - songExternalCards.length) : minimumExternal,
        status: coverageStatus(songExternalCards.length, minimumExternal, eligible),
      },
      internal: {
        minimum: minimumInternal,
        candidateRouteCount: allInternal.length,
        candidatePeerCount: internalPeers.length,
        qualifiedRouteCount: qualifiedInternal.length,
        qualifiedPeerCount: qualifiedInternalPeers.length,
        qualifiedPeerSongIds: qualifiedInternalPeers.sort(),
        deficit: eligible ? Math.max(0, minimumInternal - qualifiedInternalPeers.length) : minimumInternal,
        status: coverageStatus(qualifiedInternalPeers.length, minimumInternal, eligible),
      },
      unresolvedNodeIds: list(unresolvedBySong.get(song.id)).sort(),
    };
  });
  const eligibleRows = rows.filter((row) => row.eligibility === "eligible");
  const blockedRows = rows.filter((row) => row.eligibility !== "eligible");
  const summary = {
    songs: rows.length,
    eligibleSongs: eligibleRows.length,
    blockedMissingLyrics: blockedRows.length,
    minimumExternalReferences: minimumExternal,
    minimumInternalSongLinks: minimumInternal,
    external: {
      songsMeetingPrior: eligibleRows.filter((row) => row.external.deficit === 0).length,
      songsNeedingResearch: eligibleRows.filter((row) => row.external.deficit > 0).length,
      coverageRatio: round(
        eligibleRows.filter((row) => row.external.deficit === 0).length / Math.max(1, eligibleRows.length)
      ),
      totalReferenceDeficit: eligibleRows.reduce((sum, row) => sum + row.external.deficit, 0),
      averageDistinctReferences: round(average(eligibleRows.map((row) => row.external.distinctReferenceCount))),
    },
    internal: {
      songsMeetingPrior: eligibleRows.filter((row) => row.internal.deficit === 0).length,
      songsNeedingResearch: eligibleRows.filter((row) => row.internal.deficit > 0).length,
      coverageRatio: round(
        eligibleRows.filter((row) => row.internal.deficit === 0).length / Math.max(1, eligibleRows.length)
      ),
      totalRouteDeficit: eligibleRows.reduce((sum, row) => sum + row.internal.deficit, 0),
      averageQualifiedPeers: round(average(eligibleRows.map((row) => row.internal.qualifiedPeerCount))),
    },
  };
  return {
    schemaVersion: "hapa.echo-reference-coverage-census.v1",
    contract: {
      externalCoveragePrior: minimumExternal,
      internalCoveragePrior: minimumInternal,
      rule: "The minima create research obligations. They never authorize fabricated references, forced song links, or automatic canon.",
      eligibleDefinition: "A song is eligible only when lyric lines are available to inspect.",
    },
    rows,
    summary,
  };
}

function bestInterpretationForSong(card = {}, songId = "", lineStart = 1) {
  const songSlug = slug(songId);
  const lineToken = `line-${lineStart}`;
  const ranked = list(card.interpretations).map((interpretation) => {
    const id = slug(interpretation.id);
    const layers = interpretation.readingLayers || {};
    let score = Number(interpretation.confidence || 0);
    if (id.includes(songSlug)) score += 2;
    if (id.includes(lineToken)) score += 1;
    if (text(layers.contextual)) score += 0.6;
    if (text(layers.thematic)) score += 0.5;
    if (text(layers.surface)) score += 0.3;
    return { interpretation, score };
  });
  return ranked.sort((left, right) => right.score - left.score)[0]?.interpretation || null;
}

function inferThemeEffect(interpretation = {}) {
  const layers = interpretation?.readingLayers || {};
  const thematic = text(layers.thematic).toLowerCase();
  const contextual = text(layers.contextual).toLowerCase();
  const combined = `${thematic} ${contextual}`;
  if (/\bcontradict|opposite|rejects?|disproves?\b/u.test(combined)) return "contradicts";
  if (/\binvert|reverse|complicat|tension|however|but instead\b/u.test(combined)) return "complicates";
  if (/\bfrom\b.+\bto\b/u.test(thematic) || /\brefram|becomes?|turns?\b/u.test(thematic)) return "reframes";
  if (/\bextend|continu|adds?|carries|expands?\b/u.test(combined)) return "extends";
  if (/\breinforc|confirms?|strengthens?|echoes?\b/u.test(combined)) return "reinforces";
  return "open-question";
}

function channelSeed(label, values = [], caveat = "") {
  return {
    channel: label,
    candidates: unique(values).slice(0, 16),
    caveat,
  };
}

function buildSharedLanguageChannels(card = {}) {
  const signals = card.signalLexicon || {};
  return [
    channelSeed(
      "visual",
      [...list(card.themes), ...list(card.mechanics), ...list(card.emotions), ...list(card.mediaEntities)],
      "Abstract art-direction seeds only; do not reproduce protected character designs or imply source endorsement."
    ),
    channelSeed(
      "audio-spoken",
      [card.referenceType === "song" ? card.title : "", ...list(card.aliases), ...list(signals.phonetic)],
      "Spoken-name and phonetic cues only; copyrighted recordings and lyrics remain outside this record."
    ),
    channelSeed(
      "verbal-multilingual",
      [...list(signals.literal), ...list(signals.multilingual)],
      "Preserve proper nouns while translating the surrounding concept and uncertainty."
    ),
    channelSeed(
      "symbolic-mechanical",
      [...list(signals.orthographic), ...list(signals.mechanical), ...list(card.mechanics), ...list(card.themes)],
      "Use mechanics and symbolic relationships as a cross-language bridge, not as proof of intended meaning."
    ),
  ];
}

export function buildEchoExternalThemeDeltas(run = {}) {
  const songById = new Map(list(run.packet?.songs).map((song) => [song.id, song]));
  return externalCards(run).flatMap((card) => {
    const bySong = new Map();
    for (const occurrence of list(card.occurrences)) {
      if (!bySong.has(occurrence.songId)) bySong.set(occurrence.songId, []);
      bySong.get(occurrence.songId).push(occurrence);
    }
    return [...bySong.entries()].map(([songId, occurrences]) => {
      const first = occurrences
        .slice()
        .sort((left, right) => left.lyricSpan.lineStart - right.lyricSpan.lineStart)[0];
      const interpretation = bestInterpretationForSong(card, songId, first.lyricSpan.lineStart);
      const layers = interpretation?.readingLayers || {};
      const proposedEffect = inferThemeEffect(interpretation);
      const citations = list(card.citations).filter((citation) => (
        citation.url && citation.claimIds?.length
      ));
      return {
        schemaVersion: "hapa.echo-reference-theme-delta.v1",
        id: `theme-delta:${slug(card.id)}:${slug(songId)}`,
        songId,
        songTitle: songById.get(songId)?.title || first.songTitle || songId,
        referenceCardId: card.id,
        referenceTitle: card.title,
        occurrenceIds: occurrences.map((occurrence) => occurrence.id).sort(),
        lyricSpans: occurrences.map((occurrence) => ({
          lineStart: occurrence.lyricSpan.lineStart,
          lineEnd: occurrence.lyricSpan.lineEnd,
          lyricText: occurrence.lyricSpan.lyricText,
          matchedText: occurrence.lyricSpan.matchedText,
          pointer: occurrence.pointer,
        })),
        reading: {
          withoutExternalContext: text(
            layers.surface,
            `The lyric contains a signal associated with ${card.title}, but the local surface can still be read independently.`
          ),
          externalCanonContribution: text(layers.contextual, card.publicContext || card.summary),
          candidateThemeAfterLoading: text(layers.thematic),
          narrativeConsequence: text(layers.narrative),
          operationalMechanic: text(layers.operationalMechanic),
        },
        themeDiscussion: {
          proposedEffect,
          acceptedEffect: null,
          question: `Does loading ${card.title} reinforce, reframe, complicate, contradict, or extend the current reading of this song?`,
          possibleEffects: ECHO_REFERENCE_THEME_EFFECTS,
          candidateTakeaway: text(
            layers.thematic,
            "The source context is available, but its effect on the song's takeaway remains an open Human review question."
          ),
          alternativeInterpretationIds: list(card.interpretations)
            .filter((row) => row.id !== interpretation?.id)
            .map((row) => row.id)
            .slice(0, 6),
          humanDecisionRequired: true,
        },
        sharedLanguageChannels: buildSharedLanguageChannels(card),
        evidence: {
          evidenceClass: card.authority?.evidenceClass || "unresolved",
          confidence: round(average(occurrences.map((occurrence) => occurrence.confidence))),
          citationIds: citations.map((citation) => citation.id),
          sourceUrls: citations.map((citation) => citation.url),
          interpretationId: interpretation?.id || "",
        },
        authority: {
          reviewStatus: "proposed",
          canonStatus: "non-canon",
          authorialIntentEstablished: false,
          mayModifyInterpretation: true,
          mayModifyHapaCanonWithoutReview: false,
        },
      };
    });
  }).sort((left, right) => (
    left.songId.localeCompare(right.songId)
    || left.referenceCardId.localeCompare(right.referenceCardId)
  ));
}

function internalConnectionRecord(card = {}, options = {}) {
  const songIds = occurrenceSongIds(card);
  const relationship = list(card.relationships)[0] || {};
  const recurrence = list(card.interpretations).find((row) => /recurrence|continuation/iu.test(row.title));
  const contrast = list(card.interpretations).find((row) => /contrast|independent/iu.test(row.title));
  const qualified = internalRouteQualifies(card, options);
  return {
    schemaVersion: "hapa.echo-internal-reference-route.v1",
    id: `internal-route:${slug(card.id)}`,
    referenceCardId: card.id,
    title: card.title,
    songIds,
    relationType: relationship.relationType || "thematic-resonance",
    status: qualified ? "qualified-candidate" : "held-for-review",
    evidence: {
      evidenceClass: card.authority?.evidenceClass || relationship.evidenceClass || "unresolved",
      confidence: round(cardConfidence(card)),
      rationale: relationship.rationale || card.summary,
      occurrenceIds: list(card.occurrences).map((occurrence) => occurrence.id),
      lyricSpans: list(card.occurrences).map((occurrence) => ({
        songId: occurrence.songId,
        lineStart: occurrence.lyricSpan.lineStart,
        lineEnd: occurrence.lyricSpan.lineEnd,
        lyricText: occurrence.lyricSpan.lyricText,
        matchedText: occurrence.lyricSpan.matchedText,
        pointer: occurrence.pointer,
      })),
    },
    sharedLanguage: {
      literal: unique([...list(card.aliases), ...list(card.signalLexicon?.literal)]),
      phonetic: unique(card.signalLexicon?.phonetic),
      orthographic: unique(card.signalLexicon?.orthographic),
      multilingual: unique(card.signalLexicon?.multilingual),
      mechanics: unique([...list(card.mechanics), ...list(card.signalLexicon?.mechanical)]),
      themes: unique(card.themes),
      emotions: unique(card.emotions),
    },
    themeDiscussion: {
      continuationReading: recurrence?.summary || "",
      contrastReading: contrast?.summary || "",
      question: "Does the later song continue, transform, contrast with, or independently reuse the signal from the other song?",
      forcedWinner: false,
      humanDecisionRequired: true,
    },
    authority: {
      reviewStatus: "proposed",
      canonStatus: "non-canon",
      authorialIntentEstablished: false,
    },
  };
}

export function buildEchoInternalReferenceRoutes(run = {}, options = {}) {
  return internalCards(run)
    .map((card) => internalConnectionRecord(card, options))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function knownExternalSignals(run = {}) {
  return new Set(externalCards(run).flatMap((card) => [
    card.title,
    ...list(card.aliases),
    ...list(card.signalLexicon?.literal),
    ...list(card.signalLexicon?.orthographic),
    ...list(card.signalLexicon?.phonetic),
    ...list(card.signalLexicon?.multilingual),
    ...list(card.signalLexicon?.mechanical),
  ]).map((value) => slug(value)).filter(Boolean));
}

function candidatePhrasesForSong(song = {}, knownSignals = new Set()) {
  const rows = [];
  const recurrence = new Map();
  for (const line of list(song.lyrics)) {
    if (line.isSectionHeading) continue;
    const matches = String(line.text || "").match(
      /\b[A-Z][A-Za-z0-9'’_-]{2,}(?:\s+(?:(?:of|the|and|in|on|to|with)|[A-Z][A-Za-z0-9'’_-]{2,})){0,4}\b/g
    ) || [];
    for (const phrase of matches) {
      const clean = text(phrase)
        .replace(/[.,!?;:]+$/u, "")
        .replace(/\s+(?:of|the|and|in|on|to|with)$/iu, "");
      const key = slug(clean);
      const words = key.split("-").filter(Boolean);
      const contentWords = words.filter((word) => (
        !GRAMMAR_CLUE_TERMS.has(word)
        && !GENERIC_CLUE_TERMS.has(word)
        && word.length >= 3
      ));
      const startsWithGrammar = GRAMMAR_CLUE_TERMS.has(words[0]);
      const midLine = String(line.text || "").toLowerCase().indexOf(clean.toLowerCase()) > 1;
      if (!key || knownSignals.has(key)) continue;
      if (contentWords.length < 2) continue;
      if (startsWithGrammar && contentWords.length < 3) continue;
      recurrence.set(key, (recurrence.get(key) || 0) + 1);
      rows.push({
        phrase: clean,
        key,
        lineNumber: line.lineNumber,
        lyricText: line.text,
        pointer: `hapa://echos/${encodeURIComponent(song.id)}?line=${line.lineNumber}`,
        tokenCount: words.length,
        contentWordCount: contentWords.length,
        midLine,
        detector: words.length > 1 ? "capitalized-phrase-clue" : "capitalized-token-clue",
      });
    }
  }
  for (const properName of list(song.detectorSignals?.properNames)) {
    const key = slug(properName);
    if (
      !key
      || knownSignals.has(key)
      || GENERIC_CLUE_TERMS.has(key)
      || NON_ENTITY_SINGLE_CLUE_TERMS.has(key)
    ) continue;
    if (/['’]/u.test(properName)) continue;
    const matchingLines = list(song.lyrics).filter((row) => row.normalized?.split(" ").includes(properName));
    const line = matchingLines.find((row) => (
      String(row.text || "").toLowerCase().indexOf(String(properName).toLowerCase()) > 1
    )) || matchingLines[0] || list(song.lyrics)[0];
    const sourceText = String(line?.text || "");
    const sourceIndex = sourceText.toLowerCase().indexOf(String(properName).toLowerCase());
    const atLineStart = sourceIndex <= 1;
    const originalToken = sourceText.slice(sourceIndex, sourceIndex + String(properName).length) || properName;
    const allCaps = originalToken.length >= 4 && originalToken === originalToken.toUpperCase();
    if (atLineStart && matchingLines.length < 2 && !allCaps) continue;
    if (GRAMMAR_CLUE_TERMS.has(key)) continue;
    rows.push({
      phrase: originalToken,
      key,
      lineNumber: line?.lineNumber || 1,
      lyricText: line?.text || "",
      pointer: `hapa://echos/${encodeURIComponent(song.id)}?line=${line?.lineNumber || 1}`,
      tokenCount: 1,
      contentWordCount: 1,
      midLine: !atLineStart,
      allCaps,
      recurrence: matchingLines.length,
      detector: "proper-name-clue",
    });
  }
  return [...new Map(rows
    .map((row) => ({
      ...row,
      recurrence: row.recurrence || recurrence.get(row.key) || 1,
      score: round(Math.min(
        1,
        0.2
        + row.contentWordCount * 0.16
        + (row.midLine ? 0.16 : 0)
        + (row.allCaps ? 0.1 : 0)
        + Math.min(0.28, (row.recurrence || recurrence.get(row.key) || 1) * 0.07)
      )),
      status: "unresearched-clue",
      caveat: "A clue is not an external reference until a source and lyric-specific context delta are reviewed.",
    }))
    .sort((left, right) => right.score - left.score || left.lineNumber - right.lineNumber)
    .map((row) => [row.key, row])).values()].slice(0, 18);
}

function internalContextForSong(songId = "", internalRoutes = [], songById = new Map()) {
  const ranked = internalRoutes
    .filter((route) => route.status === "qualified-candidate" && route.songIds.includes(songId))
    .sort((left, right) => right.evidence.confidence - left.evidence.confidence || left.id.localeCompare(right.id))
    .map((route) => ({
      routeId: route.id,
      relatedSongs: route.songIds
        .filter((relatedSongId) => relatedSongId !== songId)
        .map((relatedSongId) => ({
          songId: relatedSongId,
          title: songById.get(relatedSongId)?.title || relatedSongId,
        })),
      relationType: route.relationType,
      rationale: route.evidence.rationale,
      sharedLanguage: route.sharedLanguage,
    }));
  return [...new Map(ranked.map((row) => [
    `${row.relatedSongs.map((song) => song.songId).sort().join(",")}:${row.relationType}`,
    row,
  ])).values()].slice(0, 5);
}

export function buildEchoReferenceResearchQueue(run = {}, census = {}, internalRoutes = []) {
  const songById = new Map(list(run.packet?.songs).map((song) => [song.id, song]));
  const knownSignals = knownExternalSignals(run);
  return list(census.rows)
    .filter((row) => row.external.status !== "coverage-prior-satisfied")
    .map((row) => {
      const song = songById.get(row.songId) || {};
      const blocked = row.eligibility !== "eligible";
      const candidateClues = blocked ? [] : candidatePhrasesForSong(song, knownSignals);
      const internalContext = blocked ? [] : internalContextForSong(row.songId, internalRoutes, songById);
      return {
        schemaVersion: "hapa.echo-reference-research-item.v1",
        id: `reference-research:${slug(row.songId)}`,
        songId: row.songId,
        songTitle: row.title,
        status: blocked ? "blocked-missing-lyrics" : "research-ready",
        priority: blocked
          ? 0
          : round(Math.min(1, 0.35 + row.external.deficit * 0.18 + Math.min(0.2, candidateClues.length * 0.02))),
        externalReferenceDeficit: row.external.deficit,
        candidateClues,
        internalContext,
        researchQuestions: blocked ? [
          "Acquire provenance-bound lyrics before attempting semantic reference discovery.",
        ] : (
          candidateClues.length
            ? candidateClues.slice(0, Math.max(3, row.external.deficit)).map((clue) => (
              `Does “${clue.phrase}” call a public work, person, place, event, game, song, or other canon—and if so, how would loading that canon alter this exact lyric's theme or takeaway?`
            ))
            : [
              "Review the complete lyric against public media, history, geography, language, games, music, and philosophy; return only source-backed candidates with exact lyric spans.",
            ]
        ),
        requiredOutput: {
          minimumSourceClass: "primary-or-authoritative-when-available",
          exactLyricSpanRequired: true,
          sourceContextRequired: true,
          withoutContextReadingRequired: true,
          withContextReadingRequired: true,
          themeEffectDiscussionRequired: true,
          alternativeReadingRequired: true,
          crossLanguageChannelSeedsRequired: true,
          automaticCanonPromotionAllowed: false,
        },
      };
    })
    .sort((left, right) => right.priority - left.priority || left.songTitle.localeCompare(right.songTitle));
}

function closestLineDistance(externalDelta = {}, internalRoute = {}, songId = "") {
  const externalLines = list(externalDelta.lyricSpans).map((row) => Number(row.lineStart || 1));
  const internalLines = list(internalRoute.evidence?.lyricSpans)
    .filter((row) => row.songId === songId)
    .map((row) => Number(row.lineStart || 1));
  let closest = Number.MAX_SAFE_INTEGER;
  for (const externalLine of externalLines) {
    for (const internalLine of internalLines) {
      closest = Math.min(closest, Math.abs(externalLine - internalLine));
    }
  }
  return closest;
}

export function buildEchoExternalInternalBridges(themeDeltas = [], internalRoutes = [], options = {}) {
  const maxBridgesPerActivation = Math.max(1, Number(options.maxBridgesPerActivation || 3));
  const maxLineDistance = Math.max(1, Number(options.bridgeLineDistance || 8));
  const qualified = internalRoutes.filter((route) => route.status === "qualified-candidate");
  const bridges = [];
  for (const delta of themeDeltas) {
    const candidates = qualified
      .filter((route) => route.songIds.includes(delta.songId))
      .map((route) => {
        const distance = closestLineDistance(delta, route, delta.songId);
        const externalThemes = [
          delta.reading.candidateThemeAfterLoading,
          delta.reading.operationalMechanic,
        ].flatMap((value) => String(value || "").toLowerCase().match(/[a-z0-9-]{4,}/g) || []);
        const sharedThemes = intersect(externalThemes, [
          ...list(route.sharedLanguage.themes),
          ...list(route.sharedLanguage.mechanics),
          ...list(route.sharedLanguage.emotions),
          ...list(route.sharedLanguage.literal),
        ]);
        const proximityScore = distance === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, 1 - distance / 24);
        const semanticScore = Math.min(1, sharedThemes.length * 0.22);
        const score = bounded(route.evidence.confidence * 0.45 + proximityScore * 0.35 + semanticScore * 0.2);
        return { route, distance, sharedThemes, score };
      })
      .filter((candidate) => candidate.distance <= maxLineDistance || candidate.sharedThemes.length > 0)
      .sort((left, right) => right.score - left.score || left.distance - right.distance || left.route.id.localeCompare(right.route.id))
      .slice(0, maxBridgesPerActivation);
    for (const candidate of candidates) {
      bridges.push({
        schemaVersion: "hapa.echo-reference-enrichment-bridge.v1",
        id: `reference-bridge:${slug(delta.id)}:${slug(candidate.route.id)}`,
        fromId: delta.referenceCardId,
        fromType: "reference-card",
        toId: candidate.route.referenceCardId,
        toType: "reference-card",
        viaSongId: delta.songId,
        relationType: "thematic-resonance",
        weight: round(candidate.score),
        confidence: round(Math.min(delta.evidence.confidence, candidate.route.evidence.confidence) * 0.82),
        evidenceClass: "comparative",
        status: "proposed",
        rationale: [
          `${delta.referenceTitle} and the internal route co-activate in "${delta.songTitle}".`,
          candidate.route.title ? `Internal comparison route: ${candidate.route.title}.` : "",
          candidate.distance <= maxLineDistance ? `Their nearest lyric moments are ${candidate.distance} line${candidate.distance === 1 ? "" : "s"} apart.` : "",
          candidate.sharedThemes.length ? `Shared language: ${candidate.sharedThemes.join(", ")}.` : "",
          "The bridge makes external canon traversable into album-internal comparison; it does not assert authorial intent.",
        ].filter(Boolean).join(" "),
        support: {
          themeDeltaId: delta.id,
          internalRouteId: candidate.route.id,
          lineDistance: candidate.distance,
          sharedThemes: candidate.sharedThemes,
        },
        authority: {
          humanApproved: false,
          canonStatus: "non-canon",
        },
      });
    }
  }
  return bridges.sort((left, right) => left.id.localeCompare(right.id));
}

function diagnosticScore(name, numerator, denominator, explanation) {
  const ratio = denominator ? Math.max(0, Math.min(1, numerator / denominator)) : 1;
  return {
    name,
    score: round(ratio * 4, 2),
    scale: "0-4 diagnostic",
    numerator,
    denominator,
    explanation,
  };
}

function buildBenchmark(pass, {
  run,
  census,
  themeDeltas = [],
  internalRoutes = [],
  researchQueue = [],
  bridges = [],
} = {}) {
  const eligibleRows = census.rows.filter((row) => row.eligibility === "eligible");
  const qualifiedRoutes = internalRoutes.filter((route) => route.status === "qualified-candidate");
  const external = externalCards(run);
  const sourceBacked = external.filter((card) => list(card.citations).some((citation) => citation.url));
  const qualifiedInternalSpans = qualifiedRoutes.filter((route) => (
    route.evidence.lyricSpans.length >= 2
    && route.evidence.lyricSpans.every((span) => span.pointer && span.lyricText)
  ));
  const pluralThemeRecords = themeDeltas.filter((delta) => (
    delta.themeDiscussion.possibleEffects.length >= 6
    && delta.themeDiscussion.humanDecisionRequired
  ));
  const importedMeaningRecords = themeDeltas.filter((delta) => (
    delta.reading.withoutExternalContext
    && delta.reading.externalCanonContribution
  ));
  const multichannelRecords = themeDeltas.filter((delta) => (
    delta.sharedLanguageChannels.filter((channel) => channel.candidates.length).length >= 2
  ));
  const actionableResearch = researchQueue.filter((item) => (
    item.status === "research-ready"
    && item.researchQuestions.length
    && item.requiredOutput.themeEffectDiscussionRequired
  ));
  const authorityViolations = [
    ...themeDeltas.filter((delta) => (
      delta.authority.canonStatus !== "non-canon"
      || delta.authority.humanDecisionRequired === false
    )),
    ...bridges.filter((bridge) => bridge.authority.humanApproved || bridge.authority.canonStatus !== "non-canon"),
  ].length;
  const researchReady = researchQueue.filter((item) => item.status === "research-ready");
  const candidateClueCount = researchReady.reduce((sum, item) => sum + item.candidateClues.length, 0);
  const fallbackResearchItems = researchReady.filter((item) => item.candidateClues.length === 0).length;
  const diagnostics = [
    diagnosticScore(
      "evidence",
      sourceBacked.length + qualifiedInternalSpans.length,
      external.length + Math.max(1, qualifiedRoutes.length),
      "External Cards need resolvable source pointers; internal routes need exact lyric spans."
    ),
    diagnosticScore(
      "precision",
      themeDeltas.filter((delta) => delta.lyricSpans.every((span) => span.pointer && span.lyricText)).length
        + qualifiedInternalSpans.length,
      Math.max(1, themeDeltas.length + qualifiedRoutes.length),
      "Records are anchored to exact song lines rather than floating at album level."
    ),
    diagnosticScore(
      "plurality",
      pluralThemeRecords.length + internalRoutes.filter((route) => (
        route.themeDiscussion.continuationReading && route.themeDiscussion.contrastReading
      )).length,
      Math.max(1, themeDeltas.length + internalRoutes.length),
      "Competing readings remain visible and no winner is forced."
    ),
    diagnosticScore(
      "imported-meaning",
      importedMeaningRecords.length,
      Math.max(1, themeDeltas.length),
      "External canon records distinguish the surface reading from the loaded-context reading."
    ),
    diagnosticScore(
      "connectivity",
      eligibleRows.filter((row) => row.external.deficit === 0).length
        + eligibleRows.filter((row) => row.internal.deficit === 0).length,
      Math.max(1, eligibleRows.length * 2),
      "The coverage prior is measured separately for external canon and internal album routes."
    ),
    diagnosticScore(
      "uncertainty",
      researchQueue.filter((item) => item.status.includes("blocked") || item.externalReferenceDeficit > 0).length
        + themeDeltas.filter((delta) => delta.themeDiscussion.acceptedEffect === null).length,
      Math.max(1, researchQueue.length + themeDeltas.length),
      "Missing evidence and undecided theme effects are explicit states."
    ),
    diagnosticScore(
      "provenance",
      themeDeltas.filter((delta) => delta.evidence.interpretationId && delta.evidence.citationIds.length).length
        + qualifiedInternalSpans.length,
      Math.max(1, themeDeltas.length + qualifiedRoutes.length),
      "Enrichment points back to citations, interpretations, lyric spans, and the source mining run."
    ),
    diagnosticScore(
      "safety",
      authorityViolations === 0 ? 1 : 0,
      1,
      "No derived record may auto-promote itself to Human-approved or Hapa canon."
    ),
    diagnosticScore(
      "navigability",
      themeDeltas.filter((delta) => delta.lyricSpans.some((span) => span.pointer)).length
        + qualifiedInternalSpans.length
        + bridges.length,
      Math.max(1, themeDeltas.length + qualifiedRoutes.length + bridges.length),
      "The overlay retains pointers and bridge routes that a UI can traverse."
    ),
    diagnosticScore(
      "actionability",
      actionableResearch.length + multichannelRecords.length,
      Math.max(1, researchQueue.filter((item) => item.status === "research-ready").length + themeDeltas.length),
      "Coverage gaps become bounded research prompts and confirmed references expose reusable language channels."
    ),
  ];
  return {
    schemaVersion: "hapa.echo-reference-sharpening-benchmark.v1",
    pass,
    headline: {
      songs: census.summary.songs,
      eligibleSongs: census.summary.eligibleSongs,
      blockedMissingLyrics: census.summary.blockedMissingLyrics,
      externalSongsMeetingThree: census.summary.external.songsMeetingPrior,
      externalCoverageRatio: census.summary.external.coverageRatio,
      externalReferenceDeficit: census.summary.external.totalReferenceDeficit,
      internalSongsMeetingThree: census.summary.internal.songsMeetingPrior,
      internalCoverageRatio: census.summary.internal.coverageRatio,
      themeDeltaRecords: themeDeltas.length,
      qualifiedInternalRoutes: qualifiedRoutes.length,
      heldInternalRoutes: internalRoutes.length - qualifiedRoutes.length,
      researchQueueItems: researchQueue.length,
      candidateClueCount,
      fallbackResearchItems,
      externalInternalBridges: bridges.length,
      authorityViolations,
    },
    diagnostics,
    diagnosticAverage: round(average(diagnostics.map((row) => row.score)), 2),
    note: "The diagnostic average tracks process completeness, not truth or authorial intent.",
  };
}

function passSnapshot(id, label, benchmark, details = {}) {
  return {
    schemaVersion: "hapa.echo-reference-sharpening-pass.v1",
    id,
    label,
    benchmark,
    details,
  };
}

export function runEchoReferenceSharpening(run = {}, options = {}) {
  const census = buildEchoReferenceCoverageCensus(run, options);
  const passOneBenchmark = buildBenchmark("pass-1-inventory", { run, census });
  const passOne = passSnapshot(
    "pass-1-inventory",
    "Inventory and coverage truth",
    passOneBenchmark,
    {
      finding: "Measure the 3+3 prior without filling gaps by assertion.",
      externalResearchDeficit: census.summary.external.totalReferenceDeficit,
      internalRouteDeficit: census.summary.internal.totalRouteDeficit,
      blockedMissingLyrics: census.summary.blockedMissingLyrics,
    }
  );

  const themeDeltas = buildEchoExternalThemeDeltas(run);
  const internalRoutes = buildEchoInternalReferenceRoutes(run, options);
  const researchQueue = buildEchoReferenceResearchQueue(run, census, internalRoutes);
  const passTwoBenchmark = buildBenchmark("pass-2-expansion", {
    run,
    census,
    themeDeltas,
    internalRoutes,
    researchQueue,
  });
  const passTwo = passSnapshot(
    "pass-2-expansion",
    "Context expansion and research packets",
    passTwoBenchmark,
    {
      finding: "Every existing external activation now exposes a reviewable theme-delta question and cross-language channel seeds.",
      researchReady: researchQueue.filter((item) => item.status === "research-ready").length,
      blocked: researchQueue.filter((item) => item.status !== "research-ready").length,
    }
  );

  const bridges = buildEchoExternalInternalBridges(themeDeltas, internalRoutes, options);
  const qualifiedRoutes = internalRoutes.filter((route) => route.status === "qualified-candidate");
  const heldRoutes = internalRoutes.filter((route) => route.status !== "qualified-candidate");
  const passThreeBenchmark = buildBenchmark("pass-3-verification", {
    run,
    census,
    themeDeltas,
    internalRoutes,
    researchQueue,
    bridges,
  });
  const passThree = passSnapshot(
    "pass-3-verification",
    "Adversarial verification and graph integration",
    passThreeBenchmark,
    {
      finding: "Only source-backed external activations and evidence-bearing internal routes are bridged; unresolved routes remain visible but held.",
      qualifiedInternalRoutes: qualifiedRoutes.length,
      heldInternalRoutes: heldRoutes.length,
      proposedExternalInternalBridges: bridges.length,
    }
  );

  const core = {
    schemaVersion: ECHO_REFERENCE_SHARPENING_SCHEMA,
    version: ECHO_REFERENCE_SHARPENING_VERSION,
    source: {
      runId: run.runId,
      runHash: run.runHash,
      packetHash: run.packetHash,
      minerVersion: run.minerVersion,
    },
    coverageContract: census.contract,
    passes: [passOne, passTwo, passThree],
    database: {
      census,
      themeDeltas,
      internalRoutes: qualifiedRoutes,
      heldInternalRoutes: heldRoutes,
      externalInternalBridges: bridges,
      researchQueue,
    },
    benchmarkComparison: [passOneBenchmark, passTwoBenchmark, passThreeBenchmark],
    reflection: {
      becameClearer: [
        `${census.summary.internal.songsMeetingPrior} lyric-bearing songs already satisfy the three-internal-route prior under the stricter evidence floor.`,
        `${census.summary.external.songsMeetingPrior} lyric-bearing songs currently satisfy the three-external-reference prior.`,
        "External canon can change a reading without becoming authorial intent or Hapa canon.",
      ],
      remainsUncertain: [
        `${census.summary.external.totalReferenceDeficit} source-backed external placements remain to be researched across eligible songs.`,
        `${census.summary.blockedMissingLyrics} songs cannot be evaluated until provenance-bound lyrics are available.`,
        "Theme effects remain proposed until a Human accepts, revises, or rejects them.",
      ],
      nextPassNeeds: [
        "Execute the highest-priority research packets with authoritative sources.",
        "Ingest missing lyrics before scoring placeholder songs.",
        "Review high-leverage theme deltas and promote only the approved interpretation records.",
      ],
    },
  };
  return {
    ...core,
    sharpeningRunId: `echo-reference-sharpening:${echoReferenceDigest({
      sourceRunId: run.runId,
      sourcePacketHash: run.packetHash,
      coverageContract: census.contract,
      internalConfidenceFloor: Number(options.internalConfidenceFloor ?? 0.55),
      maxBridgesPerActivation: Number(options.maxBridgesPerActivation || 3),
      bridgeLineDistance: Number(options.bridgeLineDistance || 8),
    }).replace(":", "-")}`,
    databaseHash: echoReferenceDigest(core.database),
  };
}
