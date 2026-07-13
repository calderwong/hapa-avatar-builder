import { contextHash } from "./song-context-packet.js";
import {
  VISUALIZER_RENDERER_RECEIPT_SCHEMA,
  buildVisualizerRendererTruthReceipt,
} from "./visualizer-renderer-capability.js";

export const RELEASE_RENDERER_TRUTH_SCHEMA = "hapa.show.release-renderer-truth.v1";

function graphVisualizerCards(showGraph = null) {
  return (showGraph?.tracks || []).flatMap((track) => (track.cards || []).filter((card) => card?.visualization));
}

function buildReleaseRendererTruth({ showGraph = null, rendererTruthReceipts = null, rendererTruthOptions = {} } = {}) {
  const receipts = Array.isArray(rendererTruthReceipts)
    ? structuredClone(rendererTruthReceipts)
    : graphVisualizerCards(showGraph).map((card) => buildVisualizerRendererTruthReceipt(card, rendererTruthOptions));
  const validReceipts = receipts.filter((receipt) => receipt?.schemaVersion === VISUALIZER_RENDERER_RECEIPT_SCHEMA && receipt?.ok === true);
  const silentDefaultCount = validReceipts.reduce((sum, receipt) => sum + Number(receipt.silentDefaultCount || 0), 0);
  const allStatesVisible = validReceipts.length > 0 && validReceipts.every((receipt) => receipt.allStatesVisible === true);
  return {
    schemaVersion: RELEASE_RENDERER_TRUTH_SCHEMA,
    receiptSchemaVersion: VISUALIZER_RENDERER_RECEIPT_SCHEMA,
    status: receipts.length ? "declared" : "not-supplied",
    cueReceiptCount: receipts.length,
    validReceiptCount: validReceipts.length,
    allStatesVisible,
    silentDefaultCount,
    ok: receipts.length > 0 && validReceipts.length === receipts.length && allStatesVisible && silentDefaultCount === 0,
    receipts,
  };
}

export function buildReleaseManifest({
  song,
  approvedVariant,
  artifacts = [],
  rights,
  contextRef,
  graphRef,
  showGraph = null,
  qaReceipts = [],
  rendererTruthReceipts = null,
  rendererTruthOptions = {},
} = {}) {
  const rendererTruth = buildReleaseRendererTruth({ showGraph, rendererTruthReceipts, rendererTruthOptions });
  const manifest = {
    schemaVersion: "hapa.show.release-package.v1",
    song,
    approvedVariant,
    artifacts,
    graphRef,
    contextRef,
    qaReceipts,
    rendererTruth,
    rights: {
      licensingStatus: rights?.licensingStatus || "unknown",
      consentStatus: rights?.consentStatus || "unknown",
      attribution: rights?.attribution || [],
    },
    offlineReplay: { requiredFiles: artifacts.map((row) => row.path).concat([graphRef, contextRef]), verified: false },
    publishGate: {
      technicalApproval: Boolean(approvedVariant?.technicalApprovalReceipt),
      creativeApproval: Boolean(approvedVariant?.creativeApprovalReceipt),
      licensingKnown: Boolean(rights?.licensingStatus && rights.licensingStatus !== "unknown"),
      consentKnown: Boolean(rights?.consentStatus && rights.consentStatus !== "unknown"),
      rendererTruthVisible: rendererTruth.ok,
    },
  };
  manifest.publishGate.allowed = Object.values(manifest.publishGate).every(Boolean);
  manifest.packageHash = contextHash(manifest);
  return manifest;
}

export function verifyReleaseManifest(manifest, fileIndex = {}) {
  const missing = manifest.offlineReplay.requiredFiles.filter((file) => !fileIndex[file]?.exists);
  const hashFailures = manifest.artifacts.filter((artifact) => fileIndex[artifact.path]?.sha256 !== artifact.sha256).map((artifact) => artifact.path);
  const transformFailures = manifest.artifacts.filter((artifact) => artifact.role !== "poster" && !artifact.transform);
  const rightsFieldsPresent = Boolean(manifest.rights.licensingStatus && manifest.rights.consentStatus && Array.isArray(manifest.rights.attribution));
  const rendererTruthValid = Boolean(
    manifest.rendererTruth?.schemaVersion === RELEASE_RENDERER_TRUTH_SCHEMA
    && manifest.rendererTruth?.ok === true
    && manifest.rendererTruth?.allStatesVisible === true
    && Number(manifest.rendererTruth?.silentDefaultCount || 0) === 0,
  );
  return {
    schemaVersion: "hapa.show.release-verification.v1",
    ok: missing.length === 0 && hashFailures.length === 0 && transformFailures.length === 0 && rightsFieldsPresent,
    missing,
    hashFailures,
    transformFailures: transformFailures.map((row) => row.path),
    rightsFieldsPresent,
    rendererTruthValid,
    rendererTruth: manifest.rendererTruth,
    offlineReplay: missing.length === 0,
    publishAllowed: manifest.publishGate.allowed,
  };
}

export function createNativeShowCard(manifest, { manifestPath, posterPath, songCard = null } = {}) {
  return {
    schemaVersion: "hapa.music-viz.native-show-card.v2",
    id: `native-show-card:${manifest.approvedVariant.variantId}`,
    title: manifest.song.title,
    songId: manifest.song.id,
    durationSeconds: manifest.song.durationSeconds,
    posterPath,
    releaseManifest: { path: manifestPath, hash: manifest.packageHash },
    songCard: songCard ? {
      headId: songCard.headId || songCard.id,
      editionId: songCard.editionId || null,
      edition: Number(songCard.edition || 0),
      semanticFingerprint: songCard.semanticFingerprint || null,
      relationship: "lightweight-runtime-child",
      ownsRenderedMaster: false,
    } : null,
    showGraph: { path: manifest.graphRef, schemaVersion: "hapa.music-viz.native-show-graph.v2", variantId: manifest.approvedVariant.variantId },
    rendererTruth: {
      schemaVersion: manifest.rendererTruth?.schemaVersion || RELEASE_RENDERER_TRUTH_SCHEMA,
      status: manifest.rendererTruth?.status || "not-supplied",
      cueReceiptCount: Number(manifest.rendererTruth?.cueReceiptCount || 0),
      allStatesVisible: manifest.rendererTruth?.allStatesVisible === true,
      silentDefaultCount: Number(manifest.rendererTruth?.silentDefaultCount || 0),
    },
    openWith: { app: "hapa-music-viz-native", action: "open-release-manifest" },
    embeddedOriginals: false,
    embeddedScripts: false,
    discovery: { cardType: "native-show", tags: ["music-video", "director-v2", "dear-papa"] },
    publishStatus: manifest.publishGate.allowed ? "publishable" : "review-candidate-blocked",
  };
}
