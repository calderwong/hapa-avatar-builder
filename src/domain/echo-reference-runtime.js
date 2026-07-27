function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cardRevisionId(card = {}) {
  return String(card.revisionId || card.revision_id || "").trim();
}

function mediaCardId(record = {}) {
  return String(record.cardId || record.card_id || record.referenceCardId || record.card?.id || "").trim();
}

function mediaRevisionId(record = {}) {
  return String(record.cardRevisionId || record.revisionId || record.card_revision_id || record.card?.revisionId || "").trim();
}

function mediaUri(record = {}, kind = "image") {
  const source = kind === "video"
    ? record.loop || record.video || record.animatedLoop || record.artifacts?.loopVideo || {}
    : record.image || record.still || record.artifacts?.image || {};
  return String(source.runtimeUri || source.uri || source.path || "").trim();
}

export function selectEchoReferenceRuntimeRun({ localRun = null, researchRun = null } = {}) {
  const researchCards = asArray(researchRun?.cards);
  const localCards = asArray(localRun?.cards);
  const researchContributions = asArray(researchRun?.contributions);
  const hasResearchProjection = researchCards.length > 0 && (
    researchContributions.some((entry) => /research/i.test(String(entry?.kind || entry?.type || entry?.eventType || "")))
    || researchCards.some((card) => /research/i.test(String(card?.provenance?.method || card?.provenance?.sourceRunId || "")))
    || researchCards.length > localCards.length
  );
  if (hasResearchProjection) return { run: researchRun, source: "external-research-projection" };
  if (localRun) return { run: localRun, source: "local-mining-snapshot" };
  if (researchRun) return { run: researchRun, source: "external-research-projection" };
  return { run: null, source: "generated" };
}

export function attachEchoReferenceMedia(run = {}, mediaCatalog = {}) {
  const records = asArray(mediaCatalog?.records || mediaCatalog?.cards || mediaCatalog);
  const byCardId = new Map(records.map((record) => [mediaCardId(record), record]).filter(([id]) => id));
  let mediaBacked = 0;
  let images = 0;
  let loops = 0;
  let directorEligible = 0;
  let staleRevisionCount = 0;
  const cards = asArray(run.cards).map((card) => {
    const record = byCardId.get(String(card.id || ""));
    if (!record) return card;
    const expectedRevision = mediaRevisionId(record);
    const actualRevision = cardRevisionId(card);
    if (expectedRevision && actualRevision && expectedRevision !== actualRevision) {
      staleRevisionCount += 1;
      return card;
    }
    const imageUri = mediaUri(record, "image");
    const loopVideoUri = mediaUri(record, "video");
    if (!imageUri && !loopVideoUri) return card;
    mediaBacked += 1;
    if (imageUri) images += 1;
    if (loopVideoUri) loops += 1;
    if (record.technical?.directorEligible === true || record.directorEligible === true) directorEligible += 1;
    return {
      ...card,
      presentationMedia: {
        schemaVersion: "hapa.echo-reference-presentation-media.v1",
        cardId: card.id,
        cardRevisionId: actualRevision,
        image: {
          uri: imageUri,
          hash: String(record.image?.hash || record.image?.sha256 || record.artifacts?.image?.sha256 || ""),
        },
        loopVideo: {
          uri: loopVideoUri,
          posterUri: imageUri,
          hash: String(record.loop?.hash || record.loop?.sha256 || record.video?.hash || record.artifacts?.loopVideo?.sha256 || ""),
        },
        pattern: String(record.pattern?.id || record.pattern || record.treatment || ""),
        technical: { ...(record.technical || {}) },
        custody: { ...(record.custody || {}) },
        createdAt: String(record.createdAt || mediaCatalog.updatedAt || mediaCatalog.generatedAt || ""),
      },
    };
  });
  return {
    ...run,
    cards,
    referenceRuntime: {
      schemaVersion: "hapa.echo-reference-runtime-summary.v1",
      totalCards: cards.length,
      mediaBacked,
      images,
      loops,
      directorEligible,
      staleRevisionCount,
      researchProposals: asArray(run.contributions).filter((entry) => /research/i.test(String(entry?.kind || entry?.type || entry?.eventType || ""))).length,
      mediaCatalogGeneratedAt: String(mediaCatalog.updatedAt || mediaCatalog.generatedAt || ""),
    },
  };
}

function cardMatchesSong(card = {}, songId = "") {
  if (!songId) return true;
  return asArray(card.occurrences).some((occurrence) => occurrence.songId === songId);
}

export function buildEchoReferenceTarotCards(run = {}, { songId = "" } = {}) {
  return asArray(run.cards)
    .filter((card) => card.presentationMedia && cardMatchesSong(card, songId))
    .map((card) => {
      const media = card.presentationMedia;
      const imageUri = String(media.image?.uri || "");
      const videoUri = String(media.loopVideo?.uri || "");
      const songs = [...new Set(asArray(card.occurrences).map((occurrence) => occurrence.songId).filter(Boolean))];
      const sources = asArray(card.citations).map((citation) => ({
        label: citation.label || citation.title || citation.url,
        url: citation.url,
        sourceClass: citation.sourceClass,
      }));
      return {
        id: `tarot-reference:${card.id}`,
        referenceCardId: card.id,
        cardType: "reference_card",
        tarotMainType: "echo_reference",
        sourceKind: "echo-reference-atlas",
        kind: "reference",
        title: card.title,
        subtitle: "Echo Album Reference Atlas",
        summary: card.summary,
        meaning: card.publicContext || card.summary,
        image: imageUri,
        imageUri,
        highResImage: imageUri,
        poster: imageUri,
        videoUri,
        videoSources: videoUri ? [{
          uri: videoUri,
          posterUri: imageUri,
          status: "complete",
          treatment: media.pattern || "adaptive-default",
        }] : [],
        tags: [
          "tarot-card",
          "tarot-draw-ready",
          "echo-reference",
          card.authority?.reviewStatus || "pending-review",
          card.authority?.evidenceClass || "candidate",
        ],
        keywords: [...new Set([
          ...asArray(card.themes),
          ...asArray(card.mechanics),
          ...asArray(card.emotions),
        ])].slice(0, 18),
        stats: {
          songs: songs.length,
          sources: sources.length,
          readings: asArray(card.interpretations).length,
        },
        referenceAtlas: {
          cardId: card.id,
          revisionId: cardRevisionId(card),
          authority: card.authority,
          publicContext: card.publicContext || "",
          occurrences: card.occurrences,
          claims: card.claims,
          citations: sources,
          interpretations: card.interpretations,
          relationships: card.relationships,
          themes: card.themes,
          mechanics: card.mechanics,
          emotions: card.emotions,
          presentationMedia: media,
        },
      };
    });
}
