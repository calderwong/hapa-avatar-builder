export const SONG_REFERENCE_CATALOG_SCHEMA = "hapa.song-reference-catalog.v1";
export const SONG_REFERENCE_CONNECTOR_SCHEMA = "hapa.song-reference-connector.v1";
export const SONG_REFERENCE_GRAPH_EDGE_SCHEMA = "hapa.song-reference-graph-edge.v1";
export const SONG_CONTEXT_LAYER_SCHEMA = "hapa.song-context-layer.v1";
export const ECHO_SEMANTIC_TRAVERSAL_SCHEMA = "hapa.echo-semantic-traversal.v1";

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values = []) {
  const seen = new Set();
  return list(values).filter((value) => {
    const key = typeof value === "string" ? value.toLowerCase() : JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeSongReferenceCatalog(catalog = []) {
  const seen = new Set();
  return list(catalog).flatMap((reference) => {
    const id = text(reference?.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      schemaVersion: SONG_REFERENCE_CATALOG_SCHEMA,
      id,
      title: text(reference.title, id),
      kind: text(reference.kind, "work"),
      creators: unique(reference.creators || []).map(String),
      franchise: text(reference.franchise),
      publicContext: text(reference.publicContext),
      themes: unique(reference.themes || []).map(String),
      traversalTerms: unique(reference.traversalTerms || []).map(String),
      mechanics: unique(reference.mechanics || []).map(String),
      signalLexicon: {
        literal: unique(reference.signalLexicon?.literal || []).map(String),
        phonetic: unique(reference.signalLexicon?.phonetic || []).map(String),
        orthographic: unique(reference.signalLexicon?.orthographic || []).map(String),
        multilingual: unique(reference.signalLexicon?.multilingual || []).map(String),
        mechanical: unique(reference.signalLexicon?.mechanical || []).map(String)
      },
      source: {
        label: text(reference.source?.label, reference.title || id),
        url: text(reference.source?.url),
        sourceKind: text(reference.source?.sourceKind, "authoritative-reference"),
        checkedAt: text(reference.source?.checkedAt)
      },
      canonStatus: text(reference.canonStatus, "external-reference"),
      reviewStatus: text(reference.reviewStatus, "source-backed")
    }];
  });
}

export function normalizeSongReferenceConnectors(connectors = []) {
  const seen = new Set();
  return list(connectors).flatMap((connector) => {
    const referenceId = text(connector?.referenceId);
    const songId = text(connector?.target?.songId || connector?.songId);
    const lineStart = Math.max(1, Number(connector?.target?.lineStart || connector?.lineStart || 1));
    const id = text(connector?.id, `${songId}:${referenceId}:line-${lineStart}`);
    if (!id || !referenceId || !songId || seen.has(id)) return [];
    seen.add(id);
    return [{
      schemaVersion: SONG_REFERENCE_CONNECTOR_SCHEMA,
      id,
      referenceId,
      referenceTitle: text(connector.referenceTitle, referenceId),
      referenceKind: text(connector.referenceKind, "work"),
      relationType: text(connector.relationType, "alludes-to"),
      confidence: text(connector.confidence, "explicit-lyric-match"),
      target: {
        songId,
        lineStart,
        lineEnd: Math.max(lineStart, Number(connector?.target?.lineEnd || connector?.lineEnd || lineStart)),
        lyricText: text(connector?.target?.lyricText || connector?.lyricText),
        matchedText: text(connector?.target?.matchedText || connector?.matchedText)
      },
      semanticEffect: {
        withoutContext: text(connector?.semanticEffect?.withoutContext),
        withContext: text(connector?.semanticEffect?.withContext),
        thematicShift: text(connector?.semanticEffect?.thematicShift),
        expositionFunction: text(connector?.semanticEffect?.expositionFunction),
        traversalEdges: unique(connector?.semanticEffect?.traversalEdges || []).map(String)
      },
      evidence: {
        classification: text(connector?.evidence?.classification, "confirmed-direct"),
        score: Math.max(0, Math.min(1, Number(connector?.evidence?.score ?? 1))),
        channels: unique(connector?.evidence?.channels || ["literal"]).map(String),
        signals: list(connector?.evidence?.signals).map((signal) => ({
          channel: text(signal?.channel, "literal"),
          value: text(signal?.value),
          explanation: text(signal?.explanation)
        })).filter((signal) => signal.value || signal.explanation),
        corroboratingReferenceIds: unique(connector?.evidence?.corroboratingReferenceIds || []).map(String),
        caveat: text(connector?.evidence?.caveat)
      },
      provenance: {
        method: text(connector?.provenance?.method, "literal-alias-match"),
        source: text(connector?.provenance?.source),
        reviewStatus: text(connector?.provenance?.reviewStatus, "assistant-analyzed-pending-human-review"),
        generatedAt: text(connector?.provenance?.generatedAt)
      }
    }];
  });
}

export function normalizeSongReferenceGraphEdges(edges = []) {
  const seen = new Set();
  return list(edges).flatMap((edge) => {
    const fromReferenceId = text(edge?.fromReferenceId);
    const toReferenceId = text(edge?.toReferenceId);
    const relationType = text(edge?.relationType, "thematic-resonance");
    const id = text(edge?.id, `${fromReferenceId}:${relationType}:${toReferenceId}`);
    if (!id || !fromReferenceId || !toReferenceId || fromReferenceId === toReferenceId || seen.has(id)) return [];
    seen.add(id);
    return [{
      schemaVersion: SONG_REFERENCE_GRAPH_EDGE_SCHEMA,
      id,
      fromReferenceId,
      toReferenceId,
      relationType,
      evidenceClass: text(edge?.evidenceClass, "source-backed-comparative"),
      score: Math.max(0, Math.min(1, Number(edge?.score ?? 0.5))),
      sharedMechanics: unique(edge?.sharedMechanics || []).map(String),
      sharedThemes: unique(edge?.sharedThemes || []).map(String),
      rationale: text(edge?.rationale),
      traversalEffect: text(edge?.traversalEffect),
      provenance: {
        sourceIds: unique(edge?.provenance?.sourceIds || []).map(String),
        method: text(edge?.provenance?.method, "cross-corpus-comparison"),
        reviewStatus: text(edge?.provenance?.reviewStatus, "assistant-analyzed-pending-human-review"),
        generatedAt: text(edge?.provenance?.generatedAt)
      }
    }];
  });
}

export function normalizeSongContextLayers(layers = []) {
  const seen = new Set();
  return list(layers).flatMap((layer) => {
    const id = text(layer?.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      schemaVersion: SONG_CONTEXT_LAYER_SCHEMA,
      id,
      label: text(layer.label, id),
      summary: text(layer.summary),
      referenceIds: unique(layer.referenceIds || []).map(String),
      connectorIds: unique(layer.connectorIds || []).map(String),
      changesExpositionBy: text(layer.changesExpositionBy),
      opensTraversalTo: unique(layer.opensTraversalTo || []).map(String),
      reviewStatus: text(layer.reviewStatus, "assistant-analyzed-pending-human-review")
    }];
  });
}

export function normalizeEchoSemanticTraversal(input = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return {
    schemaVersion: ECHO_SEMANTIC_TRAVERSAL_SCHEMA,
    title: text(input.title, "Echo Album contextual traversal notes"),
    thesis: text(input.thesis),
    expositionModel: list(input.expositionModel).map((item) => ({
      stage: text(item?.stage),
      availableContext: unique(item?.availableContext || []).map(String),
      reading: text(item?.reading),
      traversalBehavior: text(item?.traversalBehavior)
    })).filter((item) => item.stage || item.reading),
    traversalRules: unique(input.traversalRules || []).map(String),
    contextAnchors: list(input.contextAnchors).map((anchor) => ({
      id: text(anchor?.id),
      label: text(anchor?.label),
      summary: text(anchor?.summary),
      referenceIds: unique(anchor?.referenceIds || []).map(String),
      source: text(anchor?.source),
      reviewStatus: text(anchor?.reviewStatus, "conversation-grounded-soft-context")
    })).filter((anchor) => anchor.id),
    generatedAt: text(input.generatedAt),
    reviewStatus: text(input.reviewStatus, "assistant-analyzed-pending-human-review")
  };
}

export function referenceCatalogIndex(catalog = []) {
  return new Map(normalizeSongReferenceCatalog(catalog).map((reference) => [reference.id, reference]));
}
