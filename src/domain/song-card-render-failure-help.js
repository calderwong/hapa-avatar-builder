import { isPortableVisualizerAttachment } from "./portable-visualizer-card.js";

const rows = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function readableSongCardFailureValue(value, fallback = "", depth = 0, seen = new Set()) {
  if (value === null || value === undefined || value === "") return String(fallback || "");
  if (typeof value === "string") return value.trim() || String(fallback || "");
  if (["number", "bigint", "boolean"].includes(typeof value)) return String(value);
  if (value instanceof Error) return readableSongCardFailureValue(value.message || value.name, fallback, depth + 1, seen);
  if (typeof value !== "object" || depth > 5 || seen.has(value)) return String(fallback || "");
  seen.add(value);
  if (Array.isArray(value)) {
    const rendered = value.slice(0, 6)
      .map((row) => readableSongCardFailureValue(row, "", depth + 1, seen))
      .filter(Boolean)
      .join("; ");
    return rendered || String(fallback || "");
  }
  const entries = Object.entries(value);
  for (const priorityKey of ["message", "summary", "reason", "detail", "description", "code", "error", "status"]) {
    const match = entries.find(([key]) => key.toLowerCase() === priorityKey);
    const rendered = match ? readableSongCardFailureValue(match[1], "", depth + 1, seen) : "";
    if (rendered) return rendered;
  }
  const rendered = entries.slice(0, 4)
    .map(([key, nested]) => {
      const detail = readableSongCardFailureValue(nested, "", depth + 1, seen);
      return detail ? `${key.replace(/[-_]+/g, " ")}: ${detail}` : "";
    })
    .filter(Boolean)
    .join(" · ");
  return rendered || String(fallback || "");
}

export function normalizeSongCardRenderFailure(payload = {}, fallback = {}) {
  const supplied = payload?.failure && typeof payload.failure === "object"
    ? payload.failure
    : payload?.error && typeof payload.error === "object"
      ? payload.error
      : {};
  const details = supplied.details && typeof supplied.details === "object"
    ? supplied.details
    : payload?.details && typeof payload.details === "object"
      ? payload.details
      : fallback?.details && typeof fallback.details === "object"
        ? fallback.details
        : {};
  return {
    code: readableSongCardFailureValue(
      supplied.code || (typeof payload?.error === "string" ? payload.error : "") || fallback.code,
      "local_render_failed",
    ),
    message: readableSongCardFailureValue(
      supplied.message || payload?.message || fallback.message,
      "The final-video render stopped before completion.",
    ),
    stage: readableSongCardFailureValue(supplied.stage || details.stage || fallback.stage, "render"),
    retryable: supplied.retryable !== false && fallback.retryable !== false,
    details,
  };
}

const MAX_RENDER_FAILURE_EVIDENCE = 192;
const EVIDENCE_KEYS = new Set([
  "blocker", "blockers", "category", "cause", "causes", "code", "error", "errors",
  "failure", "failures", "inputrole", "kind", "reason", "stage", "status", "type", "unresolved",
]);
const IGNORED_EVIDENCE_KEYS = new Set([
  "command", "diagnostic", "diagnostics", "log", "logs", "message", "output", "stack", "stderr", "stdout",
]);

function collectEvidence(value, key = "", output = [], seen = new Set(), depth = 0, trustedPrimitive = false) {
  if (value === null || value === undefined || output.length >= MAX_RENDER_FAILURE_EVIDENCE || depth > 7) return output;
  const normalizedKey = String(key || "").replace(/[-_\s]+/g, "").toLowerCase();
  if (IGNORED_EVIDENCE_KEYS.has(normalizedKey)) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    if (depth === 0 || trustedPrimitive || EVIDENCE_KEYS.has(normalizedKey)) output.push(String(value).toLowerCase());
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const row of value) {
      collectEvidence(row, key, output, seen, depth + 1, EVIDENCE_KEYS.has(normalizedKey));
      if (output.length >= MAX_RENDER_FAILURE_EVIDENCE) break;
    }
    return output;
  }
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    collectEvidence(nestedValue, nestedKey, output, seen, depth + 1, false);
    if (output.length >= MAX_RENDER_FAILURE_EVIDENCE) break;
  }
  return output;
}

