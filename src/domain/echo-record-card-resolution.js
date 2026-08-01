import { buildLocalEchoRecordCardProjection } from "./echo-record-garden.js";
import {
  latestSongCardEdition,
  resolveAuthoritativeTarotSongCardPrint,
} from "./song-card-tarot-print.js";

export const ECHO_RECORD_CARD_RESOLUTION_SCHEMA = "hapa.echo-record-garden.card-resolution.v1";

const MAX_COMPLETED_RESOLUTIONS = 48;

function text(value = "") {
  return typeof value === "string" ? value.trim() : "";
}

function finiteMilliseconds(value = 0) {
  return Math.max(0, Math.round(Number(value) * 1000) || 0);
}

function projectSongId(project = {}) {
  const source = project?.music_video_project || project?.project?.music_video_project || project?.project || project;
  return text(source?.song_id || source?.songId || source?.id);
}

function apiRoot(apiBase = "") {
  return text(apiBase).replace(/\/+$/, "");
}

function resolutionError(code, message, status = 0) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function statusToken(value = "") {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
}

export function echoRecordVisualCardPolicy(visual = {}) {
  const rights = visual.rights && typeof visual.rights === "object" ? visual.rights : {};
  const consentStatus = statusToken(rights.consentStatus);
  const licenseStatus = statusToken(rights.licenseStatus);
  const blockedConsent = new Set(["blocked", "declined", "denied", "not-approved", "revoked"]);
  const blockedLicense = new Set(["blocked", "denied", "no-license", "prohibited", "revoked"]);
  if (visual.attachment?.stale === true || statusToken(visual.attachment?.freshnessStatus) === "stale") {
    return {
      allowed: false,
      code: "stale_attachment_blocked",
      reason: "This visual points to a stale Card attachment. Refresh its source identity before generating a Card.",
      reviewRequired: true,
    };
  }
  if (blockedConsent.has(consentStatus) || blockedLicense.has(licenseStatus)) {
    return {
      allowed: false,
      code: "rights_or_consent_blocked",
      reason: "Card generation is blocked by the source rights or consent record.",
      reviewRequired: true,
    };
  }
  const reviewRequired = rights.status !== "source-declared"
    || ["", "unknown", "pending", "pending-review", "review-required"].includes(consentStatus)
    || ["", "unknown", "pending", "pending-review", "review-required"].includes(licenseStatus);
  return {
    allowed: true,
    code: reviewRequired ? "rights_review_required" : "rights_cleared",
    reason: reviewRequired
      ? "Local use is available, but public release still requires rights and consent review."
      : "The source declares a non-blocking rights and consent state.",
    reviewRequired,
  };
}

async function responseJson(response, code, label) {
  try {
    return await response.json();
  } catch {
    throw resolutionError(code, `${label} did not return valid JSON.`, Number(response?.status || 0));
  }
}

function isTimedDirectorVisual(visual = {}) {
  return visual.sourceType === "director-shot"
    || (visual.clockLocked === true && ["now-playing", "up-next"].includes(visual.role));
}

export function echoRecordVisualTimestampMs(visual = {}, clockSeconds = 0) {
  if (visual.role === "up-next" && Number.isFinite(Number(visual.startSeconds))) {
    return finiteMilliseconds(visual.startSeconds);
  }
  return finiteMilliseconds(clockSeconds);
}

export function echoRecordVisualAttachmentId(visual = {}) {
  return text(
    visual.attachment?.cardId
    || visual.provenance?.mediaCardId
    || visual.attachment?.card?.id
    || visual.card?.id
    || visual.attachment?.lookupId
    || visual.mediaId
    || visual.sourceId
  );
}

function embeddedVisualCard(visual = {}) {
  const candidate = visual.attachment?.card || visual.card || null;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) && text(candidate.id)
    ? candidate
    : null;
}

function resolutionKey({ visual = {}, project = {}, clockSeconds = 0 } = {}) {
  const songId = text(visual.songId) || projectSongId(project);
  const timestampMs = isTimedDirectorVisual(visual)
    ? echoRecordVisualTimestampMs(visual, clockSeconds)
    : 0;
  return [
    songId,
    text(visual.id),
    text(visual.role),
    echoRecordVisualAttachmentId(visual),
    timestampMs,
  ].join("|");
}

