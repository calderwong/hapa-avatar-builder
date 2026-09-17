function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value || "").trim();
}

function digest(value) {
  return text(value).replace(/^sha256:/i, "").toLowerCase();
}

function referenceVisualDescription(item = {}) {
  const parts = [
    item.prompt,
    item.sourcePrompt,
    item.summary,
    item.memoryHook,
    item.reviewPrompt,
    item.connection?.why,
    ...list(item.retrievalTags),
  ].map(text).filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? {
    text: unique.join("\n"),
    sourceClass: "reference-card-enriched-prompt",
  } : null;
}

/** Convert the live Reference Media projection into Director candidates. */
export function buildReferenceLoopDirectorCandidates(library = {}, options = {}) {
  const sourceImageRunId = text(options.sourceImageRunId);
  return list(library.items)
    .filter((item) => item?.loopVideo?.uri && (!sourceImageRunId || text(item.source?.runId) === sourceImageRunId))
    .map((item, index) => {
      const sha256 = digest(item.loopVideo.hash);
      const sourceRunId = text(item.source?.runId);
      const sourceJobId = text(item.source?.jobId);
      const cardId = text(item.referenceKey || item.id);
      const sourceSongs = list(item.songs).map((song) => ({
        id: text(song?.id),
        title: text(song?.title),
      })).filter((song) => song.id || song.title);
      const visualDescription = referenceVisualDescription(item);
      return {
        id: `builder-reference-run:${sourceRunId}:${sourceJobId}`,
        mediaLibraryId: sha256 ? `hapa-media:sha256:${sha256}` : `reference-loop:${sourceRunId}:${sourceJobId}`,
        cardId,
        cardKind: "reference",
        cardRef: `runtime:echo-reference-media-library#${encodeURIComponent(item.id)}`,
        cardTitle: text(item.title || item.referenceTitle || cardId),
        ownerId: cardId,
        ownerTitle: text(item.title || item.referenceTitle || cardId),
        title: `${text(item.title || item.referenceTitle || cardId)} · local H3 loop`,
        type: "video",
        uri: text(item.loopVideo.uri),
        runtimeUri: text(item.loopVideo.uri),
        posterUri: text(item.image?.uri),
        sha256,
        technicalIdentity: sha256 ? `sha256:${sha256}` : `reference-loop:${sourceRunId}:${sourceJobId}`,
        duration: 5,
        width: 512,
        height: 768,
        fps: 24,
        sourceGroup: "reference",
        cohort: "reference-media-live-local-h3",
        analyzerRole: "loop",
        motionRole: "loop",
        authoredUse: "hold",
        authoredRoles: ["reference-card-loop", "ambient-hold"],
        semanticTags: [...new Set([text(item.referenceTitle), ...list(item.retrievalTags)].filter(Boolean))],
        sourceSongIds: sourceSongs.map((song) => song.id).filter(Boolean),
        sourceSongTitles: sourceSongs.map((song) => song.title).filter(Boolean),
        visualDescription,
        visualContextBasis: "Reference Card generation prompt, review rationale, memory hook, and retrieval tags informed soft lyric-to-visual weighting; no semantic truth is claimed.",
        generationPromptHash: text(item.source?.promptHash),
        loopPipeline: {
          runId: text(item.loopVideo?.runId),
          provider: text(item.loopVideo?.provider),
          model: text(item.loopVideo?.model),
          mode: text(item.loopVideo?.mode),
          profileId: text(item.loopVideo?.profileId),
        },
        routeOrder: index,
        autoEligible: true,
        availability: { exists: true, bytes: 1, basis: "completed-local-h3-manifest-output" },
        bytesAvailable: true,
        technical: {
          status: "verified-source-file",
          availability: { exists: true, bytes: 1 },
          width: 512,
          height: 768,
          durationSec: 5,
          fps: 24,
          codec: "h264",
          pixelFormat: "yuv420p",
          identityBasis: sha256 ? "sha256" : "immutable-source-run-job",
          contentHash: sha256 ? { algorithm: "sha256", value: sha256 } : null,
        },
        origin: {
          sourceSystem: "hapa-avatar-builder",
          sourceStore: "runtime:echo-reference-media-library",
          sourceNode: "Reference Media",
          sourceRunId,
          sourceJobId,
          loopRunId: text(item.loopVideo?.runId),
          loopProvider: text(item.loopVideo?.provider),
          loopModel: text(item.loopVideo?.model),
          loopUri: text(item.loopVideo.uri),
        },
      };
    })
    .sort((left, right) => left.routeOrder - right.routeOrder || left.id.localeCompare(right.id));
}