const failureEvidence = (failure = {}) => collectEvidence(failure).filter(Boolean).join(" ");

function findDetachedVisualizerEvidence(value, parentKey = "", seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 7) return null;
  seen.add(value);
  const normalizedParentKey = String(parentKey || "").replace(/[-_\s]+/g, "").toLowerCase();
  if (Array.isArray(value)) {
    if (normalizedParentKey.includes("detachedvisualizer")) {
      const direct = value.find((row) => row && typeof row === "object" && !Array.isArray(row));
      if (direct) return direct;
    }
    for (const row of value) {
      const nested = findDetachedVisualizerEvidence(row, parentKey, seen, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  const rowEvidence = [value.reason, value.code, value.status, value.portableCardStatus]
    .map((row) => String(row || "").toLowerCase())
    .join(" ");
  const hasCardIdentity = Boolean(value.cardId || value.card || value.sourceId || value.source || value.sourceTitle || value.title);
  if (hasCardIdentity && (normalizedParentKey.includes("detachedvisualizer")
    || /portable[_-](?:visualizer[_-])?(?:truth[_-]detached|card[_-]missing|card[_-]missing[_-]or[_-]unbound)|missing[_-]for[_-]requested[_-]source/.test(rowEvidence))) {
    return value;
  }
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nested = findDetachedVisualizerEvidence(nestedValue, nestedKey, seen, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function optionalSeconds(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function formatTime(value) {
  const totalSeconds = optionalSeconds(value);
  if (totalSeconds === null) return "";
  const rounded = Math.round(totalSeconds * 100) / 100;
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded - (minutes * 60);
  let secondsLabel = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (seconds < 10) secondsLabel = `0${secondsLabel}`;
  return `${minutes}:${secondsLabel}`;
}

function detachedVisualizerTarget(failure = {}) {
  const row = findDetachedVisualizerEvidence(failure);
  if (!row) return null;
  const sourceTitle = String(row.sourceTitle || row.visualizerTitle || row.title || "").trim();
  const sourceId = String(row.sourceId || row.source || row.visualizerId || "").trim();
  const cardId = String(row.cardId || row.card || row.cueId || "").trim();
  const reason = String(row.reason || row.status || "").trim();
  const startSeconds = optionalSeconds(row.startSeconds ?? row.start);
  const endSeconds = optionalSeconds(row.endSeconds ?? row.end);
  const range = startSeconds !== null && endSeconds !== null
    ? `${formatTime(startSeconds)}–${formatTime(endSeconds)} (${Math.round(startSeconds * 100) / 100}–${Math.round(endSeconds * 100) / 100}s)`
    : startSeconds !== null
      ? `from ${formatTime(startSeconds)} (${Math.round(startSeconds * 100) / 100}s)`
      : endSeconds !== null
        ? `through ${formatTime(endSeconds)} (${Math.round(endSeconds * 100) / 100}s)`
        : "";
  const name = sourceTitle || sourceId || "Selected shader";
  return {
    name,
    range,
    label: range ? `${name} · ${range}` : name,
    technicalDetail: [cardId && `card ${cardId}`, sourceId && `source ${sourceId}`, reason].filter(Boolean).join(" · "),
  };
}

function detachedVisualizersFromSelectedCut(showGraph = {}, project = {}) {
  const graph = Array.isArray(showGraph?.tracks)
    ? showGraph
    : Array.isArray(project?.director_show_graph?.tracks)
      ? project.director_show_graph
      : {};
  const timeline = rows(project?.visualizer_timeline);
  let visualizerIndex = 0;
  return rows(graph.tracks).flatMap((track) => rows(track?.cards).flatMap((card) => {
    if (!(track?.role === "visualizer" || track?.id === "track-b" || track?.id === "ivf-stack")) return [];
    const rowIndex = visualizerIndex;
    visualizerIndex += 1;
    const sourceId = String(card?.visualization?.sourceId || card?.visualization?.requestedSourceId || card?.visualization?.card?.id || card?.media?.id || "").trim();
    if (card?.disabled === true || card?.knockedOut === true || card?.knocked_out === true || sourceId.toLowerCase() === "none") return [];
    const portable = card?.visualization?.card || {};
    if (isPortableVisualizerAttachment(card)) return [];
    const startSeconds = optionalSeconds(card.startSeconds ?? card.start_sec ?? card.start);
    const endSeconds = optionalSeconds(card.endSeconds ?? card.end_sec ?? card.end);
    const matchingTimelineRow = timeline.find((row) => {
      const rowSourceId = String(row?.visualizer_id || row?.visualizerId || "").trim();
      const rowStart = optionalSeconds(row?.start_sec ?? row?.startSeconds);
      const rowEnd = optionalSeconds(row?.end_sec ?? row?.endSeconds);
      const sourceMatches = sourceId && rowSourceId === sourceId;
      const rangeMatches = startSeconds !== null && endSeconds !== null && rowStart !== null && rowEnd !== null
        && Math.abs(rowStart - startSeconds) < 0.01 && Math.abs(rowEnd - endSeconds) < 0.01;
      return sourceMatches && (rangeMatches || startSeconds === null || rowStart === null);
    }) || timeline[rowIndex] || {};
    const sourceTitle = String(
      portable.title || card.visualization?.title || card.visualization?.nativeKey || card.media?.title
      || matchingTimelineRow.visualizer_title || matchingTimelineRow.visualizerTitle || "",
    ).trim();
    return [{
      cardId: String(card.id || "").trim(),
      sourceId: sourceId || String(matchingTimelineRow.visualizer_id || matchingTimelineRow.visualizerId || "").trim(),
      sourceTitle,
      ...(startSeconds !== null ? { startSeconds } : {}),
      ...(endSeconds !== null ? { endSeconds } : {}),
      reason: String(card.provenance?.portableCardStatus || card.visualization?.status || card.provenance?.reason || "portable-visualizer-card-missing-or-unbound").trim(),
    }];
  }));
}

function selectedCutMatchesRenderCandidate(context = {}) {
  const candidateVariant = String(context.candidate?.variantId || context.candidate?.variant_id || "").trim();
  if (!candidateVariant) return false;
  const selectedVariants = [
    context.showGraph?.directorV2?.variantId,
    context.project?.director_show_graph?.directorV2?.variantId,
    context.project?.active_direction_script_variant?.id,
    context.project?.activeDirectionScriptVariant?.id,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const aliases = (value) => value.startsWith("working:") ? [value, value.slice("working:".length)] : [value, `working:${value}`];
  const candidateAliases = new Set(aliases(candidateVariant));
  return selectedVariants.some((value) => aliases(value).some((alias) => candidateAliases.has(alias)));
}

export function explainSongCardRenderFailure(failure = {}, context = {}) {
  const normalized = normalizeSongCardRenderFailure({}, failure);
  const storedDetachedVisualizer = detachedVisualizerTarget(normalized);
  const originalEvidence = failureEvidence(normalized);
  const contextualInferenceAllowed = /signal[_-]graph[_-]preflight|portable[_-]visualizer|detached[_-]visualizer|shader[_-]route|visualizer[_-]route/.test(originalEvidence)
    && selectedCutMatchesRenderCandidate(context);
  const inferredDetachedVisualizers = !storedDetachedVisualizer && contextualInferenceAllowed
    ? detachedVisualizersFromSelectedCut(context.showGraph, context.project)
    : [];
  const contextualFailure = inferredDetachedVisualizers.length
    ? { ...normalized, details: { ...(normalized.details || {}), detachedVisualizers: inferredDetachedVisualizers } }
    : normalized;
  const evidence = failureEvidence(contextualFailure);
  const detachedVisualizer = storedDetachedVisualizer || detachedVisualizerTarget(contextualFailure);
  const rebuildFromSavedCut = /portable[_-](?:visualizer[_-])?(?:truth[_-]detached|card[_-]missing|card[_-]missing[_-]or[_-]unbound)|detached[_-]visualizers?[_-]present|missing[_-]for[_-]requested[_-]source/.test(evidence);
  if (/renderer[_-]build|build[_-]changed|delivery[_-]runtime/.test(evidence)) return {
    category: "renderer-build",
    title: "The Builder changed during this render check.",
    nextAction: "Let the current Builder update finish, then choose Retry render. The next attempt will certify one stable renderer before video work starts.",
  };
  if (/source[_-]input[_-]changed|source[_-]snapshot|stale|changed[_-]during|managed[_-]master[_-]hash[_-]mismatch|release[_-]checkpoint[_-]mismatch/.test(evidence)) return {
    category: "source-changed",
    title: "A source file changed while the cut was being checked.",
    nextAction: "Choose Retry render after the edit or media update finishes. The Builder will take a fresh, consistent snapshot; the saved edit is intact.",
  };
  if (rebuildFromSavedCut || /shader|visualizer|portable[_-]card|proxy|renderer[_-]truth/.test(evidence)) {
    const affectedSelection = detachedVisualizer
      ? `${detachedVisualizer.name}${detachedVisualizer.range ? ` at ${detachedVisualizer.range}` : ""}`
      : "the edited shader";
    return {
      category: "shader-route",
      title: rebuildFromSavedCut ? "The edited shader is detached from its final-render card." : "A shader or visualization route is not ready for final rendering.",
      ...(rebuildFromSavedCut ? {
        summary: `${detachedVisualizer?.name || "The edited shader"} lost its final-render attachment. Your saved edit is intact, and no MP4 work started.`,
        rawFailureMessage: normalized.message,
      } : {}),
      nextAction: rebuildFromSavedCut
        ? `Choose Rebuild from saved cut. The Builder will reattach ${affectedSelection} from this saved edit, then ask you to review the replacement before rendering. No edition was minted.`
        : "Refresh the cut after shader repair or certification completes, then choose Retry render. The Builder will not substitute an unverified effect.",
      ...(detachedVisualizer ? { affectedShader: detachedVisualizer.label, technicalDetail: detachedVisualizer.technicalDetail } : {}),
      ...(rebuildFromSavedCut ? {
        rebuildFromSavedCut: true,
        buttonLabel: "Rebuild from saved cut",
        buttonTitle: "Rebuild this candidate from the saved cut, then review it before rendering",
      } : {}),
    };
  }
  if (/audio|master|stem|telemetry/.test(evidence)) return {
    category: "audio-stems",
    title: "The song audio or one of its selected stems did not pass verification.",
    nextAction: "Repair or reconnect the named audio source, then choose Retry render. No MP4 work will start until every required audio input passes.",
  };
  if (/visual[_-]media|media[_-]preflight|media[_-]offline|video[_-]decode|poster/.test(evidence)) return {
    category: "visual-media",
    title: "A video or image used by this cut could not be verified.",
    nextAction: "Restore or replace the named visual, then choose Retry render. The Builder will recheck the whole cut before encoding.",
  };
  if (/enospc|disk|memory|enomem|heap|sigkill|sigterm|killed/.test(evidence) || /disk|memory/.test(normalized.message.toLowerCase())) return {
    category: "local-resources",
    title: "The local finishing process ran out of available resources.",
    nextAction: "Free disk space or close memory-heavy apps, then choose Retry render. Verified work from the same edit can be reused.",
  };
  return {
    category: "render",
    title: "The final-video render stopped before completion.",
    nextAction: normalized.retryable
      ? "Choose Retry render to run the same approved edit again. No edition was minted."
      : "This attempt cannot be retried as-is. Choose Retry plan to prepare a clean candidate from the saved edit.",
  };
}