function resolvedCard({
  card,
  mode,
  requestKey,
  songId = "",
  timestampMs = 0,
  receipt = null,
}) {
  return {
    schemaVersion: ECHO_RECORD_CARD_RESOLUTION_SCHEMA,
    card,
    mode,
    truthStatus: mode,
    requestKey,
    songId: songId || null,
    timestampMs,
    receipt,
    cached: false,
  };
}

async function resolveTimedDirectorCard({
  fetchImpl,
  base,
  visual,
  project,
  clockSeconds,
  requestKey,
  signal,
}) {
  if (!isTimedDirectorVisual(visual)) return null;
  const songId = text(visual.songId) || projectSongId(project);
  if (!songId) return null;
  const headResponse = await fetchImpl(`${base}/api/song-cards/${encodeURIComponent(songId)}`, { signal });
  if (!headResponse.ok) {
    if (Number(headResponse.status) === 404) return null;
    throw resolutionError(
      "song_card_lookup_failed",
      `Song Card lookup failed (${headResponse.status}).`,
      Number(headResponse.status || 0),
    );
  }
  const headPayload = await responseJson(headResponse, "song_card_lookup_invalid", "Song Card lookup");
  const edition = latestSongCardEdition(headPayload);
  if (!(edition > 0)) return null;

  const timestampMs = echoRecordVisualTimestampMs(visual, clockSeconds);
  const atTimeResponse = await fetchImpl(
    `${base}/api/song-cards/${encodeURIComponent(songId)}/editions/${edition}/cards-at-time?timeMs=${timestampMs}`,
    { signal },
  );
  if (!atTimeResponse.ok) {
    throw resolutionError(
      "song_card_timestamp_lookup_failed",
      `Song Card timestamp lookup failed (${atTimeResponse.status}).`,
      Number(atTimeResponse.status || 0),
    );
  }
  const cardsAtTime = await responseJson(
    atTimeResponse,
    "song_card_timestamp_lookup_invalid",
    "Song Card timestamp lookup",
  );
  const primary = cardsAtTime.primary || cardsAtTime.active?.[cardsAtTime.active.length - 1] || null;
  if (!primary?.snapshot && !primary?.card) {
    throw resolutionError(
      "no_printable_card",
      "The immutable Song Card edition has no printable Card at this visual timestamp.",
      404,
    );
  }

  const printResponse = await fetchImpl(
    `${base}/api/song-cards/${encodeURIComponent(songId)}/editions/${edition}/print`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        timeMs: timestampMs,
        appearanceId: primary.appearanceId || primary.id || "",
        surface: "echo-record-garden",
      }),
    },
  );
  if (!printResponse.ok) {
    throw resolutionError(
      "authoritative_song_card_print_failed",
      `Authoritative Song Card print failed (${printResponse.status}).`,
      Number(printResponse.status || 0),
    );
  }
  const printResult = await responseJson(
    printResponse,
    "authoritative_song_card_print_invalid",
    "Authoritative Song Card print",
  );
  const resolution = resolveAuthoritativeTarotSongCardPrint({
    headPayload,
    cardsAtTime,
    printResult,
    songId,
    timestampMs,
  });
  return resolvedCard({
    card: resolution.card,
    mode: "authoritative-edition-print",
    requestKey,
    songId,
    timestampMs,
    receipt: resolution.receipt,
  });
}

function rememberCompleted(cache, key, value) {
  cache.set(key, value);
  while (cache.size > MAX_COMPLETED_RESOLUTIONS) {
    cache.delete(cache.keys().next().value);
  }
}

