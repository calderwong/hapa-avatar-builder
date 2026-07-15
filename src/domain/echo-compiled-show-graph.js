import { contentHash } from "./echo-director-v2.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

const text = (value) => String(value ?? "").trim();
const SHA256_HEX = /^[0-9a-f]{64}$/;

export const ECHO_COMPILED_SHOW_GRAPH_SCHEMA = "hapa.echo.compiled-show-graph-validation.v1";

function projectBody(input) {
  return input?.music_video_project || input?.project || input || {};
}

export function canonicalEchoCompiledVariantBody(graph = {}) {
  const { runId: _runId, ...graphBody } = graph || {};
  const {
    variantId: _variantId,
    variantHash: _variantHash,
    mediaDiversityReport: _mediaDiversityReport,
    ...directorV2
  } = graphBody.directorV2 || {};
  return { ...graphBody, directorV2 };
}

export function reidentifyEchoCompiledShowGraph(graph = {}) {
  const identified = structuredClone(graph || {});
  const variantHash = contentHash(canonicalEchoCompiledVariantBody(identified));
  identified.runId = `echo-v2:${variantHash.slice(0, 20)}`;
  identified.directorV2 = {
    ...(identified.directorV2 || {}),
    variantId: `variant:${variantHash.slice(0, 20)}`,
    variantHash,
  };
  return identified;
}

function isSha256Hex(value) {
  return SHA256_HEX.test(text(value));
}

function declaredOutputProfile(container = {}) {
  const value = container?.outputProfile ?? container?.output_profile;
  return {
    declared: Boolean(value !== undefined && value !== null && text(value)),
    profile: resolveEchoOutputProfile(value),
  };
}

/**
 * Shared truth boundary for compiled Echo graphs. The API and the project-wide
 * readiness sweep must reject exactly the same stale or misrouted artifacts.
 */
export function validateEchoCompiledShowGraph({ project = {}, graph = {} } = {}) {
  const sourceProject = projectBody(project);
  const projectOutputProfile = resolveEchoOutputProfile(
    sourceProject?.output_profile ?? sourceProject?.outputProfile,
  );
  const graphOutputProfileDeclaration = declaredOutputProfile(graph);
  const directorOutputProfileDeclaration = declaredOutputProfile(graph?.directorV2);
  const graphOutputProfile = graphOutputProfileDeclaration.profile;
  const directorOutputProfile = directorOutputProfileDeclaration.profile;
  const graphSongId = text(graph?.song?.id);
  const expectedSongIds = [...new Set([
    sourceProject.song_id,
    sourceProject.audio_id,
    sourceProject.registry_track_id,
  ].map(text).filter(Boolean))];
  const visualizerTrack = (Array.isArray(graph?.tracks) ? graph.tracks : [])
    .find((track) => track?.role === "visualizer" || track?.id === "track-b");
  const variantId = text(graph?.directorV2?.variantId);
  const variantHash = text(graph?.directorV2?.variantHash);
  const declaredSourceProjectHash = text(graph?.directorV2?.source?.sourceProjectHash);
  const provenanceSourceProjectHash = text(graph?.directorV2?.provenance?.sourceProjectHash);
  const expectedSourceProjectHash = contentHash(sourceProject);
  const inputHashes = graph?.directorV2?.source?.inputHashes;
  const inputHashEntries = inputHashes && typeof inputHashes === "object" && !Array.isArray(inputHashes)
    ? Object.entries(inputHashes)
    : [];
  const invalidInputHashPaths = inputHashEntries.length
    ? inputHashEntries
      .filter(([, value]) => !isSha256Hex(value))
      .map(([key]) => `directorV2.source.inputHashes.${key}`)
    : ["directorV2.source.inputHashes"];
  const expectedVariantHash = isSha256Hex(variantHash)
    ? contentHash(canonicalEchoCompiledVariantBody(graph))
    : null;
  const reasons = [];
  if (graph?.schemaVersion !== "hapa.music-viz.native-show-graph.v2") reasons.push("unexpected_graph_schema");
  if (!graphSongId || !expectedSongIds.includes(graphSongId)) reasons.push("graph_song_identity_mismatch");
  if (!visualizerTrack || !Array.isArray(visualizerTrack.cards)) reasons.push("visualizer_track_missing");
  if (graphOutputProfile.id !== projectOutputProfile.id) reasons.push("graph_output_profile_mismatch");
  if (directorOutputProfile.id !== projectOutputProfile.id) reasons.push("director_output_profile_mismatch");
  if (graphOutputProfileDeclaration.declared
    && directorOutputProfileDeclaration.declared
    && graphOutputProfile.id !== directorOutputProfile.id) {
    reasons.push("graph_director_output_profile_mismatch");
  }
  if (!variantId || !variantHash) reasons.push("director_variant_identity_missing");
  if (variantHash && !isSha256Hex(variantHash)) reasons.push("director_variant_hash_invalid");
  if (isSha256Hex(variantHash) && variantId !== `variant:${variantHash.slice(0, 20)}`) reasons.push("director_variant_identity_mismatch");
  if (expectedVariantHash && variantHash !== expectedVariantHash) reasons.push("director_variant_hash_mismatch");
  if (!declaredSourceProjectHash || !provenanceSourceProjectHash) reasons.push("source_project_hash_missing");
  if ((declaredSourceProjectHash && !isSha256Hex(declaredSourceProjectHash))
    || (provenanceSourceProjectHash && !isSha256Hex(provenanceSourceProjectHash))) {
    reasons.push("source_project_hash_invalid");
  }
  if (isSha256Hex(declaredSourceProjectHash) && declaredSourceProjectHash !== expectedSourceProjectHash) {
    reasons.push("source_project_hash_mismatch");
  }
  if (isSha256Hex(declaredSourceProjectHash)
    && isSha256Hex(provenanceSourceProjectHash)
    && declaredSourceProjectHash !== provenanceSourceProjectHash) {
    reasons.push("source_project_hash_lineage_mismatch");
  }
  if (invalidInputHashPaths.length) reasons.push("source_input_hash_invalid");
  return {
    schemaVersion: ECHO_COMPILED_SHOW_GRAPH_SCHEMA,
    ok: reasons.length === 0,
    reasons,
    graphSchemaVersion: graph?.schemaVersion || null,
    graphSongId: graphSongId || null,
    expectedSongIds,
    projectOutputProfile,
    graphOutputProfile,
    directorOutputProfile,
    variantId: variantId || null,
    variantHash: variantHash || null,
    expectedVariantHash,
    sourceProjectHash: declaredSourceProjectHash || null,
    provenanceSourceProjectHash: provenanceSourceProjectHash || null,
    expectedSourceProjectHash,
    invalidInputHashPaths,
    visualizerCards: Array.isArray(visualizerTrack?.cards) ? visualizerTrack.cards.length : 0,
  };
}
