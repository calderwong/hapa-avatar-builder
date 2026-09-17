import { hydrateEchoMediaEvidence, echoEvidenceStamp } from "./echo-media-evidence-index.mjs";
import { hydrateEchoObservedContent } from "./echo-catalog-observation-reader.mjs";
import { hasExcludedEchoDirectorOrigin } from "../src/domain/echo-media-source-policy.js";
import { stat } from "node:fs/promises";
import path from "node:path";
import { resolveEchoRuntimeMediaUri } from "./echo-runtime-media-route.mjs";
import { resolveEchoReferenceMediaAsset } from "./echo-reference-media-library.mjs";
import { inspectEchoTimelineMediaEligibility, echoMediaConstraintError } from "../src/domain/echo-media-eligibility.js";
import { echoDirectionVariantFingerprint, echoDirectionVariantId } from "../src/domain/echo-direction-variants.js";
import { isEchoMediaEvidenceProjectionCurrent } from "../src/domain/unified-media-catalog.js";

/** Metadata attached after preparation changes the delivered cut fingerprint.
 * Rebind only a previously valid sidecar whose complete media/time identity
 * still matches. Never bless a stale or different shot source. */
export function rebindEchoMediaEvidenceAfterMetadata(before, after) {
  const sources=new Map((before.direction_script_variants||[]).map(variant=>[echoDirectionVariantId(variant),variant]));
  return {...after,direction_script_variants:(after.direction_script_variants||[]).map(variant=>{
    const original=sources.get(echoDirectionVariantId(variant)),projection=original?.canonical_media_evidence;
    if(!projection||!isEchoMediaEvidenceProjectionCurrent(original.timeline,projection,echoDirectionVariantFingerprint(original)))return variant;
    const fingerprint=echoDirectionVariantFingerprint(variant),updated={...projection,sourceFingerprint:fingerprint};
    if(!isEchoMediaEvidenceProjectionCurrent(variant.timeline,updated,fingerprint))return variant;
    return {...variant,canonical_media_evidence:updated};
  })};
}

async function resolveEchoForkMediaSourceUri(uri, paths = {}) {
  const value = String(uri || "").trim();
  try {
    const pathname = new URL(value, "http://hapa.local").pathname;
    const match = pathname.match(/^\/api\/echos\/reference-media\/assets\/(image|loop)\/([^/]+)\/([^/]+)$/u);
    if (match) {
      const resolver = paths.resolveReferenceAsset || resolveEchoReferenceMediaAsset;
      const asset = await resolver(match[1], decodeURIComponent(match[2]), decodeURIComponent(match[3])).catch(() => null);
      return asset?.filePath
        ? { ok: true, reason: null, uri: value, route: "echo-reference-media-api", resolvedPath: path.resolve(asset.filePath) }
        : { ok: false, reason: "echo-reference-media-runtime-route-unresolved", uri: value, resolvedPath: null };
    }
  } catch {
    return { ok: false, reason: "echo-fork-runtime-uri-invalid", uri: value, resolvedPath: null };
  }
  return resolveEchoRuntimeMediaUri(value, paths);
}

/** Validate current local bytes without trusting request-supplied availability.
 * No decode or analysis is performed; final render preflight still owns those.
 * Single flight by URI, at most four stat operations active per request. */
export async function prepareEchoTimelineMediaEvidence(timeline, paths = {}) {
  const [evidenceIndex,observations] = await Promise.all([
    paths.mediaEvidenceReader ? paths.mediaEvidenceReader.get() : { status: "unavailable", reason: "canonical-index-not-configured" },
    paths.mediaEvidenceReader?.getObservedContent?.() || {status:"unavailable",reason:"observation-index-not-configured"},
  ]);
  timeline = hydrateEchoMediaEvidence(timeline, evidenceIndex);
  const resolved = new Map();
  const proof = async uri => {
    if (!resolved.has(uri)) resolved.set(uri, (async () => {
      const route = await resolveEchoForkMediaSourceUri(uri, paths);
      if (!route.ok) return { exists: null, bytes: null, reason: route.reason };
      try {
        const info = await stat(route.resolvedPath);
        return { exists: info.isFile(), bytes: info.size, stamp: echoEvidenceStamp(info), sourceAllowed: !hasExcludedEchoDirectorOrigin({sourcePath:route.resolvedPath}), decodeVerified: false };
      } catch (error) {
        return { exists: false, bytes: 0, reason: error.code || "source-unavailable" };
      }
    })());
    return resolved.get(uri);
  };
  const prepared = new Array(timeline.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, timeline.length) }, async () => {
    while (next < timeline.length) {
      const index = next++;
      const shot = timeline[index];
      if (shot.media_id === "none" || shot.knockedOut === true) { prepared[index] = hydrateEchoObservedContent(shot,null,{status:"unavailable",reason:"generated-media-has-no-catalog-observation"},{}); continue; }
      const contract = shot.media_contract || shot.mediaContract || {};
      const uri = shot.runtime_media_uri || contract.runtimeUri || shot.media_uri || contract.originalUri || "";
      const availability = await proof(uri);
      const currentEvidence = shot.identityEvidence?.mediaStamps?.includes(availability.stamp);
      const identities = currentEvidence ? {} : { characterIds: [], sceneIds: [], cast: null,
        identityEvidence: { ...shot.identityEvidence, status: shot.identityEvidence?.status === "canonical-declarations" ? "source-bytes-changed-or-unverified" : shot.identityEvidence?.status } };
      const sourceAllowed=shot.sourceAllowed!==false && contract.sourceAllowed!==false && availability.sourceAllowed!==false;
      const current = { ...shot, ...identities, sourceAllowed, availability, media_contract: { ...contract, ...identities, sourceAllowed, availability } };
      prepared[index] = hydrateEchoObservedContent(current,observations.status==="ready"?observations.lookup(uri,shot.media_id):null,observations,availability);
    }
  }));
  return { timeline: prepared, sourcesChecked: resolved.size,
    canonicalEvidence: { status: evidenceIndex.status, revision: evidenceIndex.revision || null, visualVerified: false },
    observedContent: {status:observations.status,revision:observations.revision||null,reason:observations.reason||null,continuousCoverage:false} };
}

export async function validateEchoForkMedia(timeline, constraints = {}, paths = {}) {
  const preparation = await prepareEchoTimelineMediaEvidence(timeline, paths);
  const results = inspectEchoTimelineMediaEligibility(preparation.timeline, { ...constraints, requireVerifiedBytes: true, requireVerifiedPolicyForBans: true });
  const rejected = results.filter(item => !item.eligible);
  if (rejected.length) throw echoMediaConstraintError(rejected, { stage: "save-fork" });
  return { schemaVersion: "hapa.echo.fork-media-availability.v1", mediaShots: results.length,
    sourcesChecked: preparation.sourcesChecked, byteAvailabilityVerified: true, decodeVerified: false,
    canonicalEvidence: preparation.canonicalEvidence,
    preparedTimeline: preparation.timeline,
    pendingEvidence: [...new Set(results.flatMap(item => item.pendingEvidence))] };
}