export function createEchoRecordVisualCardResolver({
  apiBase = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Echo Record Card resolution requires fetch.");
  const base = apiRoot(apiBase);
  const completed = new Map();
  const pending = new Map();
  let generation = 0;

  const resolve = ({ visual, project, clockSeconds = 0 } = {}) => {
    if (!visual?.id) {
      return Promise.reject(resolutionError("visual_missing", "Choose a source-linked visual first."));
    }
    const requestKey = resolutionKey({ visual, project, clockSeconds });
    if (completed.has(requestKey)) {
      return Promise.resolve({ ...completed.get(requestKey), cached: true });
    }
    if (pending.has(requestKey)) return pending.get(requestKey).promise;

    const operationGeneration = generation;
    const controller = new AbortController();
    const operation = (async () => {
      const policy = echoRecordVisualCardPolicy(visual);
      if (!policy.allowed) throw resolutionError(policy.code, policy.reason, 403);
      const authoritative = await resolveTimedDirectorCard({
        fetchImpl,
        base,
        visual,
        project,
        clockSeconds,
        requestKey,
        signal: controller.signal,
      });
      if (authoritative) return authoritative;

      const embedded = embeddedVisualCard(visual);
      if (embedded) {
        return resolvedCard({
          card: embedded,
          mode: "embedded-source-card",
          requestKey,
          songId: text(visual.songId) || projectSongId(project),
        });
      }

      const attachmentId = echoRecordVisualAttachmentId(visual);
      if (attachmentId && attachmentId !== "none") {
        const response = await fetchImpl(
          `${base}/api/tarot/card/${encodeURIComponent(attachmentId)}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const card = await responseJson(response, "attached_card_invalid", "Attached Card lookup");
          if (!text(card?.id)) {
            throw resolutionError("attached_card_identity_missing", "Attached Card lookup returned no Card identity.");
          }
          return resolvedCard({
            card,
            mode: "attached-source-card",
            requestKey,
            songId: text(visual.songId) || projectSongId(project),
          });
        }
        if (Number(response.status) !== 404) {
          throw resolutionError(
            "attached_card_lookup_failed",
            `Attached Card lookup failed (${response.status}).`,
            Number(response.status || 0),
          );
        }
        if (visual.resolutionPolicy === "exact-id-or-fail") {
          throw resolutionError(
            "attached_card_exact_lookup_failed",
            `Attached Hapa Card ${attachmentId} was not found; exact Preview printing will not substitute another Card.`,
            404,
          );
        }
      }

      const localCard = buildLocalEchoRecordCardProjection({
        visual,
        project,
        clockSeconds,
      });
      if (!localCard) {
        throw resolutionError(
          "local_card_projection_unavailable",
          "This visual does not have enough source context for a local Card projection.",
        );
      }
      return resolvedCard({
        card: localCard,
        mode: "local-unminted-projection",
        requestKey,
        songId: text(visual.songId) || projectSongId(project),
        timestampMs: finiteMilliseconds(clockSeconds),
      });
    })();

    pending.set(requestKey, { promise: operation, controller });
    operation.then((value) => {
      if (generation === operationGeneration) rememberCompleted(completed, requestKey, value);
      if (pending.get(requestKey)?.promise === operation) pending.delete(requestKey);
    }, () => {
      if (pending.get(requestKey)?.promise === operation) pending.delete(requestKey);
    });
    return operation;
  };

  resolve.cancel = ({ visual, project, clockSeconds = 0 } = {}) => {
    if (!visual?.id) return false;
    const requestKey = resolutionKey({ visual, project, clockSeconds });
    const entry = pending.get(requestKey);
    if (!entry) return false;
    entry.controller.abort();
    pending.delete(requestKey);
    return true;
  };
  resolve.cancelVisual = (visualId = "") => {
    const expectedId = text(visualId);
    if (!expectedId) return false;
    let cancelled = false;
    for (const [requestKey, entry] of pending) {
      if (requestKey.split("|")[1] !== expectedId) continue;
      entry.controller.abort();
      pending.delete(requestKey);
      cancelled = true;
    }
    return cancelled;
  };
  resolve.clear = () => {
    generation += 1;
    pending.forEach((entry) => entry.controller.abort());
    completed.clear();
    pending.clear();
  };
  resolve.inspect = () => ({
    completed: completed.size,
    pending: pending.size,
  });
  return resolve;
}
