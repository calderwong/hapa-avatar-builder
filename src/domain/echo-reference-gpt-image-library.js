const CODEX_GPT_IMAGE_LANE = "codex-gpt-image";
const LATER_FLUX_KREA_LANE = "later-flux-krea";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

function revisionId(value = {}) {
  return text(value.revisionId || value.revision_id || value.cardRevisionId || value.card_revision_id);
}

function recordCardId(record = {}) {
  return text(record.card?.id || record.cardId || record.card_id || record.referenceCardId);
}

function recordRevisionId(record = {}) {
  return text(record.card?.revisionId || record.cardRevisionId || record.revisionId || record.card_revision_id);
}

function imageArtifact(record = {}) {
  return record.artifacts?.image || record.image || record.still || {};
}

function imageUri(record = {}) {
  const artifact = imageArtifact(record);
  return text(artifact.runtimeUri || artifact.uri);
}

function loopArtifact(record = {}) {
  return record.artifacts?.loopVideo || record.loopVideo || record.video || {};
}

function loopUri(record = {}) {
  const artifact = loopArtifact(record);
  return text(artifact.runtimeUri || artifact.uri);
}

function compactConnection(card = {}) {
  return {
    why: text(card.publicContext || card.summary).slice(0, 900),
    lyricMoments: list(card.occurrences).slice(0, 6).map((occurrence) => ({
      id: text(occurrence.id),
      songId: text(occurrence.songId),
      songTitle: text(occurrence.songTitle || occurrence.songId),
      line: Number(occurrence.lyricSpan?.lineStart || 0) || null,
      excerpt: text(occurrence.lyricSpan?.lyricText).slice(0, 360),
      confidence: Number(occurrence.confidence || 0),
    })),
    claims: list(card.claims).slice(0, 6).map((claim) => ({
      id: text(claim.id),
      kind: text(claim.kind),
      text: text(claim.text).slice(0, 500),
      caveat: text(claim.caveat).slice(0, 320),
    })),
    interpretations: list(card.interpretations).slice(0, 4).map((interpretation) => ({
      id: text(interpretation.id),
      title: text(interpretation.title),
      summary: text(interpretation.summary).slice(0, 500),
      confidence: Number(interpretation.confidence || 0),
      status: text(interpretation.status),
    })),
    citations: list(card.citations).slice(0, 6).map((citation) => ({
      id: text(citation.id),
      label: text(citation.label || citation.url),
      url: text(citation.url),
      sourceClass: text(citation.sourceClass),
    })),
    themes: list(card.themes).map(text).filter(Boolean).slice(0, 12),
    mechanics: list(card.mechanics).map(text).filter(Boolean).slice(0, 12),
    emotions: list(card.emotions).map(text).filter(Boolean).slice(0, 12),
  };
}

export function classifyEchoReferenceImageRecord(record = {}) {
  const benchmark = record.sourceBenchmark || {};
  const searchable = [
    benchmark.generator,
    benchmark.jobId,
    record.generator,
    record.provider,
    record.provenance?.sourceCatalog,
    imageArtifact(record).sourcePath,
  ].map(text).join(" ").toLowerCase();

  if (/\b(?:flux|krea|black forest labs)\b/.test(searchable)) return LATER_FLUX_KREA_LANE;
  if (
    /\b(?:codex|gpt[ -]?image)\b/.test(searchable)
    || text(benchmark.jobId).startsWith("echo-reference-gpt-image:")
  ) return CODEX_GPT_IMAGE_LANE;
  return "other";
}

function compactSongs(card = {}) {
  const songs = new Map();
  for (const occurrence of list(card.occurrences)) {
    const id = text(occurrence.songId);
    if (!id || songs.has(id)) continue;
    songs.set(id, {
      id,
      title: text(occurrence.songTitle) || id,
      trackNumber: Number(occurrence.trackNumber || 0) || null,
    });
  }
  return [...songs.values()].sort((left, right) => (
    Number(left.trackNumber || Number.MAX_SAFE_INTEGER) - Number(right.trackNumber || Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title)
  ));
}

