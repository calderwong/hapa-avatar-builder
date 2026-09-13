import {
  buildEchoReferenceViews,
  compileEchoReferenceGraph,
  echoReferenceDigest,
} from "./echo-reference-mining.js";

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

function authorityEntryKey(cardId = "", revisionId = "") {
  return `${String(cardId || "").trim()}\u0000${String(revisionId || "").trim()}`;
}

function authorityEntries(receipt = {}, key = "") {
  return new Map(asArray(receipt?.[key]).map((entry) => [
    authorityEntryKey(entry.cardId, entry.revisionId),
    entry,
  ]));
}

function appendDecisionId(provenance = {}, decisionId = "") {
  const decisionIds = [...new Set([
    ...asArray(provenance?.decisionIds),
    String(decisionId || "").trim(),
  ].filter(Boolean))];
  return { ...(provenance || {}), decisionIds };
}

export function applyEchoReferencePreviewFirstAuthority(run = {}, mediaCatalog = {}, receipt = {}) {
  const sourceRunHash = String(receipt?.source?.runHash || "");
  const activeRunHash = String(run?.runHash || "");
  const receiptApplies = Boolean(
    receipt?.schemaVersion === "hapa.echo-reference-preview-first-authority.v1"
    && sourceRunHash
    && sourceRunHash === activeRunHash
  );
  if (!receiptApplies) {
    return {
      run,
      mediaCatalog,
      authoritySummary: {
        status: receipt?.schemaVersion ? "stale-or-inapplicable" : "not-recorded",
        receiptId: String(receipt?.id || ""),
        approvedCards: 0,
        resolvedWithoutPromotion: 0,
        resolvedUnresolvedNodes: 0,
        approvedConnections: 0,
        resolvedConnections: 0,
        resolvedResearchUpdates: 0,
        approvedMedia: 0,
        previewPolicy: "visible-before-review",
      },
    };
  }

  const approvedCards = authorityEntries(receipt, "approvedCards");
  const resolvedCards = authorityEntries(receipt, "resolvedWithoutPromotion");
  const approvedMedia = authorityEntries(receipt, "approvedMedia");
  const resolvedContributionIds = new Set(asArray(receipt.resolvedResearchUpdates).map((entry) => entry.id));
  const approvedAt = String(receipt.approvedAt || receipt.createdAt || "");
  const approvedBy = String(receipt.approvedBy || receipt.actor || "human-owner");
  const decisionId = String(receipt.id || "");
  const approvedCardIds = new Set(asArray(receipt.approvedCards).map((entry) => entry.cardId));
  const resolvedCardIds = new Set(asArray(receipt.resolvedWithoutPromotion).map((entry) => entry.cardId));

  const cards = asArray(run.cards).map((card) => {
    const key = authorityEntryKey(card.id, cardRevisionId(card));
    const approved = approvedCards.get(key);
    const resolved = resolvedCards.get(key);
    if (approved) {
      return {
        ...card,
        occurrences: asArray(card.occurrences).map((occurrence) => ({
          ...occurrence,
          status: occurrence.status === "challenged" ? "challenged" : "approved",
        })),
        interpretations: asArray(card.interpretations).map((interpretation) => ({
          ...interpretation,
          status: interpretation.status === "challenged" ? "challenged" : "approved",
          approvedBy,
        })),
        relationships: asArray(card.relationships).map((relationship) => (
          relationship.evidenceClass === "unresolved"
            ? {
              ...relationship,
              status: "rejected",
              humanApproved: false,
              provenance: appendDecisionId(relationship.provenance, decisionId),
            }
            : {
              ...relationship,
              status: relationship.status === "challenged" ? "challenged" : "approved",
              humanApproved: true,
              provenance: appendDecisionId(relationship.provenance, decisionId),
            }
        )),
        authority: {
          ...(card.authority || {}),
          reviewStatus: "approved",
          approvedBy,
          approvedAt,
        },
        reviewResolution: {
          status: "approved-for-local-interpretive-use",
          scope: asArray(receipt.policy?.approvedUseScopes),
          receiptId: decisionId,
          canonPromotion: false,
          publicActivation: false,
        },
      };
    }
    if (resolved) {
      return {
        ...card,
        unresolved: asArray(card.unresolved).map((item) => ({
          ...item,
          status: "resolved-without-promotion",
        })),
        authority: {
          ...(card.authority || {}),
          reviewStatus: "rejected",
        },
        reviewResolution: {
          status: "resolved-without-promotion",
          reason: String(resolved.reason || "No supported reference was promoted in this review pass."),
          receiptId: decisionId,
          retriable: true,
          canonPromotion: false,
          publicActivation: false,
        },
      };
    }
    return card;
  });

  const graph = {
    ...(run.graph || {}),
    edges: asArray(run.graph?.edges).map((edge) => {
      if (edge.evidenceClass === "unresolved"
        || resolvedCardIds.has(edge.fromId)
        || resolvedCardIds.has(edge.toId)) {
        return {
          ...edge,
          status: "rejected",
          humanApproved: false,
          reviewResolution: "resolved-without-promotion",
          provenance: appendDecisionId(edge.provenance, decisionId),
        };
      }
      if (approvedCardIds.has(edge.fromId)
        || approvedCardIds.has(edge.toId)
        || edge.fromType === "song"
        || edge.toType === "song") {
        return {
          ...edge,
          status: edge.status === "challenged" ? "challenged" : "approved",
          humanApproved: true,
          provenance: appendDecisionId(edge.provenance, decisionId),
        };
      }
      return edge;
    }),
  };

  const governedRun = {
    ...run,
    cards,
    graph,
    unresolved: asArray(run.unresolved).map((item) => ({
      ...item,
      status: "resolved-without-promotion",
      resolution: {
        receiptId: decisionId,
        retriable: true,
        promotedReferenceCardId: null,
      },
    })),
    contributions: asArray(run.contributions).map((entry) => (
      resolvedContributionIds.has(entry.id)
        ? {
          ...entry,
          status: "resolved-approved",
          resolvedAt: approvedAt,
          resolvedBy: approvedBy,
          authorityReceiptId: decisionId,
        }
        : entry
    )),
    previewFirstAuthority: {
      schemaVersion: receipt.schemaVersion,
      receiptId: decisionId,
      approvedAt,
      approvedBy,
      policy: receipt.policy,
    },
  };

  const governedRecords = asArray(mediaCatalog?.records).map((record) => {
    const key = authorityEntryKey(mediaCardId(record), mediaRevisionId(record));
    if (!approvedMedia.has(key)) {
      return {
        ...record,
        custody: {
          ...(record.custody || {}),
          previewVisibility: "visible-before-review",
          reviewStatus: String(record.custody?.reviewStatus || "pending-review"),
        },
      };
    }
    return {
      ...record,
      custody: {
        ...(record.custody || {}),
        previewVisibility: "visible-before-review",
        reviewStatus: "approved",
        approvedBy,
        approvedAt,
        authorityReceiptId: decisionId,
        humanReviewRequired: false,
        publicActivation: false,
        canonPromotion: false,
        mint: false,
      },
    };
  });
  const governedMediaCatalog = {
    ...mediaCatalog,
    records: governedRecords,
    custody: {
      ...(mediaCatalog?.custody || {}),
      previewVisibility: "visible-before-review",
      reviewStatus: "approved",
      approvedBy,
      approvedAt,
      authorityReceiptId: decisionId,
      humanReviewRequired: false,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
    },
  };

  return {
    run: governedRun,
    mediaCatalog: governedMediaCatalog,
    authoritySummary: {
      status: "applied",
      receiptId: decisionId,
      approvedCards: approvedCards.size,
      resolvedWithoutPromotion: resolvedCards.size,
      resolvedUnresolvedNodes: asArray(governedRun.unresolved).length,
      approvedConnections: asArray(graph.edges).filter((edge) => edge.status === "approved").length,
      resolvedConnections: asArray(graph.edges).filter((edge) => edge.reviewResolution === "resolved-without-promotion").length,
      resolvedResearchUpdates: resolvedContributionIds.size,
      approvedMedia: approvedMedia.size,
      previewPolicy: "visible-before-review",
      publicActivation: false,
      canonPromotion: false,
    },
  };
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

export function mergeEchoReferenceRuntimeCoverage(primaryRun = {}, catalogRun = {}) {
  const primarySongs = asArray(primaryRun?.packet?.songs);
  const catalogSongs = asArray(catalogRun?.packet?.songs);
  if (!catalogSongs.length) return primaryRun;

  const catalogSongIds = new Set(catalogSongs.map((song) => String(song?.id || "")).filter(Boolean));
  const primarySongIds = new Set(primarySongs.map((song) => String(song?.id || "")).filter(Boolean));
  const missingSongIds = [...catalogSongIds].filter((songId) => !primarySongIds.has(songId));
  const packetChanged = String(primaryRun?.packetHash || primaryRun?.packet?.packetHash || "")
    !== String(catalogRun?.packetHash || catalogRun?.packet?.packetHash || "");
  if (!missingSongIds.length && !packetChanged) return primaryRun;

  // Keep the research/authority/media-bearing version of a Card when identities overlap,
  // then fill every remaining Card and song from the current canonical album snapshot.
  const cardsById = new Map();
  for (const card of asArray(primaryRun.cards)) cardsById.set(String(card.id || ""), structuredClone(card));
  for (const card of asArray(catalogRun.cards)) {
    const cardId = String(card.id || "");
    if (cardId && !cardsById.has(cardId)) cardsById.set(cardId, structuredClone(card));
  }
  const cards = [...cardsById.values()];
  const unresolved = [...new Map([
    ...asArray(primaryRun.unresolved),
    ...asArray(catalogRun.unresolved),
  ].map((item) => [String(item?.id || echoReferenceDigest(item)), structuredClone(item)])).values()]
    .filter((item) => !item?.songId || catalogSongIds.has(String(item.songId)));
  const contributions = [...new Map([
    ...asArray(primaryRun.contributions),
    ...asArray(catalogRun.contributions),
  ].map((item) => [String(item?.id || echoReferenceDigest(item)), structuredClone(item)])).values()];
  const packet = structuredClone(catalogRun.packet);
  const runId = String(catalogRun.runId || primaryRun.runId || "echo-reference-runtime-composite");
  const graph = compileEchoReferenceGraph(packet, cards, { runId });
  const views = buildEchoReferenceViews(packet, cards, graph, unresolved);
  const songsCovered = Object.values(views.bySong || {}).filter((song) => song.coverage?.cardCount > 0).length;
  const core = {
    ...structuredClone(catalogRun),
    cards,
    graph,
    views,
    unresolved,
    contributions,
    audit: {
      ...(catalogRun.audit || {}),
      validCards: cards.length,
      songsCovered,
      songsWithoutCurrentRoutes: Math.max(0, catalogSongs.length - songsCovered),
      coverageRatio: catalogSongs.length ? songsCovered / catalogSongs.length : 0,
    },
    runtimeCoverage: {
      schemaVersion: "hapa.echo-reference-runtime-coverage.v1",
      primaryRunId: String(primaryRun.runId || ""),
      primaryRunHash: String(primaryRun.runHash || ""),
      catalogRunId: String(catalogRun.runId || ""),
      catalogRunHash: String(catalogRun.runHash || ""),
      primarySongCount: primarySongs.length,
      catalogSongCount: catalogSongs.length,
      missingSongIdsRecovered: missingSongIds,
      primaryCardsPreserved: asArray(primaryRun.cards).length,
      catalogCardsAdded: cards.length - asArray(primaryRun.cards).length,
      policy: "research-authority-media-first-plus-current-canonical-album-coverage",
    },
  };
  return {
    ...core,
    runHash: echoReferenceDigest({
      primaryRunHash: primaryRun.runHash,
      catalogRunHash: catalogRun.runHash,
      cards,
      graphHash: graph.graphHash,
      contributions,
    }),
  };
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
        custody: {
          previewVisibility: "visible-before-review",
          reviewStatus: String(record.custody?.reviewStatus || "pending-review"),
          ...(record.custody || {}),
        },
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