function cohort(record = {}) {
  return text(record.sourceBenchmark?.generator)
    ? "explicit-codex-gpt-image"
    : "earlier-gpt-image-source-pass";
}

export function buildEchoReferenceGptImageLibrary(run = {}, mediaCatalog = {}) {
  const cardsById = new Map(list(run.cards).map((card) => [text(card.id), card]));
  const records = list(mediaCatalog.records || mediaCatalog.cards || mediaCatalog);
  const itemsByCardId = new Map();
  let excludedFluxKrea = 0;
  let excludedOther = 0;
  let staleBindings = 0;

  for (const record of records) {
    const lane = classifyEchoReferenceImageRecord(record);
    if (lane === LATER_FLUX_KREA_LANE) {
      excludedFluxKrea += 1;
      continue;
    }
    if (lane !== CODEX_GPT_IMAGE_LANE) {
      excludedOther += 1;
      continue;
    }
    const cardId = recordCardId(record);
    const card = cardsById.get(cardId);
    const uri = imageUri(record);
    if (!card || !uri) continue;
    const expectedRevisionId = recordRevisionId(record);
    const activeRevisionId = revisionId(card);
    if (expectedRevisionId && activeRevisionId && expectedRevisionId !== activeRevisionId) {
      staleBindings += 1;
      continue;
    }
    const sourceCohort = cohort(record);
    const songs = compactSongs(card);
    const item = {
      id: cardId,
      revisionId: activeRevisionId,
      title: text(card.title) || text(record.card?.title) || cardId,
      summary: text(card.summary || card.publicContext).slice(0, 600),
      referenceType: text(card.referenceType || "reference"),
      image: {
        uri,
        hash: text(imageArtifact(record).sha256 || imageArtifact(record).hash),
      },
      loopVideo: loopUri(record) ? {
        uri: loopUri(record),
        hash: text(loopArtifact(record).sha256 || loopArtifact(record).hash),
      } : null,
      songs,
      occurrenceCount: list(card.occurrences).length,
      connection: compactConnection(card),
      authority: {
        reviewStatus: text(card.authority?.reviewStatus || record.custody?.reviewStatus || "pending-review"),
        evidenceClass: text(card.authority?.evidenceClass || "candidate"),
      },
      source: {
        lane: CODEX_GPT_IMAGE_LANE,
        cohort: sourceCohort,
        generator: text(record.sourceBenchmark?.generator) || "GPT Image source-reference pass",
        jobId: text(record.sourceBenchmark?.jobId),
        promptHash: text(record.sourceBenchmark?.promptHash),
        manifestHash: text(record.sourceBenchmark?.manifestHash),
        createdAt: text(record.createdAt),
      },
    };
    const previous = itemsByCardId.get(cardId);
    if (!previous || item.source.createdAt.localeCompare(previous.source.createdAt) >= 0) {
      itemsByCardId.set(cardId, item);
    }
  }

  const items = [...itemsByCardId.values()].sort((left, right) => (
    (left.songs[0]?.title || "").localeCompare(right.songs[0]?.title || "")
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id)
  ));
  const explicitCodex = items.filter((item) => item.source.cohort === "explicit-codex-gpt-image").length;
  const earlierGpt = items.filter((item) => item.source.cohort === "earlier-gpt-image-source-pass").length;
  const loopReady = items.filter((item) => item.loopVideo?.uri).length;

  return {
    schemaVersion: "hapa.echo-reference-gpt-image-library.v1",
    runId: text(run.runId),
    runHash: text(run.runHash),
    generatedAt: text(mediaCatalog.updatedAt || mediaCatalog.generatedAt || run.generatedAt),
    lane: CODEX_GPT_IMAGE_LANE,
    counts: {
      total: items.length,
      explicitCodex,
      earlierGpt,
      loopReady,
      excludedFluxKrea,
      excludedOther,
      staleBindings,
    },
    policy: {
      includes: "Codex and GPT Image Reference Atlas stills",
      excludes: "Later Flux and Krea generation lanes",
      allItemsReturned: true,
    },
    items,
  };
}
